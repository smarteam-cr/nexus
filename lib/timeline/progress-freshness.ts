/**
 * lib/timeline/progress-freshness.ts — ¿EL AVANCE QUE MUESTRA ESTE CRONOGRAMA ES CIERTO? PURO.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Un avance de 0% puede significar dos cosas opuestas: que el proyecto no arrancó, o que
 * arrancó hace meses y nadie marcó nada. Hoy la pantalla dice lo mismo en los dos casos.
 * En la base hay **seis proyectos con decenas de tareas y CERO marcadas** —0/42, 0/61, 0/85,
 * 0/35, 0/40, 0/46— y varios de ellos con entregas vencidas. Ninguno está sin empezar: sus
 * cronogramas están mintiendo.
 *
 * Esto no es un problema estético. La bandeja del CSE muestra 13-17 proyectos con su avance;
 * si seis de ellos dicen 0% sin explicar por qué, la pantalla entera pierde credibilidad.
 *
 * ── LA CONFIANZA SALE DE LOS HECHOS, NO DE UN MODELO ─────────────────────────
 * Todo acá son conteos y fechas: cuántas tareas hay, cuántas están resueltas, cuántas
 * vencidas, y cuándo fue la última vez que alguien miró. No se le pide a ningún modelo un
 * número de confianza — en modelos cerrados esa autoevaluación está mal calibrada (AUC ≈ 0,54,
 * apenas mejor que azar), así que sería un número que se ve serio y no informa nada.
 *
 * ── POR QUÉ HACEN FALTA DOS FECHAS ───────────────────────────────────────────
 * `lastProgressAt` es la última vez que alguien CAMBIÓ algo. `progressReviewedAt` es la última
 * vez que alguien MIRÓ y concluyó que estaba bien así. Sin la segunda, un CSE que revisa un
 * proyecto sano y no toca nada deja el proyecto leyéndose viejo para siempre — y la bandeja le
 * volvería a pedir lo mismo mañana. "Lo miré y está al día" es un dato, no la ausencia de uno.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A partir de cuántos días sin mirar un cronograma con vencidos se considera desactualizado.
 *  Es el mismo umbral que `STALL_DAYS` de la cartera: dos números distintos para "hace mucho"
 *  obligan a explicar cuál rige en cada pantalla. */
export const STALE_MARKING_DAYS = 14;

export type MarkingState =
  /** No hay tareas: no hay nada que marcar. Es "sin detalle", no "0% de avance". */
  | "SIN_DETALLE"
  /** Hay tareas, ninguna resuelta, y ya hay vencidas. El cronograma está mintiendo. */
  | "SIN_MARCAR"
  /** Hay vencidas y hace más de dos semanas que nadie mira. */
  | "DESACTUALIZADO"
  /** O está al día, o alguien lo revisó hace poco y dijo que así estaba bien. */
  | "AL_DIA";

export interface MarkingInput {
  /** Tareas que cuentan para el avance (suspendidas ya fuera — ver `resolvedTaskCounts`). */
  tasksTotal: number;
  /** DONE + SUSPENDED. */
  tasksResolved: number;
  /** Vencidas y sin resolver, hoy. */
  overdueUnresolved: number;
  /** Último cambio de avance confirmado (TimelineChange kind=PROGRESS). */
  lastProgressAt: Date | string | null;
  /** Última vez que alguien revisó y NO cambió nada. */
  progressReviewedAt: Date | string | null;
  now: Date;
}

export interface MarkingResult {
  state: MarkingState;
  /** Días desde la última señal de que alguien miró (cambio o revisión). null si nunca. */
  daysSinceReview: number | null;
}

const ms = (v: Date | string | null): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

export function deriveMarking(i: MarkingInput): MarkingResult {
  // La señal más reciente de que un humano puso los ojos acá, venga de donde venga.
  const miradas = [ms(i.lastProgressAt), ms(i.progressReviewedAt)].filter((t): t is number => t !== null);
  const ultimaMirada = miradas.length ? Math.max(...miradas) : null;
  const daysSinceReview =
    ultimaMirada === null ? null : Math.floor((i.now.getTime() - ultimaMirada) / DAY_MS);

  if (i.tasksTotal === 0) return { state: "SIN_DETALLE", daysSinceReview };

  /* El caso más grave y el más frecuente: hay plan, hay fechas que ya pasaron, y nadie tocó
     una sola casilla. No importa hace cuánto se miró — si nunca se marcó nada, el número que
     muestra la pantalla no es un avance, es un valor por defecto. */
  if (i.tasksResolved === 0 && i.overdueUnresolved > 0) {
    return { state: "SIN_MARCAR", daysSinceReview };
  }

  /* Sin vencidas no se molesta a nadie: un cronograma que va al día no necesita revisión
     periódica, y pedirla convierte la bandeja en ruido de fondo. */
  if (i.overdueUnresolved === 0) return { state: "AL_DIA", daysSinceReview };

  if (daysSinceReview === null || daysSinceReview >= STALE_MARKING_DAYS) {
    return { state: "DESACTUALIZADO", daysSinceReview };
  }
  return { state: "AL_DIA", daysSinceReview };
}

/** Copy corto por estado, para que las pantallas no inventen cada una el suyo. */
export const MARKING_LABEL: Record<MarkingState, string> = {
  SIN_DETALLE: "Sin detalle",
  SIN_MARCAR: "Sin marcar desde el arranque",
  DESACTUALIZADO: "Avance sin revisar",
  AL_DIA: "Al día",
};
