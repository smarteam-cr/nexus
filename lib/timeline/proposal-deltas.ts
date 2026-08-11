/**
 * lib/timeline/proposal-deltas.ts
 *
 * Deltas POR ÍTEM de una propuesta de cronograma (`ProjectTimeline.pendingProposal`) contra las
 * fases actuales — funciones PURAS, client-safe (sin Prisma). Es la matemática única del modelo
 * "diff EN el Gantt real": la propuesta (que el handoff re-emite ya reconciliada por id, sin
 * `tasks`) se descompone en sugerencias discretas que el CSE acepta o descarta una por una,
 * en vez de un swap todo-o-nada del Gantt.
 *
 * Tipos de delta:
 *  - ADD_PHASE       → fase propuesta sin id (no matcheó ninguna existente): fila fantasma.
 *                      `afterPhaseId` dice DÓNDE va (la fase anterior en la propuesta), para
 *                      que al aceptarla caiga en su lugar y no al final del cronograma.
 *  - MODIFY_PHASE    → fase existente cuyo contenido difiere (nombre/duración/inicio/tipo/
 *                      sesiones/notas): badge "Sugerencia" en la fila real.
 *  - REORDER_PHASES  → la propuesta pone las MISMAS fases en otro orden. Es global por
 *                      naturaleza (no se puede reordenar "media lista"), así que va como un
 *                      único delta que se acepta o descarta entero.
 *  - SET_ANCHOR      → la propuesta trae fecha de inicio y el cronograma no tenía (derivada del
 *                      kickoff); sin esto el cambio se aplicaba invisible.
 *
 * Las TAREAS nunca producen deltas acá: la propuesta del handoff no las trae (`tasks` ausente =
 * "no tocar", contrato del PUT) — por eso el viejo contador "−70 tareas" mentía.
 * Una fase propuesta con un id que YA no existe (el CSE la borró después de generarse la
 * propuesta) se DESCARTA en silencio: re-crearla sería deshacer una decisión humana.
 */

export interface CurrentPhaseLike {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
}

export interface ProposalPhaseLike {
  id?: string | null;
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  /** La propuesta del handoff nunca las trae; se ignoran siempre (phase-level only). */
  tasks?: unknown;
  /** Solo en fases sin `id` (Tanda O) — ver `reconcileAgentProposal`. El id de la huérfana
   *  candidata a ser esta misma fase con otro nombre. Se persiste porque no hay forma barata de
   *  re-derivar "cuál era" después; el NOMBRE, en cambio, se resuelve fresco en cada delta (ver
   *  abajo), nunca se guarda una copia que pueda quedar vieja. */
  mergeCandidateId?: string | null;
}

export interface ProposalLike {
  anchorStartDate: string | null;
  phases: ProposalPhaseLike[];
}

export type PhaseField = "name" | "durationWeeks" | "startWeek" | "sessionCount" | "notes" | "activityType";

export interface PhaseFieldChange {
  field: PhaseField;
  from: string | number | null;
  to: string | number | null;
}

export type ProposalDelta =
  | {
      key: string;
      kind: "ADD_PHASE";
      index: number;
      phase: ProposalPhaseLike;
      /** Fase existente tras la cual va (null = al principio). Solo para mostrar el destino. */
      afterPhaseId: string | null;
      afterPhaseName: string | null;
      /** Huérfana candidata a ser esta misma fase con otro nombre (Tanda O) — null si no hay
       *  candidata, o si la huérfana ya no existe (un humano la borró entre la propuesta y ahora:
       *  mismo criterio de obsolescencia que `byId.has` ya aplica al resto del archivo). */
      mergeCandidateId: string | null;
      mergeCandidateName: string | null;
    }
  | { key: string; kind: "MODIFY_PHASE"; phaseId: string; name: string; changes: PhaseFieldChange[] }
  | { key: "reorder"; kind: "REORDER_PHASES"; ids: string[]; names: string[] }
  | { key: "anchor"; kind: "SET_ANCHOR"; from: string | null; to: string };

/** Un puesto en el orden final de fases: una existente, o una nueva por crear. */
export type OrderedSlot =
  | { kind: "existing"; id: string }
  | { kind: "new"; key: string; phase: ProposalPhaseLike };

const FIELDS: PhaseField[] = ["name", "durationWeeks", "startWeek", "sessionCount", "notes", "activityType"];

const val = (p: CurrentPhaseLike | ProposalPhaseLike, f: PhaseField): string | number | null => {
  const v = p[f];
  return v === undefined ? null : v;
};

/** Fecha comparable (solo día): la propuesta guarda ISO completo; el canvas usa YYYY-MM-DD. */
const day = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

/**
 * Descompone la propuesta en deltas por ítem. `currentAnchor` = anchor guardado (ISO o
 * YYYY-MM-DD o null). Propuesta idéntica → [] (el caller puede descartarla como no-op).
 */
export function computeProposalDeltas(
  current: CurrentPhaseLike[],
  proposal: ProposalLike,
  currentAnchor: string | null,
): ProposalDelta[] {
  const out: ProposalDelta[] = [];
  const byId = new Map(current.map((p) => [p.id, p]));

  proposal.phases.forEach((p, i) => {
    if (!p.id) {
      // Dónde cae: la última fase ANTERIOR en la propuesta que exista hoy. Sin esto, aceptar
      // una fase intermedia la mandaba al final del cronograma.
      let afterId: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const prev = proposal.phases[j];
        if (prev?.id && byId.has(prev.id)) {
          afterId = prev.id;
          break;
        }
      }
      const mergeCandidate = p.mergeCandidateId ? byId.get(p.mergeCandidateId) : undefined;
      out.push({
        key: `add:${i}`,
        kind: "ADD_PHASE",
        index: i,
        phase: p,
        afterPhaseId: afterId,
        afterPhaseName: afterId ? (byId.get(afterId)?.name ?? null) : null,
        mergeCandidateId: mergeCandidate ? mergeCandidate.id : null,
        mergeCandidateName: mergeCandidate ? mergeCandidate.name : null,
      });
      return;
    }
    const cur = byId.get(p.id);
    if (!cur) return; // la fase fue borrada por un humano después de la propuesta → delta stale
    const changes: PhaseFieldChange[] = [];
    for (const f of FIELDS) {
      const from = val(cur, f);
      const to = val(p, f);
      if (from !== to) changes.push({ field: f, from, to });
    }
    if (changes.length > 0) {
      out.push({ key: `mod:${p.id}`, kind: "MODIFY_PHASE", phaseId: p.id, name: cur.name, changes });
    }
  });

  // REORDER: las mismas fases en otro orden. Se compara la SECUENCIA de las fases que existen
  // hoy, tal como vienen en la propuesta, contra su orden actual. Antes esto no producía ningún
  // delta: una propuesta que solo reordenaba se descartaba sola, en silencio.
  const proposedSeq = proposal.phases
    .map((p) => p.id)
    .filter((id): id is string => !!id && byId.has(id));
  const currentSeq = current.map((p) => p.id).filter((id) => proposedSeq.includes(id));
  if (proposedSeq.length > 1 && proposedSeq.join("\u0000") !== currentSeq.join("\u0000")) {
    out.push({
      key: "reorder",
      kind: "REORDER_PHASES",
      ids: proposedSeq,
      names: proposedSeq.map((id) => byId.get(id)?.name ?? id),
    });
  }

  const toAnchor = day(proposal.anchorStartDate);
  const fromAnchor = day(currentAnchor);
  if (toAnchor && toAnchor !== fromAnchor) {
    out.push({ key: "anchor", kind: "SET_ANCHOR", from: fromAnchor, to: toAnchor });
  }

  return out;
}

/**
 * Orden FINAL de fases tras aceptar un subconjunto de deltas. Puro y testeable: el endpoint
 * solo traduce el resultado a `order` en la DB.
 *
 * Resuelve juntos los dos deltas que tocan el orden (si no, se pisan entre sí):
 *  1. REORDER_PHASES aceptado → las existentes se reordenan según la propuesta (las que no
 *     figuran quedan al final, en su orden relativo).
 *  2. cada ADD_PHASE aceptado → se inserta DESPUÉS de su fase previa de la propuesta (que puede
 *     ser otra fase nueva del mismo lote); sin ancla previa, va al principio.
 */
export function buildPhaseOrder(
  current: CurrentPhaseLike[],
  proposal: ProposalLike,
  acceptedKeys: Set<string>,
): OrderedSlot[] {
  const slots: OrderedSlot[] = current.map((p) => ({ kind: "existing", id: p.id }));

  if (acceptedKeys.has("reorder")) {
    const wanted = proposal.phases
      .map((p) => p.id)
      .filter((id): id is string => !!id && slots.some((s) => s.kind === "existing" && s.id === id));
    const rest = slots.filter((s) => s.kind === "existing" && !wanted.includes(s.id));
    slots.length = 0;
    for (const id of wanted) slots.push({ kind: "existing", id });
    slots.push(...rest);
  }

  const adds = proposal.phases
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => !p.id && acceptedKeys.has(`add:${i}`))
    .sort((a, b) => a.i - b.i);

  for (const { p, i } of adds) {
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const prev = proposal.phases[j];
      const at = prev?.id
        ? slots.findIndex((s) => s.kind === "existing" && s.id === prev.id)
        : slots.findIndex((s) => s.kind === "new" && s.key === `add:${j}`);
      if (at >= 0) {
        pos = at + 1;
        break;
      }
    }
    slots.splice(pos, 0, { kind: "new", key: `add:${i}`, phase: p });
  }

  return slots;
}

/**
 * ── LA PROYECCIÓN: CÓMO QUEDARÍA EL CALENDARIO SI ACEPTO ESTAS CLAVES ───────
 * (Tanda J, 2026-08-08.) Hasta ahora se podía saber QUÉ cambia, pero no CUÁNDO terminaría el
 * proyecto si se aceptara — así que el CSE aprobaba corrimientos de fecha sin verlos. Estas
 * dos funciones simulan el resultado SIN escribir nada, y quien las consume las combina con
 * `projectedEnd` de weeks.ts (la única fórmula del cierre).
 *
 * Devuelven solo lo que MUEVE EL CALENDARIO (orden + duración + inicio): nombres, notas y
 * tipos no viajan porque no mueven ninguna fecha. No es un preview de contenido.
 */

/** El ancla resultante: la del `SET_ANCHOR` si se acepta, si no la actual. */
export function anchorAfterDeltas(
  currentAnchor: string | null,
  proposal: ProposalLike,
  acceptedKeys: Set<string>,
): string | null {
  if (!acceptedKeys.has("anchor")) return currentAnchor;
  /* Mismo criterio que el delta: una propuesta con `anchorStartDate: null` NUNCA borra el
     ancla (computeProposalDeltas ni siquiera emite el delta en ese caso). */
  return proposal.anchorStartDate ?? currentAnchor;
}

/**
 * Las fases resultantes, en su orden final, con las duraciones e inicios que quedarían.
 *
 * ⚠ Reusa `buildPhaseOrder` a propósito: el ORDEN mueve el fin cuando conviven fases
 * contiguas y fases con `startWeek` explícito, así que recalcularlo a mano sería un segundo
 * algoritmo de fechas — exactamente lo que este archivo y `weeks.ts` existen para no tener.
 */
export function phasesAfterDeltas(
  current: CurrentPhaseLike[],
  proposal: ProposalLike,
  acceptedKeys: Set<string>,
): Array<{ durationWeeks: number; startWeek?: number | null }> {
  const actualesPorId = new Map(current.map((p) => [p.id, p]));
  const propuestasPorId = new Map(
    proposal.phases.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p]),
  );

  return buildPhaseOrder(current, proposal, acceptedKeys).map((slot) => {
    if (slot.kind === "new") {
      return { durationWeeks: slot.phase.durationWeeks, startWeek: slot.phase.startWeek ?? null };
    }
    /* La fase existente conserva lo suyo salvo que su `mod:` esté aceptado. El `?? null` NO es
       cosmético: computeProposalDeltas normaliza `undefined → null` (ver `val`) y el endpoint
       escribe `null`, así que tomar el valor crudo daría un span distinto del que se aplicaría. */
    const propuesta = acceptedKeys.has(`mod:${slot.id}`) ? propuestasPorId.get(slot.id) : undefined;
    const fuente = propuesta ?? actualesPorId.get(slot.id);
    return {
      durationWeeks: fuente?.durationWeeks ?? 0,
      startWeek: fuente?.startWeek ?? null,
    };
  });
}

/**
 * Prioridad de un cambio para MOSTRARLO: primero lo que mueve el calendario
 * (duración y semana de inicio corren fechas de todo lo que sigue), después lo
 * operativo, y al final el renombre, que es cosmético.
 *
 * Existe porque el badge mostraba `changes[0]` y escondía el resto tras un "+N":
 * en el caso real de Grupo Inve se leía «renombrar a "Auditoría y cierre de gaps"
 * +2» y los dos escondidos eran justamente los que movían el cronograma.
 */
const PESO_CAMBIO: Record<PhaseFieldChange["field"], number> = {
  durationWeeks: 0,
  startWeek: 1,
  sessionCount: 2,
  activityType: 3,
  notes: 4,
  name: 5,
};

/** Los cambios de una sugerencia ordenados por impacto (lo que mueve fechas primero). */
export function sortChangesByImpact(changes: PhaseFieldChange[]): PhaseFieldChange[] {
  return [...changes].sort((a, b) => PESO_CAMBIO[a.field] - PESO_CAMBIO[b.field]);
}

/** Frase completa de una sugerencia: TODOS los cambios, del más consecuente al menos. */
export function describeChanges(changes: PhaseFieldChange[]): string {
  return sortChangesByImpact(changes).map(describeChange).join(" · ");
}

/** Etiqueta humana de un cambio de campo (para el badge "Sugerencia" del Gantt). */
export function describeChange(c: PhaseFieldChange): string {
  switch (c.field) {
    case "durationWeeks":
      return `${c.from ?? "?"} → ${c.to ?? "?"} semanas`;
    case "startWeek":
      return `inicio S${c.from ?? "auto"} → S${c.to ?? "auto"}`;
    case "name":
      return `renombrar a «${c.to}»`;
    case "sessionCount":
      return `${c.from ?? "?"} → ${c.to ?? "?"} sesiones`;
    case "activityType":
      return `tipo → ${c.to ?? "sin tipo"}`;
    case "notes":
      return "notas actualizadas";
  }
}
