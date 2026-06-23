/**
 * lib/timeline/weeks.ts
 *
 * Matemática de semanas del cronograma (ProjectTimeline) — funciones PURAS,
 * client-safe, sin Prisma. Única fuente de la conversión semanas → fechas:
 * la consumen el editor interno (CronogramaCanvas), el Gantt interno
 * (TimelineGantt) y la landing del cliente (KickoffLanding). Centralizado para
 * que la vista interna y la del cliente nunca muestren fechas distintas.
 *
 * Convenciones:
 *  - Las fases son CONTIGUAS: el inicio de cada una es la suma de durationWeeks
 *    de las anteriores (en `order`).
 *  - `weekIndex` de una tarea es 0-indexed RELATIVO a su fase. En UI se muestra
 *    1-based ("Semana 1").
 *  - Sin `anchorStartDate` no hay fechas reales — solo números de semana.
 */

export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fecha resultante de sumar `w` semanas a una fecha ISO. */
export function addWeeks(iso: string, w: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + w * 7);
  return d;
}

/** "14 ago" */
export function fmtDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "14 ago 2026" */
export function fmtFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Pluralización simple: plural(1,"sesión","sesiones") → "1 sesión". */
export function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

export interface PhaseRange {
  /** Semana absoluta de inicio de la fase (0-indexed, inclusiva). */
  start: number;
  /** Semana absoluta de fin (exclusiva): start + durationWeeks. */
  end: number;
}

/**
 * Rangos absolutos acumulados de cada fase, en el orden recibido.
 * El llamador debe pasar las fases YA ordenadas por `order`.
 */
export function computePhaseRanges(phases: Array<{ durationWeeks: number }>): PhaseRange[] {
  let cum = 0;
  return phases.map((p) => {
    const start = cum;
    cum += p.durationWeeks || 1;
    return { start, end: cum };
  });
}

/** Total de semanas del cronograma. */
export function totalWeeks(phases: Array<{ durationWeeks: number }>): number {
  return phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);
}

/**
 * Rango legible de una fase: con anchor → "1 ago – 14 ago";
 * sin anchor → "Semana 1–3" (1-based en UI).
 */
export function fmtPhaseRange(anchor: string | null | undefined, range: PhaseRange): string {
  if (anchor) {
    return `${fmtDay(addWeeks(anchor, range.start))} – ${fmtDay(addWeeks(anchor, range.end))}`;
  }
  return `Semana ${range.start + 1}${range.end > range.start + 1 ? `–${range.end}` : ""}`;
}

/**
 * Índice de la semana actual (0-indexed, absoluto al proyecto) según el anchor.
 * null si no hay anchor. Puede ser negativo (proyecto no arrancó) o >= total
 * (proyecto terminado) — el render decide cómo tratarlo.
 */
export function currentWeekIndex(anchor: string | null | undefined, now: Date = new Date()): number | null {
  if (!anchor) return null;
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/** Semana absoluta de una tarea: inicio de su fase + weekIndex relativo. */
export function absoluteWeek(phaseStart: number, weekIndex: number): number {
  return phaseStart + weekIndex;
}

/**
 * Una tarea está ATRASADA si su semana absoluta ya pasó por completo y todavía
 * no está resuelta — ni DONE ni SUSPENDED (sigue PENDING o IN_PROGRESS). Es ORTOGONAL al estado: el badge
 * muestra el estado real (pendiente / en curso / hecho) y "atrasada" se marca
 * aparte en rojo. Derivado en render — nunca se persiste (D.3 manejará alertas).
 */
export function isOverdue(absWeek: number, currentWeek: number | null, status: string): boolean {
  if (currentWeek === null) return false;
  return absWeek < currentWeek && status !== "DONE" && status !== "SUSPENDED";
}
