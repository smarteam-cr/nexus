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
 *
 * Tanda O (2026-08-10) — cuando ni el nombre ni la posición matchean, la fase
 * propuesta sale como nueva y la existente huérfana queda sin tocar (ver el
 * paso 2 más abajo). Repetido varias veces con nombres distintos para el MISMO
 * trabajo, esto produce duplicados reales (confirmado en Wherex: "Integraciones"
 * y "Desarrollo / Integración" conviviendo). Se agrega una tercera pasada que
 * busca, con `lib/timeline/phase-identity.ts` (token-overlap + prefijo, sin
 * Levenshtein), la mejor huérfana candidata para cada fase sin match, y la
 * cuelga como `mergeCandidateId` — un AVISO, nunca una fusión automática (fusionar
 * mal pisaría una fase real con datos de otra, más caro que el duplicado que
 * esto evita). El CSE confirma con el botón "Fusionar" en el canvas.
 */

import { findBestOrphanMatch, type OrphanPhase } from "./phase-identity";

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
  /** Solo en fases SIN `id` (no matchearon por nombre ni posición): el id de la existente
   *  huérfana que probablemente es esta misma fase con otro nombre (Tanda O). Un AVISO, no una
   *  decisión — el CSE confirma la fusión a mano en el canvas. */
  mergeCandidateId?: string | null;
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

  // 1a) PRIMERA pasada: SOLO nombre exacto normalizado, sobre TODAS las propuestas, antes de
  //     tocar la posición. Separado a propósito de 1b: si el fallback posicional corriera
  //     entremezclado en un solo loop (índice por índice), una fase SIN nombre en común que
  //     aparece ANTES en el array podía consumir por posición la existente que una fase MÁS
  //     ADELANTE iba a matchear por nombre exacto — esa, al encontrar su match ya consumido,
  //     se caía a fase nueva (duplicado) mientras la existente quedaba renombrada a la fase
  //     equivocada. Bug real, más grave que un duplicado: pisa una fase con progreso.
  const matchByIndex = new Map<number, ExistingPhaseForReconcile>();
  proposedPhases.forEach((p, i) => {
    const m = byName.get(norm(p.name));
    if (m) {
      matchByIndex.set(i, m);
      consumed.add(m.id);
    }
  });

  // 1b) SEGUNDA pasada — candidato a FUSIÓN: ANTES del fallback posicional a propósito. El
  //     posicional es ciego (le da a cualquier propuesta sin nombre la próxima existente que
  //     encuentre, sin mirar si se parecen) y greedy — si corriera primero, se comería TODAS las
  //     huérfanas disponibles para lo que sea que venga en orden, sin dejarle nada a una fase que
  //     sí se parece a una huérfana puntual (matemáticamente: con matching exhaustivo, o el
  //     posicional deja propuestas sin match, o deja huérfanas sin consumir — nunca las dos cosas
  //     a la vez, así que corriendo después del posicional este paso jamás encuentra con qué
  //     trabajar). Acá se RESERVA la huérfana (entra a `claimed`, que el paso 1c respeta) sin
  //     asignarle id a la propuesta — es un AVISO (`mergeCandidateId`), no una fusión: la huérfana
  //     se re-emite igual en el paso 2 de abajo, nadie la toca hasta que el CSE apriete "Fusionar".
  //     Greedy en orden de propuesta si dos compiten por la misma huérfana — es solo un hint
  //     descartable, el CSE ve ambas y decide.
  const claimed = new Set<string>();
  const mergeCandidateByIndex = new Map<number, string>();
  proposedPhases.forEach((p, i) => {
    if (matchByIndex.has(i)) return;
    const orphansSoFar: OrphanPhase[] = existingPhases.filter((e) => !consumed.has(e.id) && !claimed.has(e.id));
    const best = findBestOrphanMatch(p.name, orphansSoFar);
    if (best) {
      mergeCandidateByIndex.set(i, best.id);
      claimed.add(best.id);
    }
  });

  // 1c) TERCERA pasada: posición, contra "la próxima existente TODAVÍA sin consumir NI reservada
  //     por 1b" (no el índice crudo del array original) — así una inserción/renombre en el medio
  //     no desalinea el resto, y una huérfana ya ofrecida como candidata a fusión no se la roba
  //     una propuesta sin ninguna relación con ella.
  proposedPhases.forEach((p, i) => {
    if (matchByIndex.has(i) || mergeCandidateByIndex.has(i)) return;
    const positional = existingPhases.find((e) => !consumed.has(e.id) && !claimed.has(e.id));
    if (positional) {
      matchByIndex.set(i, positional);
      consumed.add(positional.id);
    }
  });

  const phases: ReconciledPhase[] = [];

  // 1d) Construir el resultado con los matches ya resueltos. Las matcheadas llevan su id + el
  //     activityType existente (mejora el preview; no-op al aplicar).
  proposedPhases.forEach((p, i) => {
    const match = matchByIndex.get(i);
    if (match) {
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
      const mergeCandidateId = mergeCandidateByIndex.get(i);
      phases.push({
        name: p.name,
        order: i,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek,
        sessionCount: p.sessionCount,
        notes: p.notes,
        ...(mergeCandidateId ? { mergeCandidateId } : {}),
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
