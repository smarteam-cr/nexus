/**
 * lib/timeline/semanas-del-loop.ts — cómo se pinta la fila plegada de un LOOP (2026-11-19, Elías: «no se ven las
 * semanas de cada uno»). Client-safe y puro: lo usan el Gantt del equipo (TimelineGantt) y la vista del cliente
 * (TimelineSection), así las dos pintan la misma semana del mismo color.
 *
 * Un loop corre todo el ciclo, así que la barra llena no dice nada: la fila dibuja sus TAREAS en sus semanas, como el
 * plan de Valentina. Solo si tiene alguna tarea que no esté suspendida; si no (recién creado, o el detalle sin confirmar
 * para el cliente), la barra de siempre.
 */
import { ultimaSemanaDeLaTarea } from "./weeks";

export interface TareaDelLoop {
  weekIndex: number;
  semanas?: number | null;
  status?: string | null;
  title?: string | null;
}

export type SemanaDelLoop = "vacia" | "hecho" | "en-curso";

const corre = (t: TareaDelLoop) => t.status !== "SUSPENDED";

/** ¿La fila de este loop se pinta por tareas? (si no, con la barra de siempre). */
export function pintaPorTareas(loopNumero: number | null | undefined, tareas: readonly TareaDelLoop[]): boolean {
  return loopNumero != null && tareas.some(corre);
}

/** Las tareas que corren en la semana `semana` (desde 0, relativa a la fase): una de varias semanas, en todas. */
export function tareasDeLaSemana<T extends TareaDelLoop>(tareas: readonly T[], semana: number): T[] {
  return tareas.filter((t) => corre(t) && semana >= t.weekIndex && semana <= ultimaSemanaDeLaTarea(t.weekIndex, t.semanas));
}

/** Verde si todo lo de esa semana está hecho, azul si hay algo en curso o por hacer, vacío si no hay nada. */
export function colorDeLaSemana(tareas: readonly TareaDelLoop[], semana: number): SemanaDelLoop {
  const de = tareasDeLaSemana(tareas, semana);
  if (de.length === 0) return "vacia";
  return de.every((t) => t.status === "DONE") ? "hecho" : "en-curso";
}
