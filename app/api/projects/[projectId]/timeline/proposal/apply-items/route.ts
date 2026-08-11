/**
 * POST /api/projects/[projectId]/timeline/proposal/apply-items
 *
 * Resuelve POR ÍTEM la propuesta de cronograma pendiente (la que deja regenerar el handoff):
 *   { accept: string[], discard: string[], merge: string[] }   ← claves de delta de
 *   lib/timeline/proposal-deltas
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
 *
 * `merge` (Tanda O) — un ADD_PHASE con `mergeCandidateId` (el aviso de "esta fase nueva puede
 * ser esta huérfana con otro nombre", ver reconcile-proposal.ts) se resuelve como FUSIÓN en vez
 * de creación: la huérfana se actualiza campo por campo con el contenido propuesto (nunca sus
 * `tasks`, nunca su posición — ya ocupa su lugar en el cronograma real). `merge` gana sobre
 * `accept`/`discard` si una clave viene repetida en más de un array.
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
import { projectedEnd, describeEndShift } from "@/lib/timeline/weeks";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

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
  const body = (raw ?? {}) as { accept?: unknown; discard?: unknown; merge?: unknown };
  const keys = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && !!k) : [];
  const acceptKeys = new Set(keys(body.accept));
  const discardKeys = new Set(keys(body.discard));
  const mergeKeys = new Set(keys(body.merge));
  for (const k of acceptKeys) discardKeys.delete(k); // aceptar gana si viene en ambas
  for (const k of mergeKeys) { acceptKeys.delete(k); discardKeys.delete(k); } // fusionar gana sobre las dos
  if (acceptKeys.size === 0 && discardKeys.size === 0 && mergeKeys.size === 0) {
    return NextResponse.json({ error: "Nada que resolver (accept/discard/merge vacíos)" }, { status: 400 });
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

  // Fusionar: solo válido para un ADD_PHASE que trae mergeCandidateId (el botón "Fusionar" del
  // Gantt no se pinta sin uno). Clave desconocida, delta que no es ADD_PHASE, o candidata que ya
  // no existe (`computeProposalDeltas` la resuelve a null si la huérfana se borró entre la
  // propuesta y ahora) → stale, mismo trato que un accept/discard fuera de fecha.
  const merged: Array<{ delta: Extract<ProposalDelta, { kind: "ADD_PHASE" }>; targetId: string }> = [];
  for (const k of mergeKeys) {
    const d = byKey.get(k);
    if (d && d.kind === "ADD_PHASE" && d.mergeCandidateId) merged.push({ delta: d, targetId: d.mergeCandidateId });
    else staleKeys.push(k);
  }
  const mergedTargetIds = new Set(merged.map((m) => m.targetId));

  // OJO: acá va `merged` (los que de verdad van a mutar algo), NO `mergeKeys` crudo — una
  // clave de merge que resultó stale (candidata borrada, delta que no es ADD_PHASE) no puede
  // marcarse "resuelta": haría desaparecer una sugerencia genuina del pendingProposal sin
  // haberla creado NI descartado.
  const resolvedKeys = new Set(
    [...acceptKeys, ...discardKeys, ...merged.map((m) => m.delta.key)].filter((k) => byKey.has(k)),
  );

  // Validar ANTES de abrir la transacción: un enum inválido debe salir como 400 legible, no
  // como un error de Prisma a mitad de la escritura.
  for (const d of [...accepted, ...merged.map((m) => m.delta)]) {
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
  /* La foto de ANTES, tomada fuera de la transacción: después de aplicar ya no se puede saber
     dónde caía el cierre, y sin las dos puntas no hay corrimiento que reportar (Tanda J). */
  const anchorAntes = tl.anchorStartDate?.toISOString() ?? null;
  const fasesAntes = tl.phases.map((p) => ({ durationWeeks: p.durationWeeks, startWeek: p.startWeek }));
  const anchorAceptado = accepted.some((d) => d.kind === "SET_ANCHOR");

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

    // 1a-merge) FUSIONAR: la huérfana candidata (elegida a mano por el CSE con "Fusionar", nunca
    //     automático) se actualiza campo por campo con el contenido de la fase propuesta — nunca
    //     `tasks`, nunca `order`: ya ocupa su lugar en el cronograma real, no se crea ningún slot
    //     nuevo (por eso `merged` no entra a `acceptedKeySet` / `buildPhaseOrder` de abajo).
    for (const { delta, targetId } of merged) {
      await tx.timelinePhase.update({
        where: { id: targetId },
        data: {
          name: delta.phase.name,
          durationWeeks: delta.phase.durationWeeks,
          startWeek: delta.phase.startWeek ?? null,
          sessionCount: delta.phase.sessionCount ?? null,
          notes: delta.phase.notes ?? null,
          activityType: parseActivityType(delta.phase.activityType) ?? null,
        },
      });
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
        // La trampa del snapshot viejo (Tanda O): la huérfana fusionada tiene una entrada acá
        // con SU id, pero nunca tuvo un delta `mod:<id>` (antes de la fusión su contenido era
        // idéntico al real — cero delta). Sin este `mergedTargetIds.has`, el `!resolvedKeys.has`
        // de abajo la trataría como "sin resolver" y reescribiría encima el snapshot de ANTES
        // de fusionar (nombre viejo) — deshaciendo visualmente la fusión que la transacción
        // recién aplicó, un paso más arriba.
        if (!resolvedKeys.has(`mod:${p.id}`) && !mergedTargetIds.has(p.id)) pendingModByPhase.set(p.id, p);
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
        // Aceptar Y fusionar cambian el cronograma real → marca "cambios sin subir". Un
        // descarte puro no (nada se escribió).
        ...(accepted.length > 0 || merged.length > 0 ? { lastEditedByHuman: now } : {}),
      },
    });
  }, { maxWait: 10000, timeout: 30000 });

  // Audit best-effort POST-tx (mismo patrón que phases/[phaseId]/apply): solo si se aplicó algo
  // (aceptar O fusionar — las dos mutan el cronograma real).
  if (accepted.length > 0 || merged.length > 0) {
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
      /* El corrimiento del cierre entra en la RAZÓN (Tanda J): la línea de auditoría decía
         cuántas sugerencias se aceptaron, no qué consecuencia tuvieron. Quien la lea después
         —o el watchdog— necesita saber si el proyecto se corrió. */
      const anchorDespues = tlRow?.anchorStartDate?.toISOString() ?? null;
      const corrimiento = describeEndShift(
        projectedEnd(anchorAntes, fasesAntes),
        projectedEnd(anchorDespues, snapPhases),
      );
      await prisma.timelineChange.create({
        data: {
          timelineId: tl.id,
          reason:
            `Sugerencias del handoff aceptadas por ítem (${accepted.length} aceptadas, ${discardKeys.size} descartadas` +
            (merged.length > 0 ? `, ${merged.length} fusionadas` : "") +
            `).` +
            (corrimiento ? ` ${corrimiento}` : ""),
          kind: "AI_ASSIST",
          instruction: null,
          changedByEmail: guard.user.email ?? null,
          snapshot: {
            anchorStartDate: anchorDespues,
            phases: snapPhases,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      /* ── EL HUECO QUE ESTO CIERRA (Tanda J) ─────────────────────────────────
         Aceptar un `SET_ANCHOR` acá movía TODAS las fechas del proyecto sin emitir
         `ANCHOR_CHANGED`. El PUT del cronograma sí lo emite; este camino no, así que el
         watchdog —el único escritor de CsAlert— no se enteraba nunca de que el arranque se
         había movido por una sugerencia del handoff. El cierre viaja en before/after (son
         Json, no hace falta ningún enum nuevo). */
      if (anchorAceptado && (anchorAntes ?? null) !== (anchorDespues ?? null)) {
        const proj = await prisma.project.findUnique({
          where: { id: projectId },
          select: { clientId: true },
        });
        if (proj) {
          await emitTimelineEventsSafe(
            prisma,
            {
              projectId,
              clientId: proj.clientId,
              timelineId: tl.id,
              actorEmail: guard.user.email ?? null,
              source: "AI_ASSIST_APPLY",
            },
            [
              {
                entityType: "TIMELINE",
                entityId: tl.id,
                label: "Fecha de arranque (sugerencia del handoff aceptada)",
                action: "ANCHOR_CHANGED",
                before: { anchorStartDate: anchorAntes, projectedEnd: projectedEnd(anchorAntes, fasesAntes).label },
                after: { anchorStartDate: anchorDespues, projectedEnd: projectedEnd(anchorDespues, snapPhases).label },
              },
            ],
          );
        }
      }
    } catch (e) {
      console.error("[proposal/apply-items] audit best-effort falló:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    applied: accepted.length,
    discarded: [...discardKeys].filter((k) => byKey.has(k)).length,
    merged: merged.length,
    stale: staleKeys,
  });
}
