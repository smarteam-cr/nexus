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

/** El estado que se escribe al lado de la barra de una tarea del loop. null = nada (pendiente y a tiempo, o suspendida). */
export type EstadoDeLaTareaDelLoop = "hecho" | "en-curso-atrasada" | "atrasada" | "en-curso";

export const TEXTO_DEL_ESTADO_DEL_LOOP: Record<EstadoDeLaTareaDelLoop, string> = {
  hecho: "✓ Hecho",
  "en-curso-atrasada": "En curso · atrasada",
  atrasada: "Atrasada",
  "en-curso": "En curso",
};

/** Como en la lista por semana: una atrasada que ya se está trabajando no se confunde con una que ni empezó. */
export function estadoDeLaTareaDelLoop(status: string | null | undefined, atrasada: boolean): EstadoDeLaTareaDelLoop | null {
  if (status === "SUSPENDED") return null;
  if (status === "DONE") return "hecho";
  if (atrasada) return status === "IN_PROGRESS" ? "en-curso-atrasada" : "atrasada";
  return status === "IN_PROGRESS" ? "en-curso" : null;
}

/**
 * Dónde va la barra de una tarea (semanas absolutas, inclusivas) y en qué columna se escribe su estado: la que sigue a
 * la barra. Si la barra llega a la última columna, null: el estado va junto al título (si no, no se vería).
 */
export function barraDeLaTarea(
  inicioDeLaFase: number,
  t: TareaDelLoop,
  columnas: number,
): { desde: number; hasta: number; columnaDelEstado: number | null } {
  const desde = inicioDeLaFase + t.weekIndex;
  const hasta = inicioDeLaFase + ultimaSemanaDeLaTarea(t.weekIndex, t.semanas);
  return { desde, hasta, columnaDelEstado: hasta + 1 < columnas ? hasta + 1 : null };
}
