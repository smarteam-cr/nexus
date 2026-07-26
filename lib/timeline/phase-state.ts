/**
 * lib/timeline/phase-state.ts — EL ESTADO DE UNA FASE, DERIVADO. PURO.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * El `status` de una fase solo se mueve en dos gestos humanos: cuando alguien togglea la
 * última tarea, o cuando confirma el banner de avance. Si nadie entra al proyecto, el estado
 * queda congelado aunque el calendario siga corriendo. Una fase que terminó su ventana hace
 * seis semanas y sigue diciendo "Pendiente" no está informando: está mintiendo con precisión.
 *
 * ── DERIVAR PARA LEER, PROPONER PARA ESCRIBIR ────────────────────────────────
 * Este módulo **no escribe nada**. Devuelve lo que el estado SERÍA según las tareas y el
 * calendario, y en qué se aparta del estado guardado. El `status` persistido sigue siendo el
 * registro de lo que un humano declaró — que es justamente lo que `statusSource` audita — y
 * la regla dura del sistema (el agente nunca escribe estado) queda intacta, porque acá no hay
 * agente ni escritura.
 *
 * La pantalla muestra el estado REAL y, al lado, la divergencia con su motivo. No se falsea el
 * badge: si el CSE ve "Pendiente" y el sistema cree otra cosa, tiene que verse que son dos
 * cosas distintas, no una sola corregida en silencio.
 *
 * ── SUSPENDIDA CUENTA COMO RESUELTA ──────────────────────────────────────────
 * Mismo criterio que el resto del sistema: una tarea suspendida está aparcada a propósito y no
 * espera a nadie. Una fase con todo hecho más una suspendida está terminada.
 */

export type DerivedPhaseState = "PENDING" | "IN_PROGRESS" | "DONE";

export type PhaseDivergence =
  /** Marcada DONE pero le quedan tareas sin resolver. */
  | "CERRADA_CON_ABIERTAS"
  /** Todas sus tareas están resueltas y sigue abierta. */
  | "ABIERTA_CON_TODO_HECHO"
  /** Su ventana de calendario ya terminó y sigue sin cerrarse. */
  | "VENTANA_CERRADA_SIN_CERRAR"
  /** Su ventana ya arrancó y sigue en Pendiente, sin nada empezado. */
  | "ARRANCO_SIN_MARCAR";

export interface PhaseStateInput {
  status: string;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  tasks?: Array<{ status: string }>;
}

export interface PhaseStateContext {
  /** Semana (0-based) en la que arranca la fase — de `computePhaseRanges`. */
  phaseStart: number;
  durationWeeks: number;
  /** Semana actual del proyecto, fraccionaria. null sin fecha de arranque. */
  curWeek: number | null;
}

export interface PhaseStateResult {
  persisted: string;
  derived: DerivedPhaseState;
  divergences: PhaseDivergence[];
}

const RESUELTA = new Set(["DONE", "SUSPENDED"]);

export function derivePhaseState(p: PhaseStateInput, ctx: PhaseStateContext): PhaseStateResult {
  const tasks = p.tasks ?? [];
  const conTareas = tasks.length > 0;
  const resueltas = tasks.filter((t) => RESUELTA.has(t.status)).length;
  const algunaHecha = tasks.some((t) => t.status === "DONE" || t.status === "IN_PROGRESS");
  const todasResueltas = conTareas && resueltas === tasks.length;

  /* Sin tareas la única evidencia dura son las fechas reales: `actualEnd` lo sella el apply de
     avance y el PATCH de fase, así que si está, alguien lo cerró de verdad. El calendario NO
     entra acá: que la ventana haya pasado no hace que el trabajo esté hecho. */
  const derived: DerivedPhaseState = conTareas
    ? todasResueltas
      ? "DONE"
      : algunaHecha || p.actualStart
        ? "IN_PROGRESS"
        : "PENDING"
    : p.actualEnd
      ? "DONE"
      : p.actualStart
        ? "IN_PROGRESS"
        : "PENDING";

  const divergences: PhaseDivergence[] = [];
  if (p.status === "DONE" && conTareas && !todasResueltas) divergences.push("CERRADA_CON_ABIERTAS");
  if (p.status !== "DONE" && todasResueltas) divergences.push("ABIERTA_CON_TODO_HECHO");

  if (ctx.curWeek !== null) {
    const fin = ctx.phaseStart + Math.max(ctx.durationWeeks || 0, 0);
    if (ctx.curWeek >= fin && p.status !== "DONE") divergences.push("VENTANA_CERRADA_SIN_CERRAR");
    /* Solo si NO hay ninguna señal de arranque: el punto es "el calendario dice que ya empezó y
       nadie tocó nada", no "el calendario dice que empezó" a secas. */
    if (
      ctx.curWeek >= ctx.phaseStart &&
      p.status === "PENDING" &&
      !p.actualStart &&
      !algunaHecha
    ) {
      divergences.push("ARRANCO_SIN_MARCAR");
    }
  }

  return { persisted: p.status, derived, divergences };
}

/** Por qué el sistema cree que el estado guardado quedó viejo. Una línea, para el chip. */
export const DIVERGENCE_LABEL: Record<PhaseDivergence, string> = {
  CERRADA_CON_ABIERTAS: "Cerrada, pero le quedan tareas sin resolver",
  ABIERTA_CON_TODO_HECHO: "Todas sus tareas están resueltas y sigue abierta",
  VENTANA_CERRADA_SIN_CERRAR: "Su ventana de calendario terminó y sigue abierta",
  ARRANCO_SIN_MARCAR: "Ya debería haber arrancado y no tiene nada marcado",
};
