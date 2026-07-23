/**
 * POST /api/projects/[projectId]/timeline/proposal/apply-items
 *
 * Resuelve POR ÍTEM la propuesta de cronograma pendiente (la que deja regenerar el handoff):
 *   { accept: string[], discard: string[] }   ← claves de delta de lib/timeline/proposal-deltas
 *
 * El modelo "diff EN el Gantt real": la propuesta ya no se aplica todo-o-nada con un PUT del
 * árbol completo — cada sugerencia (fase nueva / cambio de fase / fecha de arranque) se acepta o
 * descarta sola. Aceptar escribe SOLO ese cambio (las tareas y estados jamás se tocan: los deltas
 * son phase-level por construcción); descartar solo lo saca de la propuesta. Los ítems resueltos
 * se quitan de `pendingProposal`; cuando no queda ningún delta, la propuesta se limpia entera.
 *
 * "Aceptar todo" / "Descartar todo" del banner = este mismo endpoint con todas las claves.
 * Deltas con clave desconocida/stale (el cronograma cambió desde que el cliente pintó) se
 * ignoran y se reportan. Guarded con guardTimelineEdit (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  computeProposalDeltas,
  type ProposalLike,
  type ProposalDelta,
} from "@/lib/timeline/proposal-deltas";

const PHASE_SELECT = {
  id: true,
  name: true,
  order: true,
  durationWeeks: true,
  startWeek: true,
  sessionCount: true,
  notes: true,
  activityType: true,
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as { accept?: unknown; discard?: unknown };
  const keys = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && !!k) : [];
  const acceptKeys = new Set(keys(body.accept));
  const discardKeys = new Set(keys(body.discard));
  for (const k of acceptKeys) discardKeys.delete(k); // aceptar gana si viene en ambas
  if (acceptKeys.size === 0 && discardKeys.size === 0) {
    return NextResponse.json({ error: "Nada que resolver (accept/discard vacíos)" }, { status: 400 });
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      pendingProposal: true,
      phases: { orderBy: { order: "asc" }, select: PHASE_SELECT },
    },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });
  const proposal = tl.pendingProposal as ProposalLike | null;
  if (!proposal || !Array.isArray(proposal.phases)) {
    return NextResponse.json({ error: "No hay propuesta pendiente" }, { status: 400 });
  }

  const deltas = computeProposalDeltas(
    tl.phases,
    proposal,
    tl.anchorStartDate?.toISOString() ?? null,
  );
  const byKey = new Map(deltas.map((d) => [d.key, d]));
  const accepted: ProposalDelta[] = [];
  const staleKeys: string[] = [];
  for (const k of acceptKeys) {
    const d = byKey.get(k);
    if (d) accepted.push(d);
    else staleKeys.push(k);
  }
  for (const k of discardKeys) if (!byKey.has(k)) staleKeys.push(k);
  const resolvedKeys = new Set([...acceptKeys, ...discardKeys].filter((k) => byKey.has(k)));

  const now = new Date();
  let maxOrder = tl.phases.reduce((m, p) => Math.max(m, p.order), -1);

  await prisma.$transaction(async (tx) => {
    // 1) Aplicar los ACEPTADOS (solo esos; nada se aplica solo).
    for (const d of accepted) {
      if (d.kind === "ADD_PHASE") {
        // La fase nueva nace VACÍA al final (el orden fino se arrastra en el Gantt); las tareas
        // se detallan después con "regenerar solo esta fase" (PhaseRegenModal).
        await tx.timelinePhase.create({
          data: {
            timelineId: tl.id,
            name: d.phase.name,
            order: ++maxOrder,
            durationWeeks: d.phase.durationWeeks,
            startWeek: d.phase.startWeek ?? null,
            sessionCount: d.phase.sessionCount ?? null,
            notes: d.phase.notes ?? null,
            activityType: (d.phase.activityType as never) ?? null,
            source: "AGENT", // propuesta por la IA, confirmada por el humano
          },
        });
      } else if (d.kind === "MODIFY_PHASE") {
        const data: Record<string, unknown> = {};
        for (const c of d.changes) data[c.field] = c.to;
        await tx.timelinePhase.update({ where: { id: d.phaseId }, data });
      } else if (d.kind === "SET_ANCHOR") {
        await tx.projectTimeline.update({
          where: { id: tl.id },
          data: { anchorStartDate: new Date(d.to) },
        });
      }
    }

    // 2) Reescribir la propuesta guardada SIN los ítems resueltos (aceptados o descartados).
    //    Las claves son deterministas contra la propuesta guardada (add:<índice> / mod:<id> /
    //    anchor), así cliente y server siempre hablan de lo mismo.
    const keptPhases = proposal.phases.filter((p, i) => {
      const key = p.id ? `mod:${p.id}` : `add:${i}`;
      return !resolvedKeys.has(key);
    });
    const keptAnchor = resolvedKeys.has("anchor") ? null : proposal.anchorStartDate;
    const rewritten: ProposalLike = { anchorStartDate: keptAnchor, phases: keptPhases };

    // ¿Queda algún delta vivo contra el estado POST-aplicación? Si no, la propuesta se limpia
    // entera (las fases re-emitidas idénticas no son deltas — solo eran el "no borrar" del PUT).
    const phasesAfter = await tx.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: PHASE_SELECT,
    });
    const tlAfter = await tx.projectTimeline.findUnique({
      where: { id: tl.id },
      select: { anchorStartDate: true },
    });
    const remaining = computeProposalDeltas(
      phasesAfter,
      rewritten,
      tlAfter?.anchorStartDate?.toISOString() ?? null,
    );

    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: {
        ...(remaining.length === 0
          ? { pendingProposal: Prisma.DbNull, pendingProposalRunId: null }
          : { pendingProposal: rewritten as unknown as Prisma.InputJsonValue }),
        // Solo aceptar cambia el cronograma real → marca "cambios sin subir". Un descarte puro no.
        ...(accepted.length > 0 ? { lastEditedByHuman: now } : {}),
      },
    });
  }, { maxWait: 10000, timeout: 30000 });

  // Audit best-effort POST-tx (mismo patrón que phases/[phaseId]/apply): solo si se aplicó algo.
  if (accepted.length > 0) {
    try {
      const snapPhases = await prisma.timelinePhase.findMany({
        where: { timelineId: tl.id },
        orderBy: { order: "asc" },
        select: {
          ...PHASE_SELECT,
          status: true,
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: { id: true, title: true, weekIndex: true, order: true, status: true },
          },
        },
      });
      const tlRow = await prisma.projectTimeline.findUnique({
        where: { id: tl.id },
        select: { anchorStartDate: true },
      });
      await prisma.timelineChange.create({
        data: {
          timelineId: tl.id,
          reason: `Sugerencias del handoff aceptadas por ítem (${accepted.length} aceptadas, ${discardKeys.size} descartadas).`,
          kind: "AI_ASSIST",
          instruction: null,
          changedByEmail: guard.user.email ?? null,
          snapshot: {
            anchorStartDate: tlRow?.anchorStartDate?.toISOString() ?? null,
            phases: snapPhases,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error("[proposal/apply-items] audit best-effort falló:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    applied: accepted.length,
    discarded: [...discardKeys].filter((k) => byKey.has(k)).length,
    stale: staleKeys,
  });
}
