/**
 * lib/tareas/sprint.ts — lo que la lectura de la reunión del SPRINT hace distinto (2026-10-27, decisión de Elías,
 * pregunta 7 del roadmap; DECISIONS «Tareas: la reunión del sprint sin el tope de 5…»). CLIENT-SAFE y puro.
 *
 * La reunión del sprint es la de una serie que configuró un equipo (`FuenteDeTareas` con `equipo`; la personal no tiene
 * equipo y no es un sprint). Ahí se acuerda el trabajo de la semana, así que:
 *   · no corta en 5 por persona (`MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT` es solo un tope de seguridad), y
 *   · además de las notas lee la conversación, con el mismo nivel 2 de siempre (`leerLaConversacion`).
 * Una reunión con un cliente sigue con 3 y cualquier otra del equipo con 5.
 */
import {
  MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT,
  MAX_PROPUESTAS_POR_PERSONA_POR_REUNION,
  MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE,
  MIN_CARACTERES_DE_CONVERSACION,
} from "./reglas";

/**
 * ¿La lectura viene de la serie del sprint de un equipo? La personal (sin equipo) y la pedida a mano, no. Si la fuente
 * se borró (`fuenteId` queda en null), lo dice la marca que la lectura guardó en su resumen al leer.
 */
export function esLecturaDelSprint(fuente: { equipo: string | null } | null | undefined, resumen?: unknown): boolean {
  if (fuente?.equipo) return true;
  return !!resumen && typeof resumen === "object" && (resumen as { delSprint?: unknown }).delSprint === true;
}

/** El tope por persona de una reunión: 3 con un cliente o un prospecto, el de seguridad en el sprint, 5 en otra del equipo. */
export function topeDeLaReunion(clienteDeLaReunion: string | null, delSprint: boolean): number {
  if (clienteDeLaReunion) return MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE;
  return delSprint ? MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT : MAX_PROPUESTAS_POR_PERSONA_POR_REUNION;
}

/**
 * Después de leer las notas del sprint, ¿se lee también la conversación? Sí, si hay una conversación grabada y nadie la
 * leyó ni la está leyendo. Una transcripción sin turnos «Nombre: texto» ya se sabe que no tiene qué leer. El cupo
 * automático del día lo mira quien llama (necesita la base).
 */
export function leerTambienLaConversacion(p: {
  delSprint: boolean;
  largoTranscript: number;
  conversacion?: { estado: string; motivo?: string | null } | null;
}): boolean {
  if (!p.delSprint || p.largoTranscript < MIN_CARACTERES_DE_CONVERSACION) return false;
  const c = p.conversacion;
  if (!c) return true;
  return !["lista", "leyendo"].includes(c.estado) && c.motivo !== "sin_turnos";
}
