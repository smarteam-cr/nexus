/**
 * lib/exploraciones/al-cambiar-el-equipo.ts — qué conviene rehacer cuando cambia el equipo de una sesión. PURO.
 *
 * K11 (2026-10-28, pedido de Elías): el equipo de la sesión cambia la guía, la lectura de la reunión y el análisis de la
 * venta, pero cambiarlo en una sesión ya preparada o ya leída era solo una etiqueta. Nexus lo SUGIERE (nunca lo hace
 * solo: cada cosa gasta IA y la decide una persona), según el estado de la sesión:
 *   · la guía armada por el agente para otro equipo, si la sesión todavía no ocurre y es la próxima;
 *   · la lectura de su reunión, si se leyó con otro equipo (o antes de que la lectura recibiera el equipo);
 *   · el análisis de la venta de su reunión (solo la preventa), si ya se analizó.
 * La guía y el análisis se ofrecen al cambiar (la Preparación ya avisa de la guía vieja, y el análisis no guarda con qué
 * equipo se hizo). La lectura sabe con qué equipo se leyó (`LecturaDeReunion.equipo`): se ofrece mientras no coincida.
 */
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";

export type QueRehacer = "guia" | "lectura" | "analisis";

export interface EstadoParaRehacer {
  /** El equipo de la sesión ahora (null = la empresa entera). */
  equipo: ClaveDeEquipo | null;
  /** La persona lo acaba de cambiar en esta pantalla. */
  recienCambiado: boolean;
  /** La sesión todavía no ocurre y es la próxima: su guía es la que se puede rehacer. */
  porPreparar: boolean;
  /** La guía que armó el agente para esta sesión (la de base se rehace sola). */
  guia: { equipo?: ClaveDeEquipo } | null;
  /** La lectura de su reunión, si se puede volver a leer (Meet o HubSpot). */
  lectura: { equipo?: ClaveDeEquipo } | null;
  /** Su reunión ya tiene un análisis de la venta. */
  analisis: boolean;
}

/** Lo que conviene rehacer, en el orden en que se ofrece. */
export function queRehacerAlCambiarElEquipo(e: EstadoParaRehacer): QueRehacer[] {
  const out: QueRehacer[] = [];
  if (e.recienCambiado && e.porPreparar && e.guia && (e.guia.equipo ?? null) !== e.equipo) out.push("guia");
  if (e.lectura && (e.lectura.equipo ?? null) !== e.equipo) out.push("lectura");
  if (e.recienCambiado && e.analisis) out.push("analisis");
  return out;
}

/** «Marketing» o «la empresa entera». */
export function nombreDelEquipoOEmpresa(equipo: ClaveDeEquipo | null | undefined): string {
  return equipo ? EQUIPOS[equipo].nombre : "la empresa entera";
}

/** La frase de arriba del aviso: qué pasó y por qué conviene rehacer. */
export function fraseAlCambiarElEquipo(e: Pick<EstadoParaRehacer, "equipo" | "recienCambiado" | "lectura">, rehacer: readonly QueRehacer[]): string {
  const ahora = e.equipo ? `con ${EQUIPOS[e.equipo].nombre}` : "con la empresa entera";
  if (!e.recienCambiado && rehacer.length === 1 && rehacer[0] === "lectura") {
    const porque = e.equipo && EQUIPOS[e.equipo].area ? "ubica lo que dijo en las dimensiones de su área" : "tiene en cuenta con quién fue";
    return `La reunión se leyó como sesión con ${nombreDelEquipoOEmpresa(e.lectura?.equipo)}, y la sesión ahora es ${ahora}. Volver a leerla ${porque}.`;
  }
  return `La sesión ahora es ${ahora}. Lo que ya estaba hecho se armó con otro equipo: puedes rehacerlo, o dejarlo como está.`;
}
