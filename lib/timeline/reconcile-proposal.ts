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
 * Tanda O (2026-08-10) — el fallback posicional comparaba contra `existingPhases[i]` (el índice
 * CRUDO del array original), no contra "la próxima existente sin consumir". Con una inserción o
 * un renombre en el medio de la lista propuesta, eso podía hacer que una fase le robara el id a
 * OTRA que sí matcheaba por nombre más adelante — pisando en silencio una fase con tareas y
 * progreso reales. Arreglado abajo, separando en dos pasadas: nombre exacto primero, posición
 * después, contra "la próxima sin consumir".
 *
 * ⛔ REVERTIDO (2026-08-11) el aviso de fusión (`mergeCandidateId`) que esa misma tanda agregó
 * como tercera pasada. Reservaba la huérfana parecida ANTES del posicional, así que el posicional
 * ya no podía matchearla: una fase que se venía renombrando LIMPIA en su lugar pasaba a salir como
 * fase NUEVA + la huérfana re-emitida — el duplicado que la tanda venía a evitar, y por el camino
 * más usado (el botón "Aceptar todo" nunca manda fusiones). Medido: existing=["Integraciones"] +
 * proposed=["Desarrollo / Integración"] daba DOS fases; con nombres SIN nada en común daba UNA.
 * Cuanto más se parecían los nombres, peor el resultado.
 *
 * Y el aviso era además REDUNDANTE: cuando el posicional matchea, la fase existente se renombra en
 * su lugar conservando id, tareas y progreso — que es exactamente lo que hacía "Fusionar".
 * Matemáticamente tampoco tenía dónde vivir: tras un posicional greedy, o quedan propuestas sin
 * match o quedan huérfanas sin consumir, nunca las dos cosas a la vez.
 *
 * ⚠ El caso real de Wherex (dos fases duplicadas conviviendo HOY en la base) no lo resuelve esto:
 * ya están aplicadas, no son una propuesta. Para ésas están `scripts/fusionar-fases-cronograma.ts`
 * y el aviso de fases repetidas sobre las EXISTENTES (`lib/timeline/phase-identity.ts`).
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
  // TODAS las existentes con cada nombre, en su orden (Wherex tiene dos fases que se llaman igual).
  const byName = new Map<string, ExistingPhaseForReconcile[]>();
  for (const ph of existingPhases) {
    const lista = byName.get(norm(ph.name));
    if (lista) lista.push(ph);
    else byName.set(norm(ph.name), [ph]);
  }
  const consumed = new Set<string>();

  // 1a) PRIMERA pasada: SOLO nombre exacto normalizado, sobre TODAS las propuestas, antes de
  //     tocar la posición. Separado a propósito de 1b: si el fallback posicional corriera
  //     entremezclado en un solo loop (índice por índice), una fase SIN nombre en común que
  //     aparece ANTES en el array podía consumir por posición la existente que una fase MÁS
  //     ADELANTE iba a matchear por nombre exacto — esa, al encontrar su match ya consumido,
  //     se caía a fase nueva (duplicado) mientras la existente quedaba renombrada a la fase
  //     equivocada. Bug real, más grave que un duplicado: pisa una fase con progreso.
  //     E2b (D9): cada propuesta toma la PRIMERA existente SIN CONSUMIR con su nombre. Antes tomaba
  //     siempre la primera, y dos propuestas con el mismo nombre salían con el MISMO id (claves
  //     repetidas en el borrador). Una propuesta cuyo nombre ya salió antes en la propuesta y que no
  //     encuentra existente libre se IGNORA: como fase nueva chocaría siempre con la del mismo nombre
  //     y frenaría todo lo que viene después; por posición renombraría otra fase a un nombre repetido.
  const matchByIndex = new Map<number, ExistingPhaseForReconcile>();
  const repetidas = new Set<number>();
  const vistos = new Set<string>();
  proposedPhases.forEach((p, i) => {
    const k = norm(p.name);
    const m = byName.get(k)?.find((e) => !consumed.has(e.id));
    if (m) {
      matchByIndex.set(i, m);
      consumed.add(m.id);
    } else if (vistos.has(k)) {
      repetidas.add(i);
    }
    vistos.add(k);
  });

  // 1b) SEGUNDA pasada: posición, contra "la próxima existente TODAVÍA SIN CONSUMIR" — no el
  //     índice crudo del array original. Así una inserción o un renombre en el medio no desalinea
  //     el resto. Es lo que hace que un renombre (por parecido que sea el nombre nuevo) conserve
  //     el id, las tareas y el progreso de la fase que ya estaba, en vez de duplicarla.
  proposedPhases.forEach((p, i) => {
    if (matchByIndex.has(i) || repetidas.has(i)) return;
    const positional = existingPhases.find((e) => !consumed.has(e.id));
    if (positional) {
      matchByIndex.set(i, positional);
      consumed.add(positional.id);
    }
  });

  const phases: ReconciledPhase[] = [];

  // 1d) Construir el resultado con los matches ya resueltos. Las matcheadas llevan su id + el
  //     activityType existente (mejora el preview; no-op al aplicar). Las repetidas no entran, y el
  //     `order` corre sin huecos.
  let order = 0;
  proposedPhases.forEach((p, i) => {
    if (repetidas.has(i)) return;
    const match = matchByIndex.get(i);
    if (match) {
      phases.push({
        id: match.id,
        name: p.name,
        order: order++,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek,
        sessionCount: p.sessionCount,
        notes: p.notes,
        activityType: match.activityType,
      });
    } else {
      phases.push({
        name: p.name,
        order: order++,
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
