/**
 * lib/projects/estado-hubspot.ts — EL SEMÁFORO DEL PROYECTO, Y QUÉ PUEDE PROPONER NEXUS.
 *
 * ── QUÉ ES ───────────────────────────────────────────────────────────────────
 * `hs_status` del objeto Proyectos: seis valores que dicen CÓMO va el proyecto. Es otra cosa que
 * la ETAPA (`hs_pipeline_stage`), que dice DÓNDE está — la columna del tablero. Las dos divergen
 * en la vida real y está bien que diverjan: hay proyectos en la columna «Finalizado» con estado
 * «Bloqueado», y al revés.
 *
 * ── POR QUÉ ESTE MÓDULO ──────────────────────────────────────────────────────
 * Medido el 2026-08-15: de los 67 proyectos espejados en HubSpot, **24 no tienen estado cargado**,
 * y de los 43 que sí, muchos quedaron viejos. Elías pidió que Nexus proponga el valor y lo mande
 * con un clic. Antes de escribir nada hacia afuera, la decisión de QUÉ proponer vive acá, pura y
 * probada: un valor mal propuesto que alguien acepta sin mirar cambia lo que ve todo el equipo.
 */

/** Los seis valores de `hs_status`, tal cual los guarda HubSpot. La lista la define HubSpot. */
export type EstadoHubspot =
  | "on_track"
  | "delayed"
  | "blocked"
  | "on_hold"
  | "at_risk"
  | "completed";

/**
 * ⛔ EL VALOR QUE NEXUS NO PROPONE NUNCA, POR MÁS EVIDENCIA QUE HAYA.
 *
 * Escribir `completed` no es rotular: **cierra el proyecto**. El espejo lo lee como cierre, lo
 * pasa a inactivo, y reactivarlo no está resuelto hoy. Un cierre es una decisión de negocio con
 * consecuencias en cobranza y en cartera, y no puede salir de un botón que alguien aprieta
 * mirando una sugerencia.
 *
 * Si alguna vez se quiere habilitar, no alcanza con sacarlo de acá: hay que resolver primero cómo
 * se DESHACE un cierre.
 */
export const ESTADO_VETADO: EstadoHubspot = "completed";

/** Lo que Nexus sí puede proponer. */
export const ESTADOS_PROPONIBLES: readonly EstadoHubspot[] = [
  "on_track",
  "delayed",
  "blocked",
  "on_hold",
  "at_risk",
];

export function esProponible(valor: string): valor is EstadoHubspot {
  return (ESTADOS_PROPONIBLES as readonly string[]).includes(valor);
}

/** Sin acentos, sin mayúsculas, sin espacios de más: los labels de HubSpot varían al tipearse. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * El motivo cargado a mano en HubSpot → el estado que implica.
 *
 * ── LA DECISIÓN DE NEGOCIO (Elías, 2026-08-16) ───────────────────────────────
 * El campo se llama «motivo de BLOQUEO» pero el equipo lo usa como motivo de ATRASO: hay 29
 * proyectos con motivo cargado y solo 3 en estado Bloqueado. Se traduce por valor, que es lo que
 * cada frase dice de verdad — no todo motivo significa bloqueado.
 *
 * ⚠ SOLO CUATRO DE LOS SIETE VALORES ESTÁN ACÁ, y es deliberado. La lista completa la define
 * HubSpot y no existe en este repo; estos cuatro son los que aparecen en producción (Atraso por
 * cliente 13 · Atraso por Smarteam 12 · Cliente no responde 3 · Cliente pidió pausa 1). Un motivo
 * que no reconocemos devuelve `null` = **no se propone nada**. Adivinar el estado de un valor que
 * nunca vimos es exactamente el error que después alguien acepta sin mirar.
 */
const ESTADO_POR_MOTIVO: Record<string, EstadoHubspot> = {
  "atraso por cliente": "delayed",
  "atraso por smarteam": "delayed",
  "cliente no responde": "blocked",
  "cliente pidio pausa": "on_hold",
};

export function estadoSegunMotivo(motivo: string | null | undefined): EstadoHubspot | null {
  if (!motivo) return null;
  return ESTADO_POR_MOTIVO[normalizar(motivo)] ?? null;
}

/** Lo que Nexus le sugiere a un humano sobre el estado de un proyecto. */
export interface PropuestaDeEstado {
  valor: EstadoHubspot;
  /** Por qué, en una frase que se le muestra a la persona antes de que acepte. */
  motivo: string;
}

/**
 * ¿Hay algo que proponer para este proyecto?
 *
 * Devuelve `null` —que es el caso más común y el correcto— cuando el estado ya coincide con lo
 * que la evidencia dice, cuando no hay evidencia, o cuando el valor que saldría está vetado.
 *
 * ⚠ NO propone sobre un proyecto ya cerrado: si HubSpot dice `completed`, moverlo de ahí es
 * reabrir, y eso tiene el mismo problema que cerrarlo.
 */
export function proponerEstadoDesdeMotivo(
  actual: string | null | undefined,
  motivo: string | null | undefined,
): PropuestaDeEstado | null {
  if (actual === ESTADO_VETADO) return null;

  const implicado = estadoSegunMotivo(motivo);
  if (!implicado) return null;
  if (!esProponible(implicado)) return null;
  if (actual === implicado) return null;

  return {
    valor: implicado,
    motivo: `En HubSpot está registrado el motivo «${motivo!.trim()}», que corresponde a este estado.`,
  };
}
