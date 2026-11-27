/**
 * lib/timeline/avance-por-semana.ts — cómo se pinta cada semana de una fase en la página del cliente (2026-11-27,
 * Elías: «no se nota cuáles tareas ya hicimos; no da sensación de avance»). Puro y client-safe.
 *
 * Una celda por semana de la fase, con el estado de las tareas que CORREN esa semana (una tarea de tres semanas cuenta
 * en las tres):
 *   · «atrasada»   — alguna se pasó de su fecha y no está hecha (solo si la página muestra atrasadas);
 *   · «hecha»      — todas hechas;
 *   · «en-curso»   — alguna en curso, o unas hechas y otras no;
 *   · «por-hacer»  — hay tareas y ninguna empezó;
 *   · «sin-tareas» — esa semana no corre ninguna.
 * El orden importa: lo atrasado gana a todo (es lo que el cliente tiene que ver), y «hecha» exige TODAS.
 *
 * Sin tareas en la fase porque el detalle no está confirmado (`tasks` ausente) → null: la página pinta el rango sin
 * estado. Inventar «por hacer» acusaría al equipo de no haber empezado nada. Lo mismo con una foto de antes de que el
 * estado cruzara (junio 2026): tareas sin `status` no dicen nada del avance, y una tarea sin estado nunca está
 * «atrasada» (el detalle de la fase tampoco la marca: la página no se contradice).
 */
import { addWeeks, isOverdueByDate, overduePlannedEnd, semanasDeLaTarea } from "./weeks";

export type EstadoDeSemana = "hecha" | "en-curso" | "por-hacer" | "atrasada" | "sin-tareas";

export interface TareaParaElAvance {
  weekIndex: number;
  semanas?: number | null;
  status?: string;
}

export function estadosDeLasSemanas(
  fase: { durationWeeks: number; tasks?: readonly TareaParaElAvance[] },
  inicioDeFase: number,
  anchor: string | null,
  now: Date | null,
  conAtrasadas: boolean,
): EstadoDeSemana[] | null {
  if (!fase.tasks) return null;
  if (fase.tasks.length > 0 && fase.tasks.every((t) => !t.status)) return null;
  const tareas = fase.tasks.map((t) => ({
    desde: t.weekIndex,
    hasta: t.weekIndex + semanasDeLaTarea(t.semanas) - 1,
    status: t.status ?? "PENDING",
    atrasada: conAtrasadas && tareaAtrasada(t, inicioDeFase, anchor, now),
  }));
  return Array.from({ length: Math.max(0, fase.durationWeeks) }, (_, w) => {
    const corren = tareas.filter((t) => w >= t.desde && w <= t.hasta);
    if (corren.length === 0) return "sin-tareas";
    if (corren.some((t) => t.atrasada)) return "atrasada";
    if (corren.every((t) => t.status === "DONE")) return "hecha";
    if (corren.some((t) => t.status === "IN_PROGRESS" || t.status === "DONE")) return "en-curso";
    return "por-hacer";
  });
}

/**
 * ¿Esta tarea se pasó de su fecha sin estar hecha? La ÚNICA regla de la página del cliente: la usan las semanas, el
 * conteo de la fila, la línea de estado y el chip del detalle. Sin estado (una foto vieja) no está atrasada.
 */
export function tareaAtrasada(
  t: TareaParaElAvance,
  inicioDeFase: number,
  anchor: string | null,
  now: Date | null,
): boolean {
  return !!t.status && isOverdueByDate(overduePlannedEnd(anchor, inicioDeFase, t.weekIndex, t.semanas), now, t.status);
}

/**
 * Dónde cae HOY sobre el cronograma, de 0 a 1 (la línea «Hoy»): el día dentro de su semana, no solo la semana. null si
 * no hay fecha de arranque, si todavía no arrancó o si ya terminó (la línea no se dibuja fuera de la grilla).
 * `now` es hora de pared del USUARIO: solo después de montar (ver la nota de zonas de lib/timeline/weeks.ts).
 */
export function dondeCaeHoy(anchor: string | null, now: Date | null, totalSemanas: number): number | null {
  if (!anchor || !now || totalSemanas <= 0) return null;
  const a = new Date(anchor);
  const inicio = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const hoy = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  // El medio del día: el 26 nov se dibuja dentro de su día, no en el borde con el anterior.
  const dias = (hoy - inicio) / 86_400_000 + 0.5;
  const fraccion = dias / (totalSemanas * 7);
  return fraccion > 0 && fraccion < 1 ? fraccion : null;
}

/** El último día de la semana `w` desde el arranque («8 nov»): el rango de una semana dice dónde termina, no dónde empieza la siguiente. */
export function finDeLaSemana(anchor: string, w: number): Date {
  const d = addWeeks(anchor, w + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
