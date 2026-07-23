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
import { Prisma, type TimelineActivityType } from "@prisma/client";
import {
  computeProposalDeltas,
  buildPhaseOrder,
  type ProposalLike,
  type ProposalDelta,
} from "@/lib/timeline/proposal-deltas";
import { ACTIVITY_TYPES } from "@/lib/timeline/validate";

/**
 * `activityType` es un ENUM de Prisma y la propuesta es JSON sin tipar: un valor basura
 * llegaría hasta la DB y reventaría con un error crudo. Se valida contra la MISMA lista que
 * usan el PUT del cronograma y el assist. Devuelve `undefined` = inválido (→ 400).
 */
function parseActivityType(v: unknown): TimelineActivityType | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === "string" && (ACTIVITY_TYPES as readonly string[]).includes(v)
    ? (v as TimelineActivityType)
    : undefined;
}

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

  // Validar ANTES de abrir la transacción: un enum inválido debe salir como 400 legible, no
  // como un error de Prisma a mitad de la escritura.
  for (const d of accepted) {
    const raw =
      d.kind === "ADD_PHASE"
        ? d.phase.activityType
        : d.kind === "MODIFY_PHASE"
          ? d.changes.find((c) => c.field === "activityType")?.to
          : undefined;
    if (raw !== undefined && parseActivityType(raw) === undefined) {
      return NextResponse.json(
        { error: `Tipo de actividad inválido en la sugerencia: ${String(raw)}` },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const acceptedKeySet = new Set(accepted.map((d) => d.key));

  await prisma.$transaction(async (tx) => {
    // 1) Aplicar los ACEPTADOS (solo esos; nada se aplica solo).
    //    Cambios de contenido y anchor primero; el ORDEN se resuelve al final de una sola vez,
    //    porque insertar fases y reordenarlas se pisan entre sí si se hacen por separado.
    for (const d of accepted) {
      if (d.kind === "MODIFY_PHASE") {
        // Campo por campo y tipado: el allowlist de `PhaseField` ya acota qué puede cambiar,
        // pero escribirlo explícito evita meter claves arbitrarias en el update de Prisma.
        const data: Prisma.TimelinePhaseUpdateInput = {};
        for (const c of d.changes) {
          if (c.field === "name") data.name = String(c.to);
          else if (c.field === "durationWeeks") data.durationWeeks = Number(c.to);
          else if (c.field === "startWeek") data.startWeek = c.to === null ? null : Number(c.to);
          else if (c.field === "sessionCount") data.sessionCount = c.to === null ? null : Number(c.to);
          else if (c.field === "notes") data.notes = c.to === null ? null : String(c.to);
          else if (c.field === "activityType") data.activityType = parseActivityType(c.to) ?? null;
        }
        await tx.timelinePhase.update({ where: { id: d.phaseId }, data });
      } else if (d.kind === "SET_ANCHOR") {
        await tx.projectTimeline.update({
          where: { id: tl.id },
          data: { anchorStartDate: new Date(d.to) },
        });
      }
    }

    // 1b) ORDEN FINAL (helper puro): las fases nuevas aceptadas caen EN SU LUGAR (después de su
    //     fase previa en la propuesta, no al final) y, si se aceptó el reordenamiento, las
    //     existentes se reacomodan. Las fases nuevas nacen VACÍAS; las tareas se detallan
    //     después con "regenerar solo esta fase" (PhaseRegenModal).
    //     NB: el `order` resultante queda DENSO (0..N-1). Es deliberado: normalizar mantiene el
    //     índice consistente con la posición visual y hace idempotente el próximo cálculo. Solo
    //     se escribe la fila si su orden cambió de verdad (la transacción no toca lo que no debe).
    const slots = buildPhaseOrder(tl.phases, proposal, acceptedKeySet);
    for (const [i, slot] of slots.entries()) {
      if (slot.kind === "new") {
        await tx.timelinePhase.create({
          data: {
            timelineId: tl.id,
            name: slot.phase.name,
            order: i,
            durationWeeks: slot.phase.durationWeeks,
            startWeek: slot.phase.startWeek ?? null,
            sessionCount: slot.phase.sessionCount ?? null,
            notes: slot.phase.notes ?? null,
            activityType: parseActivityType(slot.phase.activityType) ?? null,
            source: "AGENT", // propuesta por la IA, confirmada por el humano
          },
        });
      } else {
        // Solo escribir si el orden cambió (evita filas tocadas de más en la transacción).
        const prev = tl.phases.find((p) => p.id === slot.id);
        if (prev && prev.order !== i) {
          await tx.timelinePhase.update({ where: { id: slot.id }, data: { order: i } });
        }
      }
    }

    // 2) Reescribir la propuesta guardada de forma CANÓNICA contra el estado post-aplicación:
    //    - la SECUENCIA pasa a ser la del cronograma real, así un reordenamiento ya resuelto
    //      (aceptado O descartado) no se vuelve a proponer solo en la próxima lectura;
    //    - cada fase conserva el contenido PROPUESTO solo si su sugerencia sigue pendiente
    //      (si se aceptó, la DB ya lo tiene; si se descartó, gana la DB);
    //    - las fases nuevas no resueltas se reinsertan detrás de su fase ancla.
    const phasesAfter = await tx.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: PHASE_SELECT,
    });
    const tlAfter = await tx.projectTimeline.findUnique({
      where: { id: tl.id },
      select: { anchorStartDate: true },
    });

    const pendingModByPhase = new Map<string, (typeof proposal.phases)[number]>();
    const keptNewByAnchor = new Map<string | null, (typeof proposal.phases)[number][]>();
    proposal.phases.forEach((p, i) => {
      if (p.id) {
        if (!resolvedKeys.has(`mod:${p.id}`)) pendingModByPhase.set(p.id, p);
        return;
      }
      if (resolvedKeys.has(`add:${i}`)) return;
      let anchorId: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const q = proposal.phases[j];
        if (q?.id) {
          anchorId = q.id;
          break;
        }
      }
      const arr = keptNewByAnchor.get(anchorId) ?? [];
      arr.push(p);
      keptNewByAnchor.set(anchorId, arr);
    });

    const rebuilt: (typeof proposal.phases)[number][] = [...(keptNewByAnchor.get(null) ?? [])];
    for (const ph of phasesAfter) {
      rebuilt.push(pendingModByPhase.get(ph.id) ?? { ...ph });
      rebuilt.push(...(keptNewByAnchor.get(ph.id) ?? []));
    }

    const keptAnchor = resolvedKeys.has("anchor") ? null : proposal.anchorStartDate;
    const rewritten: ProposalLike = { anchorStartDate: keptAnchor, phases: rebuilt };

    // ¿Queda algún delta vivo? Si no, la propuesta se limpia entera (las fases re-emitidas
    // idénticas no son deltas — solo eran el "no borrar" del PUT del modelo viejo).
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
