/**
 * lib/google/plataforma-del-evento.ts — POR DÓNDE fue una reunión del calendario, y si una que no es de Meet se guarda.
 * PURO y client-safe (sin red ni base).
 *
 * Hasta el 2026-11-27 la sync del calendario (lib/google/meet-sync.ts) guardaba solo los eventos con Google Meet. Una
 * reunión por Zoom o Teams con un cliente no existía en Nexus: la de Líneas Hospitalarias del 27 nov, organizada por
 * HubSpot por Zoom, no salía en el buscador de la preventa. La regla nueva (Elías, 27 nov): se guarda todo evento del
 * calendario del equipo con al menos un invitado de afuera, sea Meet, Zoom, Teams, otro enlace o en persona. Los del
 * equipo solo (dailies, bloques de tarea) sin Meet siguen fuera.
 *
 * Una reunión que no es de Meet se guarda con `source = SOURCE_CALENDARIO` y su plataforma: así ningún lector del
 * circuito de Meet (el enriquecimiento, las conferencias, los reintentos), que filtran por `source = "google_meet"`, la
 * toma ni gasta un intento en ella. Su id es el de siempre (`gmeet_<evento>`): los que buscan la sesión de un evento del
 * calendario (la preventa, «Después de cada reunión», Tareas, las horas del calendario) la encuentran sin cambios, y si
 * le ponen un Meet después sigue siendo la misma fila.
 */

/** Los valores del enum `PlataformaDeReunion` del schema. Una reunión de Meet guarda null (es la de siempre). */
export type Plataforma = "MEET" | "ZOOM" | "TEAMS" | "OTRA" | "PRESENCIAL";

/** `FirefliesSession.source` de una reunión del calendario que no es de Meet. Meet escribe "google_meet". */
export const SOURCE_CALENDARIO = "google_calendar";

/** Cómo se nombra en pantalla. */
export const NOMBRE_DE_LA_PLATAFORMA: Readonly<Record<Plataforma, string>> = {
  MEET: "Meet",
  ZOOM: "Zoom",
  TEAMS: "Teams",
  OTRA: "otro enlace",
  PRESENCIAL: "en persona",
};

/** El aviso corto del buscador y de la sesión: «Fue por Zoom», «Fue en persona». null = Meet (no hace falta decirlo). */
export function avisoDePlataforma(p: Plataforma | null | undefined): string | null {
  if (!p || p === "MEET") return null;
  if (p === "PRESENCIAL") return "Fue en persona";
  if (p === "OTRA") return "Fue por otro enlace";
  return `Fue por ${NOMBRE_DE_LA_PLATAFORMA[p]}`;
}

/** Lo que hace falta del evento de Google Calendar para decidir. Mismos nombres que `calendar_v3.Schema$Event`. */
export interface EventoParaLaPlataforma {
  conferenceData?: {
    conferenceSolution?: { key?: { type?: string | null } | null; name?: string | null } | null;
    entryPoints?: readonly { uri?: string | null }[] | null;
  } | null;
  hangoutLink?: string | null;
  location?: string | null;
  description?: string | null;
}

/** Los enlaces de cada una, en el lugar, la descripción o la conferencia. La palabra sola no alcanza («hacer zoom»). */
const ZOOM = /\bzoom(gov)?\.(us|com)\//i;
const TEAMS = /\bteams\.(microsoft|live)\.com\//i;
const ENLACE = /https?:\/\/\S+/i;

/** ¿El evento tiene la videollamada de Google Meet? La misma condición de siempre de la sync. */
export function esDeMeet(e: EventoParaLaPlataforma): boolean {
  return e.conferenceData?.conferenceSolution?.key?.type === "hangoutsMeet";
}

/**
 * PURA. Por dónde fue: Meet si el evento trae la videollamada de Google; si no, Zoom o Teams por el complemento del
 * calendario (`conferenceData`), el lugar o la descripción; otro enlace si hay un enlace o un complemento de otra
 * herramienta; en persona si solo dice un lugar; y si no dice nada, «otra» (no se inventa que fue en persona).
 * La descripción solo cuenta para Zoom y Teams: casi todas traen enlaces (la agenda, HubSpot) que no son la llamada.
 */
export function plataformaDelEvento(e: EventoParaLaPlataforma): Plataforma {
  if (esDeMeet(e)) return "MEET";
  const conf = e.conferenceData;
  const deLaConferencia = [conf?.conferenceSolution?.name ?? "", ...(conf?.entryPoints ?? []).map((p) => p.uri ?? "")].join(" ");
  const lugar = (e.location ?? "").trim();
  const descripcion = e.description ?? "";
  const todo = `${deLaConferencia} ${lugar} ${descripcion}`;
  // El nombre del complemento («Zoom Meeting», «Microsoft Teams Meeting») también lo dice.
  const nombre = conf?.conferenceSolution?.name ?? "";
  if (ZOOM.test(todo) || /\bzoom\b/i.test(nombre)) return "ZOOM";
  if (TEAMS.test(todo) || /\bteams\b/i.test(nombre)) return "TEAMS";
  if (conf?.conferenceSolution || ENLACE.test(deLaConferencia) || ENLACE.test(lugar) || e.hangoutLink) return "OTRA";
  if (lugar) return "PRESENCIAL";
  return "OTRA";
}

/** Un invitado como lo guarda la sync: en minúsculas, sin salas. */
interface Invitado {
  correo: string;
}

/** Un buzón que no es una persona: el `no-reply@zoom.us` de un webinar no hace que un evento sea una reunión. */
const NO_ES_PERSONA = /^(no-?reply|do-?not-?reply|notifications?|calendar)([+._-]|@)/i;

/**
 * ¿Hay al menos un invitado de fuera del equipo? `dominiosDelEquipo` = los de `dominiosDelEquipoDe` (en minúsculas).
 * Alguien de HubSpot cuenta como de afuera. Un buzón automático (no-reply) no.
 */
export function tieneInvitadoDeAfuera(invitados: readonly Invitado[], dominiosDelEquipo: ReadonlySet<string>): boolean {
  return invitados.some((i) => {
    const arroba = i.correo.lastIndexOf("@");
    if (arroba <= 0 || NO_ES_PERSONA.test(i.correo)) return false;
    return !dominiosDelEquipo.has(i.correo.slice(arroba + 1).toLowerCase());
  });
}

/** Los tipos de evento que nunca son una reunión (`eventType` de Google Calendar). */
const TIPOS_QUE_NO_SON_REUNION = new Set(["outOfOffice", "focusTime", "workingLocation", "birthday", "fromGmail"]);

/**
 * PURA. ¿Este evento que NO es de Meet puede ser una reunión? Tiene hora (un evento de todo el día no es una reunión) y
 * no es una ausencia, un bloque de concentración, la ubicación de trabajo ni algo que Gmail agregó solo. Si tiene
 * invitados de afuera se decide después, con los dominios del equipo (`tieneInvitadoDeAfuera`).
 */
export function puedeSerReunionFueraDeMeet(e: { start?: { dateTime?: string | null } | null; eventType?: string | null }): boolean {
  if (!e.start?.dateTime) return false;
  return !TIPOS_QUE_NO_SON_REUNION.has(e.eventType ?? "default");
}
