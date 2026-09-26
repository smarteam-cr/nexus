/**
 * lib/timeline/proposal-deltas.ts
 *
 * Deltas POR ÍTEM de una propuesta de fases (`ProposalLike`) contra unas fases — funciones PURAS,
 * client-safe (sin Prisma). `ProposalLike` es el FORMATO INTERMEDIO de los productores (el handoff y
 * el paso 1 de «Regenerar todo»), que NUNCA se guarda: desde E4 (2026-09) lo guardado en
 * `ProjectTimeline.pendingProposal` es siempre `borrador-v1`. La propuesta (que el handoff re-emite ya
 * reconciliada por id, sin `tasks`) se descompone en cambios discretos, y `convertirPropuestaDeFases`
 * (lib/timeline/borrador.ts) los vuelve, una vez, los cambios del borrador contra lo que leyó el
 * productor.
 *
 * Tipos de delta:
 *  - ADD_PHASE       → fase propuesta sin id (no matcheó ninguna existente): una fase nueva.
 *                      `afterPhaseId` dice DÓNDE va (la fase anterior en la propuesta), para
 *                      que al aplicarla caiga en su lugar y no al final del cronograma.
 *  - MODIFY_PHASE    → fase existente cuyo contenido difiere (nombre/duración/inicio/tipo/
 *                      sesiones/notas): un cambio por campo en la lista.
 *  - REORDER_PHASES  → la propuesta pone las MISMAS fases en otro orden. Es global por
 *                      naturaleza (no se puede reordenar "media lista"), así que va como un
 *                      único cambio que se aplica o se deja fuera entero.
 *  - SET_ANCHOR      → la propuesta trae fecha de inicio y el cronograma no tenía (derivada del
 *                      kickoff); sin esto el cambio se aplicaba invisible. ⛔ Solo la del
 *                      handoff: la de las reuniones (`origen: "contexto"`) nunca mueve el arranque.
 *
 * Las TAREAS nunca producen deltas acá: la propuesta del handoff no las trae (`tasks` ausente =
 * "no tocar", contrato del PUT) — por eso el viejo contador "−70 tareas" mentía.
 * Una fase propuesta con un id que YA no existe (el CSE la borró después de generarse la
 * propuesta) se DESCARTA en silencio: re-crearla sería deshacer una decisión humana.
 *
 * ── DE DÓNDE SALE LA PROPUESTA, Y POR QUÉ (2026-09-23) ──────────────────────
 * Además del handoff, «Regenerar todo» revisa fases y tiempos con las reuniones y notas que
 * eligió el CSE y deja su propuesta en el mismo lugar, con `origen: "contexto"`. Esa propuesta
 * trae un `motivo` por fase (interno: cita la reunión o la nota) y `observaciones` (lo que la IA
 * notó y no puede aplicar sola). ⛔ Ninguno de los dos es un CAMBIO: no están en `FIELDS`, viajan
 * en el delta solo cuando existen (spread condicional, nunca `motivo: null`) y el endpoint que
 * aplica nunca los escribe en la fase. La propuesta del handoff no los trae y sus deltas quedan
 * idénticos a los de antes.
 *
 * ── LA DE LAS REUNIONES GUARDA LA INTENCIÓN, NO UNA FOTO (revisión adversarial, 2026-09-24) ──
 * La propuesta copiaba TODAS las fases tal como estaban al crearla, y los deltas se recalculan
 * contra las fases VIVAS campo por campo. Con el Gantt editable mientras la propuesta espera, lo
 * que el CSE cambiaba después (una nota, un nombre, la duración de otra fase, el orden) volvía como
 * una «sugerencia» que lo revertía, pegada en la misma clave al cambio que sí pidió la reunión: al
 * aceptar la duración se pisaba la nota nueva con la vieja. Ahora la propuesta de las reuniones
 * dice QUÉ quiere cambiar: `campos` por fase (solo esos se comparan y se escriben) y `movidas`
 * (el reordenamiento se arma sobre el orden VIVO). La del handoff, que no los trae, sigue igual.
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
  /** Por qué se propone el cambio de ESTA fase (interno, solo lo ve el CSE). Nunca es un cambio. */
  motivo?: string | null;
  /**
   * Solo la propuesta de las reuniones (`origen: "contexto"`): los campos que la IA propone cambiar
   * en ESTA fase. Solo esos se comparan contra la fase viva (y solo esos se escriben al aplicar); lo
   * que el CSE edite después en otro campo no vuelve como sugerencia de revertirlo. Ausente = todos
   * (la del handoff, o una propuesta de las reuniones guardada antes de este campo).
   */
  campos?: PhaseField[] | null;
}

/** Un «mover» aceptado por el armador: la fase `id` va justo después de `despuesDe`. */
export interface MovidaDeFase {
  id: string;
  despuesDe: string;
}

export interface ProposalLike {
  anchorStartDate: string | null;
  phases: ProposalPhaseLike[];
  /** Solo la propuesta que sale de las reuniones y notas elegidas. Ausente = la del handoff. */
  origen?: "contexto";
  /** Lo que la IA notó y no se aplica solo (interno). Nunca produce un delta. */
  observaciones?: string[];
  /**
   * Solo la propuesta de las reuniones: los «mover» que propone, en orden. El reordenamiento se
   * arma aplicándolos sobre el orden VIVO (`secuenciaPropuesta`), así un orden que el CSE cambió a
   * mano después no se revierte. `[]` = no reordena. Ausente = el orden es el del array `phases`
   * (la del handoff, o una de las reuniones guardada antes de este campo).
   */
  movidas?: MovidaDeFase[];
}

/** Quién dejó la propuesta pendiente. Todo lo que no diga `contexto` es la del handoff. */
export function origenDePropuesta(p: { origen?: unknown } | null | undefined): "contexto" | "handoff" {
  return p?.origen === "contexto" ? "contexto" : "handoff";
}

/*
 * Lo que ve quien regeneró el handoff cuando su propuesta de fases NO se guardó (va detrás de «El
 * handoff se generó, pero el cronograma no se actualizó: …», components/clients/ProjectHandoffSection).
 * Una propuesta abierta con algo por decidir no se pisa, sea de las reuniones o de un handoff
 * anterior (respuesta 1 de Elías, 2026-09-24; analyze/route.ts): se queda la abierta y se avisa.
 */
/* E2a: la propuesta de «Regenerar todo» (`origen: "contexto"`) puede traer también tareas, así que
   ya no se nombra «cambios de fases». La del handoff anterior sigue siendo solo de fases hasta E2b. */
export const AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE =
  "tiene una propuesta del cronograma sin decidir, y el handoff no la pisa. " +
  "Cuando se decida, vuelve a generar el handoff para ver sus sugerencias de fases.";
export const AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE =
  "tiene cambios de fases sugeridos por un handoff anterior, sin decidir, y el handoff nuevo no los pisa. " +
  "Cuando se decidan en el Cronograma, vuelve a generar el handoff para ver sus sugerencias de fases.";
export const AVISO_OTRA_PROPUESTA_ENTRO =
  "otra propuesta del cronograma entró mientras se generaba el handoff, y no se pisa. Cuando se decida, " +
  "vuelve a generar el handoff para ver sus sugerencias de fases.";

export type PhaseField = "name" | "durationWeeks" | "startWeek" | "sessionCount" | "notes" | "activityType";

export interface PhaseFieldChange {
  field: PhaseField;
  from: string | number | null;
  to: string | number | null;
}

/** Una fase que CAMBIA DE PUESTO en el reordenamiento. Posiciones 1-based y absolutas. */
export interface MovimientoDeFase {
  id: string;
  nombre: string;
  de: number;
  a: number;
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
    }
  | {
      key: string;
      kind: "MODIFY_PHASE";
      phaseId: string;
      name: string;
      changes: PhaseFieldChange[];
      /** El motivo de la fase propuesta, si lo trae. Solo para mostrarlo. */
      motivo?: string;
    }
  | {
      key: "reorder";
      kind: "REORDER_PHASES";
      ids: string[];
      names: string[];
      /** SOLO las fases que cambian de puesto — lo que de verdad hay que leer. `names` es la
       *  lista completa resultante y con 10 fases es ilegible: muestra el DESTINO, no el
       *  movimiento, así que para saber qué se movió había que diffear a ojo contra el Gantt. */
      movimientos: MovimientoDeFase[];
      /** Los motivos de las fases que cambian de puesto, sin repetir. Solo para mostrarlos. */
      motivos?: string[];
    }
  | { key: "anchor"; kind: "SET_ANCHOR"; from: string | null; to: string };

/** Un puesto en el orden final de fases: una existente, o una nueva por crear. */
export type OrderedSlot =
  | { kind: "existing"; id: string }
  | { kind: "new"; key: string; phase: ProposalPhaseLike };

const FIELDS: PhaseField[] = ["name", "durationWeeks", "startWeek", "sessionCount", "notes", "activityType"];

/**
 * Los campos que se comparan (y se escriben) de una fase propuesta: los de su `campos` si es la
 * propuesta de las reuniones y los trae; si no, todos (la del handoff, sin cambios).
 */
export function camposDeLaFasePropuesta(p: ProposalPhaseLike, proposal: ProposalLike): PhaseField[] {
  if (origenDePropuesta(proposal) !== "contexto" || !Array.isArray(p.campos)) return FIELDS;
  return FIELDS.filter((f) => p.campos!.includes(f));
}

/**
 * EL ORDEN PROPUESTO de las fases existentes (`actuales`, en su orden vivo). La del handoff (o una
 * de las reuniones sin `movidas`): el del array `phases`, filtrado a las que existen. La de las
 * reuniones con `movidas`: el orden VIVO con cada «mover» aplicado —un «mover» cuya fase o ancla ya
 * no existe se ignora—, así lo que el CSE reordenó a mano después no vuelve como sugerencia.
 * Lo usan los deltas, el orden final al aceptar y la reescritura de lo pendiente: una sola regla.
 */
export function secuenciaPropuesta(actuales: readonly string[], proposal: ProposalLike): string[] {
  const existe = new Set(actuales);
  if (origenDePropuesta(proposal) === "contexto" && Array.isArray(proposal.movidas)) {
    let orden = [...actuales];
    for (const m of proposal.movidas) {
      if (!existe.has(m.id) || !existe.has(m.despuesDe) || m.id === m.despuesDe) continue;
      const sin = orden.filter((x) => x !== m.id);
      sin.splice(sin.indexOf(m.despuesDe) + 1, 0, m.id);
      orden = sin;
    }
    return orden;
  }
  return proposal.phases.map((p) => p.id).filter((id): id is string => !!id && existe.has(id));
}

const val =(p: CurrentPhaseLike | ProposalPhaseLike, f: PhaseField): string | number | null => {
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
      out.push({
        key: `add:${i}`,
        kind: "ADD_PHASE",
        index: i,
        phase: p,
        afterPhaseId: afterId,
        afterPhaseName: afterId ? (byId.get(afterId)?.name ?? null) : null,
      });
      return;
    }
    const cur = byId.get(p.id);
    if (!cur) return; // la fase fue borrada por un humano después de la propuesta → delta stale
    const changes: PhaseFieldChange[] = [];
    // La de las reuniones compara SOLO los campos que propone (ver `campos`); la del handoff, todos.
    for (const f of camposDeLaFasePropuesta(p, proposal)) {
      const from = val(cur, f);
      const to = val(p, f);
      if (from !== to) changes.push({ field: f, from, to });
    }
    if (changes.length > 0) {
      // ⛔ Spread condicional: `motivo: null` rompería el toEqual de toda propuesta del handoff.
      out.push({
        key: `mod:${p.id}`,
        kind: "MODIFY_PHASE",
        phaseId: p.id,
        name: cur.name,
        changes,
        ...(p.motivo ? { motivo: p.motivo } : {}),
      });
    }
  });

  // REORDER: las mismas fases en otro orden. Se compara la SECUENCIA de las fases que existen
  // hoy, tal como vienen en la propuesta, contra su orden actual. Antes esto no producía ningún
  // delta: una propuesta que solo reordenaba se descartaba sola, en silencio. La de las reuniones
  // la arma con sus `movidas` sobre el orden vivo (`secuenciaPropuesta`).
  const proposedSeq = secuenciaPropuesta(
    current.map((p) => p.id),
    proposal,
  );
  const currentSeq = current.map((p) => p.id).filter((id) => proposedSeq.includes(id));
  if (proposedSeq.length > 1 && proposedSeq.join("\u0000") !== currentSeq.join("\u0000")) {
    /* El orden RESULTANTE, con el mismo criterio que `buildPhaseOrder` cuando el reorder se
       acepta: primero las fases que la propuesta nombra, en su orden; despues las que no
       nombro, conservando el suyo. Replicarlo aca es lo que permite dar posiciones ABSOLUTAS
       (el "3o" que el CSE ve en pantalla) en vez de un "subio 2 puestos" relativo a un
       subconjunto que nadie tiene en la cabeza. */
    const resultante = [
      ...proposedSeq,
      ...current.map((p) => p.id).filter((id) => !proposedSeq.includes(id)),
    ];
    const puestoActual = new Map(current.map((p, i) => [p.id, i + 1]));
    const movimientos: MovimientoDeFase[] = [];
    resultante.forEach((id, i) => {
      const de = puestoActual.get(id);
      if (de === undefined || de === i + 1) return;
      movimientos.push({ id, nombre: byId.get(id)?.name ?? id, de, a: i + 1 });
    });
    const propuestaPorId = new Map(
      proposal.phases.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p]),
    );
    const motivos = [
      ...new Set(
        movimientos
          .map((m) => propuestaPorId.get(m.id)?.motivo)
          .filter((m): m is string => typeof m === "string" && m.length > 0),
      ),
    ];
    out.push({
      key: "reorder",
      kind: "REORDER_PHASES",
      ids: proposedSeq,
      names: proposedSeq.map((id) => byId.get(id)?.name ?? id),
      movimientos,
      ...(motivos.length > 0 ? { motivos } : {}),
    });
  }

  /* ⛔ LA IA NUNCA MUEVE EL ARRANQUE (decisión de Elías): la propuesta de las reuniones no da un
     SET_ANCHOR aunque traiga ancla. El armador ya nunca la escribe; esto es la segunda línea, acá
     y no en la ruta, para que la pantalla y el servidor vean los mismos cambios: si solo el
     servidor lo ignorara, el Gantt mostraría una sugerencia de arranque que nunca se aplica. */
  const toAnchor = origenDePropuesta(proposal) === "contexto" ? null : day(proposal.anchorStartDate);
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
    // La MISMA secuencia que mostró el delta (con las `movidas` de la de las reuniones).
    const wanted = secuenciaPropuesta(
      current.map((p) => p.id),
      proposal,
    );
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
    const actual = actualesPorId.get(slot.id);
    /* Solo lo que la sugerencia CAMBIA sale de la propuesta (la de las reuniones trae `campos`): la
       duración que el CSE editó después no se proyecta con el valor viejo de la foto. */
    const campos = propuesta ? camposDeLaFasePropuesta(propuesta, proposal) : [];
    const deLaPropuesta = (f: PhaseField) => !!propuesta && campos.includes(f);
    return {
      durationWeeks: (deLaPropuesta("durationWeeks") ? propuesta?.durationWeeks : actual?.durationWeeks) ?? 0,
      startWeek: (deLaPropuesta("startWeek") ? propuesta?.startWeek : actual?.startWeek) ?? null,
    };
  });
}

/** Lo que el chip no puede saber solo: dónde arranca HOY la fase (semana del proyecto desde 0). */
export interface ContextoDelCambio {
  /** El inicio que la fase tiene hoy en el Gantt, aunque arranque sola tras la anterior. */
  inicioActual?: number | null;
}

/**
 * Etiqueta humana de un cambio de campo (para el badge "Sugerencia" del Gantt).
 *
 * El inicio va en base 1, igual que el campo «inicia S» del Gantt (TimelineGantt: startWeek + 1):
 * con el valor crudo el CSE aceptaba un inicio una semana antes del que leía en la fila. Y una fase
 * que arranca sola (`startWeek` null, el caso normal) se lee por la semana en que arranca HOY
 * (`inicioActual`), o «tras la anterior»: el chip decía «inicio Sauto → S7» y no se sabía si la
 * sugerencia la adelantaba o la atrasaba (revisión adversarial, 2026-09-24).
 */
export function describeChange(c: PhaseFieldChange, ctx: ContextoDelCambio = {}): string {
  switch (c.field) {
    case "durationWeeks":
      return `${c.from ?? "?"} → ${c.to ?? "?"} semanas`;
    case "startWeek": {
      const desde =
        c.from != null ? `S${Number(c.from) + 1}` : ctx.inicioActual != null ? `S${ctx.inicioActual + 1}` : "tras la anterior";
      const hasta = c.to != null ? `S${Number(c.to) + 1}` : "tras la anterior";
      return `inicio ${desde} → ${hasta}`;
    }
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
