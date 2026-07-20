/**
 * lib/timeline/weeks.ts
 *
 * Matemática de semanas del cronograma (ProjectTimeline) — funciones PURAS,
 * client-safe, sin Prisma. Única fuente de la conversión semanas → fechas:
 * la consumen el editor interno (CronogramaCanvas), el Gantt interno
 * (TimelineGantt) y la landing del cliente (TimelineSection). Centralizado para
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

/**
 * ZONAS HORARIAS — regla del archivo:
 *
 * El `anchorStartDate` es una FECHA DE CALENDARIO guardada como instante UTC
 * (`new Date("2026-05-19").toISOString()`). Todo lo derivado del anchor se lee e
 * imprime en **UTC** (`getUTC*`). Con getters LOCALES el día "salta" en cualquier
 * zona detrás de UTC: el server (contenedor en UTC) y el browser (p.ej. UTC-6)
 * renderizaban días distintos → **hydration mismatch** + la fecha se mostraba un
 * día antes.
 *
 * La única excepción es la fecha de HOY del usuario, que sí es hora de pared local
 * → `fmtLocalDay`, y SOLO puede usarse en el cliente (nunca en SSR).
 */

/** Fecha resultante de sumar `w` semanas al anchor (aritmética de calendario, UTC). */
export function addWeeks(iso: string, w: number): Date {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + w * 7);
  return d;
}

/** "14 ago" — día de calendario del anchor (UTC, estable server↔cliente). */
export function fmtDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14 ago 2026" — día de calendario del anchor (UTC, estable server↔cliente). */
export function fmtFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "9 jul 2026" para la fecha de HOY del usuario (hora de pared LOCAL).
 *  SOLO cliente, después de montar — usarlo en SSR reintroduce el mismatch. */
export function fmtLocalDay(d: Date): string {
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
 * Rangos absolutos de cada fase, en el orden recibido (pasar YA ordenadas por `order`).
 *
 * Inicio EXPLÍCITO opcional (`startWeek`): si una fase lo trae, arranca ahí (permite SOLAPE →
 * fases en paralelo). Si es null/undefined, es CONTIGUA: arranca donde terminó la fase anterior.
 * Con todas las fases sin `startWeek` el resultado es idéntico al acumulado clásico.
 */
export function computePhaseRanges(
  phases: Array<{ durationWeeks: number; startWeek?: number | null }>,
): PhaseRange[] {
  let cursor = 0;
  return phases.map((p) => {
    const dur = p.durationWeeks || 1;
    const start = p.startWeek != null ? p.startWeek : cursor;
    const end = start + dur;
    cursor = end; // la siguiente fase contigua arranca al fin de ESTA
    return { start, end };
  });
}

/** Total de semanas-fase (ESFUERZO; suma de duraciones). NO es el ancho de calendario. */
export function totalWeeks(phases: Array<{ durationWeeks: number }>): number {
  return phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);
}

/**
 * Ancho de CALENDARIO del cronograma = última semana ocupada (max end). Con fases en paralelo
 * el span ≤ suma de duraciones; con secuencial puro span == suma. Lo usa la grilla del Gantt.
 */
export function timelineSpan(
  phases: Array<{ durationWeeks: number; startWeek?: number | null }>,
): number {
  return computePhaseRanges(phases).reduce((m, r) => Math.max(m, r.end), 0);
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
  const a = new Date(anchor);
  // Día de calendario del anchor (UTC) vs día de hoy del usuario (hora de pared
  // LOCAL), ambos normalizados a la misma escala para restar sin sesgo de zona.
  // `now` debe venir del CLIENTE (ver la nota de zonas horarias arriba).
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / (7 * 24 * 60 * 60 * 1000));
}

/** Semana absoluta de una tarea: inicio de su fase + weekIndex relativo. */
export function absoluteWeek(phaseStart: number, weekIndex: number): number {
  return phaseStart + weekIndex;
}

/**
 * Fecha de FIN PLANEADO de una tarea (fin de su semana absoluta) según el anchor.
 * Convención "+1 = fin de semana" (misma que summary.ts): una tarea en la semana
 * absoluta `w` se espera terminada al llegar la fecha `anchor + (w+1) semanas`.
 * null si no hay anchor (sin anchor no hay fechas, solo números de semana).
 */
export function overduePlannedEnd(
  anchor: string | null | undefined,
  phaseStart: number,
  weekIndex: number,
): Date | null {
  if (!anchor) return null;
  return addWeeks(anchor, absoluteWeek(phaseStart, weekIndex) + 1);
}

/**
 * Predicado ÚNICO de atraso, por FECHA (no por semana): una tarea está ATRASADA si
 * su fin planeado ya pasó y todavía no está resuelta — ni DONE ni SUSPENDED (sigue
 * PENDING o IN_PROGRESS). Mismo criterio que el panel de cartera (summary.ts), para
 * que la vista interna, la del cliente y el resumen nunca muestren números que se
 * contradigan. Es ORTOGONAL al estado: el badge muestra el estado real y "atrasada"
 * se marca aparte en rojo. Derivado en render — nunca se persiste.
 *
 * `now` debe venir del CLIENTE (hora de pared local; ver nota de zonas horarias).
 * Con `plannedEnd`/`now` null (sin anchor o sin montar) devuelve false.
 */
export function isOverdueByDate(plannedEnd: Date | null, now: Date | null, status: string): boolean {
  if (!plannedEnd || !now) return false;
  return plannedEnd < now && status !== "DONE" && status !== "SUSPENDED";
}
