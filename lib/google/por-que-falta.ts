/**
 * lib/google/por-que-falta.ts — POR QUÉ una reunión de Meet no tiene transcripción. PURO (sin red ni base).
 *
 * Ficha C del roadmap («Que no falte ninguna reunión», 2026-10-17). Elías: «bajo ninguna circunstancia se pierda
 * contexto», y faltan transcripciones, también de Desarrollo. Cada reunión sin transcripción cae en UN motivo, y cada
 * motivo dice de quién es el arreglo: de Nexus (ya lo arregló este cambio, o lo arregla el rescate) o de Google Workspace
 * (la reunión no se grabó, no se transcribió, o el documento quedó donde Nexus no puede leer). Lo usan
 * scripts/medir-transcripciones-faltantes.ts (solo lectura) y el tablero de salud de las reuniones (T1,
 * lib/sessions/salud-de-las-reuniones.ts). Desde el 2026-10-25, una reunión cuyo evento se canceló dice «cancelada».
 *
 * El orden de las reglas ES el criterio: lo que dice la fila de Nexus va primero (todavía no terminó, se está
 * esperando, falló la lectura), después lo que dice Google (no había documento, el documento no traía transcripción).
 */
import { esDeNuestroEquipo, esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";
import { MARGEN_TRAS_EL_FIN_MS, MAX_ENRICH_ATTEMPTS, estaEsperandoMaterial, finDeLaReunion, listaParaLeer } from "./enrich-retry";

export type MotivoDeLaFalta =
  /** El evento se canceló en el calendario (U1, `canceladaEn`): probablemente no ocurrió. Nada que hacer. */
  | "cancelada"
  /** Todavía no terminó (o terminó hace menos de 20 minutos). Nada que hacer. */
  | "todavia_no_termino"
  /** Pendiente de la primera lectura de Nexus (la pasada siguiente la toma). */
  | "pendiente_de_leer"
  /** Nexus la leyó, no había nada todavía, y la vuelve a mirar (hasta 48 horas después del fin). */
  | "esperando_a_google"
  /** La lectura falló (cuota, red, permiso) y se reintenta sola. */
  | "fallo_de_lectura_reintentando"
  /** La lectura falló cinco veces y quedó sellada con su error. Se mira el error. */
  | "fallo_de_lectura_sellada"
  /** Nexus la buscó antes de que terminara (la pasada vieja leía una hora después del inicio). Lo arregla el rescate. */
  | "leida_antes_de_terminar"
  /** Nadie del equipo estuvo invitado: no hay con qué cuenta leerla. */
  | "sin_nadie_del_equipo"
  /** Tiene notas de Gemini pero no transcripción: se tomaron notas sin «Transcribir». Google Workspace. */
  | "solo_notas_sin_transcripcion"
  /** El evento tiene documento y el documento no trae ni notas ni transcripción (quedó vacío). Google Workspace. */
  | "documento_vacio"
  /** Sin documento en el evento ni en Drive, y la organizó alguien del equipo: no se grabó ni se tomaron notas. */
  | "no_se_grabo"
  /** Sin documento, y la organizó alguien de afuera: el material, si existe, quedó en el Drive de esa persona. */
  | "organizada_por_afuera";

export type DuenoDelArreglo = "nada" | "nexus" | "google_workspace" | "persona";

export const DE_QUIEN_ES: Record<MotivoDeLaFalta, { dueno: DuenoDelArreglo; texto: string }> = {
  cancelada: { dueno: "nada", texto: "El evento se canceló en el calendario: lo más probable es que no ocurrió." },
  todavia_no_termino: { dueno: "nada", texto: "Todavía no terminó (o terminó hace menos de 20 minutos)." },
  pendiente_de_leer: { dueno: "nada", texto: "Nexus todavía no la leyó: la toma la pasada siguiente." },
  esperando_a_google: { dueno: "nada", texto: "Nexus la leyó y Google todavía no tenía nada; la vuelve a mirar (hasta 48 horas)." },
  fallo_de_lectura_reintentando: { dueno: "nada", texto: "La lectura falló y se reintenta sola." },
  fallo_de_lectura_sellada: { dueno: "nexus", texto: "La lectura falló cinco veces: mirar el error (permiso del documento, cuenta borrada)." },
  leida_antes_de_terminar: { dueno: "nexus", texto: "Nexus la leyó antes de que terminara: la vuelve a leer el rescate (--solo-antes-de-terminar)." },
  sin_nadie_del_equipo: { dueno: "persona", texto: "Nadie del equipo estuvo invitado: no hay con qué cuenta leerla." },
  solo_notas_sin_transcripcion: { dueno: "google_workspace", texto: "Se tomaron notas con Gemini pero sin «Transcribir»." },
  documento_vacio: { dueno: "google_workspace", texto: "El documento de la reunión quedó vacío (Gemini no tomó notas)." },
  no_se_grabo: { dueno: "google_workspace", texto: "No se tomaron notas ni se transcribió la reunión." },
  organizada_por_afuera: { dueno: "google_workspace", texto: "La organizó alguien de afuera y nadie del equipo activó las notas." },
};

export interface ReunionSinTranscripcion {
  date: Date;
  duration: number | null;
  enrichedAt: Date | null;
  enrichAttempts: number;
  enrichError: string | null;
  googleDocId: string | null;
  organizerEmail: string | null;
  participants: readonly string[];
  /** ¿Tiene notas de Gemini (`summary.overview` con texto)? */
  tieneNotas: boolean;
  /** Cuándo vio la copia de Calendar el evento cancelado (U1); null o sin el campo = no se canceló. */
  canceladaEn?: Date | null;
}

function nuestros(r: Pick<ReunionSinTranscripcion, "organizerEmail" | "participants">): string[] {
  return [r.organizerEmail ?? "", ...r.participants]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && esDeNuestroEquipo(e) && !esRecursoDeCalendario(e));
}

function errorDe(enrichError: string | null): string {
  try {
    const o = JSON.parse(enrichError ?? "{}") as { error?: unknown };
    return typeof o.error === "string" ? o.error : "";
  } catch {
    return "";
  }
}

/** PURA. Por qué esta reunión (que no tiene transcripción) no la tiene. */
export function porQueFalta(r: ReunionSinTranscripcion, ahora: Date): MotivoDeLaFalta {
  if (r.canceladaEn) return "cancelada";
  if (!listaParaLeer(r, ahora)) return "todavia_no_termino";
  if (errorDe(r.enrichError) === "sin_interno_para_impersonar" || nuestros(r).length === 0) return "sin_nadie_del_equipo";
  if (r.enrichedAt === null) {
    if (r.enrichAttempts === 0) return "pendiente_de_leer";
    return estaEsperandoMaterial(r.enrichError) ? "esperando_a_google" : "fallo_de_lectura_reintentando";
  }
  if (r.enrichAttempts >= MAX_ENRICH_ATTEMPTS && errorDe(r.enrichError)) return "fallo_de_lectura_sellada";
  if ((r.duration ?? 0) > 0 && r.enrichedAt.getTime() < finDeLaReunion(r).getTime() + MARGEN_TRAS_EL_FIN_MS) return "leida_antes_de_terminar";
  if (r.tieneNotas) return "solo_notas_sin_transcripcion";
  if (r.googleDocId) return "documento_vacio";
  const org = r.organizerEmail?.trim().toLowerCase() ?? "";
  return org && esDeNuestroEquipo(org) && !esRecursoDeCalendario(org) ? "no_se_grabo" : "organizada_por_afuera";
}
