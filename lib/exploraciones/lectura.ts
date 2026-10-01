/**
 * lib/exploraciones/lectura.ts — qué reuniones le faltan leer al agente y cuándo lee solo. PURO.
 *
 * Dos fuentes de reuniones: las de Meet (con su transcripción, en la base) y las de HubSpot (el
 * notetaker deja su resumen en la reunión). De Meet se sabe cuándo llega la transcripción, así que
 * el agente la lee SOLO (lib/sessions/post-process.ts lo dispara). De HubSpot no hay aviso: se sabe
 * qué reuniones estaban agendadas en la última lectura, y cuando ya pasaron se avisan como «sin
 * leer» para que el vendedor apriete el botón.
 */
import type { LoLeidoDeHubspot } from "./lo-leido";

export interface ReunionSinLeer {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  origen: "meet" | "hubspot";
}

/** Hasta cuántos días después de la reunión el agente la lee solo. Más vieja, ya no es noticia. */
export const DIAS_PARA_LEER_SOLA = 14;

/** Cuánto antes del alta cuenta una reunión de Meet como «sin leer» (las de antes, preparar las vio). */
export const DIAS_ANTES_DEL_ALTA = 30;

const DIA = 24 * 60 * 60 * 1000;

/**
 * ¿El agente lee sola esta reunión de Meet? Solo si es de DESPUÉS del alta (las de antes las miró al
 * preparar y quedan avisadas como «sin leer»), tiene a lo sumo 14 días y todavía no se leyó.
 */
export function debeLeerSola(o: { fechaDeLaReunion: Date; creadaEn: Date; sesionId: string; leidas: readonly string[]; ahora: Date }): boolean {
  const t = o.fechaDeLaReunion.getTime();
  if (Number.isNaN(t) || t > o.ahora.getTime()) return false;
  if (t < o.creadaEn.getTime()) return false;
  if (o.ahora.getTime() - t > DIAS_PARA_LEER_SOLA * DIA) return false;
  return !o.leidas.includes(o.sesionId);
}

/**
 * Las reuniones de HubSpot que estaban agendadas en la última lectura y ya pasaron, sin leer. Si la
 * misma reunión también está en Meet (empieza a menos de dos horas de una de Meet), cuenta una vez:
 * la de Meet, que trae la transcripción.
 */
export function agendadasQueYaPasaron(
  agenda: LoLeidoDeHubspot["agenda"],
  leidasDeHubspot: readonly string[],
  deMeet: readonly { fecha: string }[],
  ahora: Date,
): ReunionSinLeer[] {
  const cerca = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 2 * 60 * 60 * 1000;
  return agenda
    .filter((a) => Date.parse(a.inicio) <= ahora.getTime() && !leidasDeHubspot.includes(a.id))
    .filter((a) => !deMeet.some((m) => cerca(m.fecha, a.inicio)))
    .map((a) => ({ id: a.id, titulo: a.titulo, fecha: a.inicio, origen: "hubspot" as const }));
}
