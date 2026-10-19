/** lib/mi-dia/constantes.ts — los números del inicio («Para ti»), en un solo lugar. CLIENT-SAFE. */

/** Cuántos días hacia adelante se mira si una cuenta tiene su reunión (decisión 2, 2026-10-16). */
export const DIAS_PARA_LA_REUNION = 8;

/** La primera y la última hora de la grilla de la agenda, en Costa Rica (como Google Calendar en la vista de día). */
export const HORA_INICIO_DE_LA_AGENDA = 8;
export const HORA_FIN_DE_LA_AGENDA = 18;

/** Cuánto tiene que durar un hueco libre para que Nexus lo sugiera para avanzar algo. */
export const MINUTOS_DE_UN_HUECO = 60;

/**
 * El horario laboral de Smarteam, en Costa Rica: de lunes a viernes, de 8:00 a 17:00. Ningún hueco ni hora que sugiera
 * Nexus («Agendar», «+ Crear evento», el hueco libre) cae fuera de él. La grilla igual va hasta las 18:00.
 */
export const HORA_INICIO_LABORAL = 8;
export const HORA_FIN_LABORAL = 17;

/**
 * El almuerzo (2026-10-19, supuesto declarado). Si la persona marcó su almuerzo en el calendario (un evento «Almuerzo»,
 * «Lunch», «Comida»…), ese es: Nexus no sugiere nada encima. Si no lo marcó, Nexus no sugiere nada de 12:00 a 13:00.
 * Tocar esa hora para crear un evento a mano sigue funcionando: esto es solo para lo que propone Nexus.
 */
export const HORA_DEL_ALMUERZO = 12;
export const MINUTOS_DEL_ALMUERZO = 60;

/** Cuántos bloques sugiere Nexus en un mismo espacio libre, como mucho (uno por tarea, del tamaño de la tarea). */
export const MAX_BLOQUES_POR_ESPACIO = 2;
