/**
 * lib/exploraciones/lectura.ts — qué reuniones le faltan leer al agente y cuándo lee solo. PURO.
 *
 * Dos fuentes de reuniones: las de Meet (con su transcripción, en la base) y las de HubSpot (el
 * notetaker deja su resumen en la reunión). De Meet se sabe cuándo llega la transcripción, así que
 * el agente la lee SOLO (lib/sessions/post-process.ts lo dispara). De HubSpot no hay aviso: se sabe
 * qué reuniones estaban agendadas en las lecturas anteriores (la foto las conserva al renovarse:
 * `agendaRenovada`), y cuando ya pasaron se avisan como «sin leer» para que el vendedor apriete el
 * botón, hasta que el agente lea lo que dejó el notetaker.
 */
import type { LoLeidoDeHubspot } from "./lo-leido";

export interface ReunionSinLeer {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  /** De dónde viene: una reunión de Meet, una de HubSpot o algo que el vendedor sumó a mano. */
  origen: "meet" | "hubspot" | "documento";
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

type Agenda = LoLeidoDeHubspot["agenda"];

/** Cuántas reuniones que ya pasaron conserva la foto de una lectura a la otra (las más recientes). */
export const PASADAS_QUE_CONSERVA_LA_FOTO = 30;

/**
 * La agenda de la foto NUEVA (Elías, 2026-10-05: «una reunión de HubSpot sin resumen se sigue avisando
 * como pendiente de leer»). HubSpot da como agenda solo las reuniones futuras; las que ya pasaron
 * estaban en la foto anterior y se CONSERVAN, leídas o no: las que no se leyeron se siguen avisando
 * «sin leer» (el notetaker todavía no dejó su resumen, o nadie apretó «Leer») y las leídas se listan
 * como leídas. Antes la foto nueva reemplazaba a la anterior y «Volver a preparar» las borraba sin
 * haberlas leído. Las que HubSpot dice que no ocurrieron (se canceló, se reagendó, no se presentó) no
 * se conservan: no hay nada que leer.
 */
export function agendaRenovada(o: { anterior: Agenda; nueva: Agenda; noOcurrieron?: readonly string[]; ahora: Date }): Agenda {
  const porFecha = (a: { inicio: string }, b: { inicio: string }) => a.inicio.localeCompare(b.inicio);
  const enLaNueva = new Set(o.nueva.map((a) => a.id));
  const noOcurrieron = new Set(o.noOcurrieron ?? []);
  const pasadas = o.anterior
    .filter((a) => Date.parse(a.inicio) <= o.ahora.getTime() && !enLaNueva.has(a.id) && !noOcurrieron.has(a.id))
    .sort(porFecha)
    .slice(-PASADAS_QUE_CONSERVA_LA_FOTO);
  return [...pasadas, ...o.nueva].sort(porFecha);
}

/**
 * Las reuniones de HubSpot que estaban en la agenda y ya pasaron, LEÍDAS O NO (cada una dice si el
 * agente ya leyó lo que dejó el notetaker). Si la misma reunión también está en Meet (empieza a menos
 * de dos horas de una de Meet), cuenta una vez: la de Meet, que trae la transcripción.
 */
export function reunionesDeHubspotQueYaPasaron(
  agenda: Agenda,
  leidasDeHubspot: readonly string[],
  deMeet: readonly { fecha: string }[],
  ahora: Date,
): (ReunionSinLeer & { origen: "hubspot"; leida: boolean })[] {
  const cerca = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 2 * 60 * 60 * 1000;
  const leidas = new Set(leidasDeHubspot);
  return agenda
    .filter((a) => Date.parse(a.inicio) <= ahora.getTime())
    .filter((a) => !deMeet.some((m) => cerca(m.fecha, a.inicio)))
    .map((a) => ({ id: a.id, titulo: a.titulo, fecha: a.inicio, origen: "hubspot" as const, leida: leidas.has(a.id) }));
}

/** Las de HubSpot que ya pasaron y el agente todavía no leyó: se avisan «sin leer». */
export function agendadasQueYaPasaron(
  agenda: Agenda,
  leidasDeHubspot: readonly string[],
  deMeet: readonly { fecha: string }[],
  ahora: Date,
): ReunionSinLeer[] {
  return reunionesDeHubspotQueYaPasaron(agenda, leidasDeHubspot, deMeet, ahora)
    .filter((r) => !r.leida)
    .map((r) => ({ id: r.id, titulo: r.titulo, fecha: r.fecha, origen: r.origen }));
}
