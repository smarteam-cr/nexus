/**
 * lib/timeline/reconcile-proposal.ts
 *
 * Tanda M (2026-08-10) — extraído de `persistTimelineFromAgentOutput`
 * (app/api/clients/[id]/analyze/route.ts), donde vivía inline sin tests, en un
 * archivo de 3000+ líneas. Reconcilia las fases que propone el agente de handoff
 * contra las fases YA existentes de un `ProjectTimeline` — nunca las pisa: cada
 * fase propuesta toma el id de la existente que matchea (por nombre normalizado,
 * si no por posición), y las existentes sin match se re-emiten idénticas (modo
 * aditivo: un re-run nunca borra una fase con progreso).
 *
 * Puro (sin Prisma, sin fetch) — el resolver del ancla (¿usar la existente o
 * derivarla del kickoff?) sigue viviendo en el caller porque ese fallback SÍ
 * pega a la base; acá solo se compara el resultado ya resuelto contra el
 * existente para decidir `isNoOp`.
 */

export interface ExistingPhaseForReconcile {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
}

export interface AgentProposedPhase {
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
}

export interface ReconciledPhase {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType?: string | null;
}

export interface ReconcileResult {
  phases: ReconciledPhase[];
  anchorStartDate: string | null;
  /** true = mismos ids, mismo orden, mismos campos, mismo ancla que lo existente — no hay
   *  nada nuevo que mostrarle al CSE. El caller no debe guardar `pendingProposal` en ese caso. */
  isNoOp: boolean;
}

/**
 * `resolvedAnchorISO` = el ancla que tendría la propuesta (la existente, o la del kickoff si la
 * existente está vacía — ese fallback pega a la base, así que lo resuelve el caller ANTES de
 * llamar acá). `existingAnchorISO` = el ancla real de hoy, para el chequeo de no-op.
 */
export function reconcileAgentProposal(
  proposedPhases: AgentProposedPhase[],
  existingPhases: ExistingPhaseForReconcile[],
  existingAnchorISO: string | null,
  resolvedAnchorISO: string | null,
): ReconcileResult {
  const norm = (s: string) => s.trim().toLowerCase();
  const byName = new Map<string, ExistingPhaseForReconcile>();
  for (const ph of existingPhases) if (!byName.has(norm(ph.name))) byName.set(norm(ph.name), ph);
  const consumed = new Set<string>();

  const phases: ReconciledPhase[] = [];

  // 1) Fases propuestas por el agente (en su orden), matcheadas a existentes por nombre
  //    normalizado y, si no, por posición. Las matcheadas llevan su id + el activityType
  //    existente (mejora el preview; no-op al aplicar).
  proposedPhases.forEach((p, i) => {
    let match: ExistingPhaseForReconcile | undefined = byName.get(norm(p.name));
    if (match && consumed.has(match.id)) match = undefined;
    if (!match) {
      const positional = existingPhases[i];
      if (positional && !consumed.has(positional.id)) match = positional;
    }
    if (match) {
      consumed.add(match.id);
      phases.push({
        id: match.id,
        name: p.name,
        order: i,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek,
        sessionCount: p.sessionCount,
        notes: p.notes,
        activityType: match.activityType,
      });
    } else {
      phases.push({
        name: p.name,
        order: i,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek,
        sessionCount: p.sessionCount,
        notes: p.notes,
      });
    }
  });

  // 2) Fases existentes NO matcheadas → re-emitir idénticas (nunca borrar).
  let nextOrder = phases.length;
  for (const ph of existingPhases) {
    if (consumed.has(ph.id)) continue;
    phases.push({
      id: ph.id,
      name: ph.name,
      order: nextOrder++,
      durationWeeks: ph.durationWeeks,
      startWeek: ph.startWeek,
      sessionCount: ph.sessionCount,
      notes: ph.notes,
      activityType: ph.activityType,
    });
  }

  // ¿La propuesta es un NO-OP? (mismos ids en el mismo orden, mismos campos que el PUT
  // escribiría, mismo ancla). Regenerar el handoff para refrescar CONTEXTO no debe generar
  // ruido en el cronograma.
  const phaseFp = (p: {
    id?: string | null; name: string; durationWeeks: number; startWeek?: number | null;
    sessionCount: number | null; notes: string | null; activityType?: string | null;
  }) =>
    JSON.stringify([p.id ?? null, p.name, p.durationWeeks, p.startWeek ?? null, p.sessionCount ?? null, p.notes ?? null, p.activityType ?? null]);

  const isNoOp =
    resolvedAnchorISO === existingAnchorISO &&
    phases.length === existingPhases.length &&
    phases.every((p, i) => phaseFp(p) === phaseFp(existingPhases[i]));

  return { phases, anchorStartDate: resolvedAnchorISO, isNoOp };
}
