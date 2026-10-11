/**
 * lib/exploraciones/agendadas.ts — qué reuniones del calendario son AGENDADAS con la empresa. PURO.
 *
 * El selector de «Agregar sesión» (etapa A, 2026-10-09) ofrece «Agendadas · próximas 6 semanas»: las
 * reuniones con Meet que todavía no ocurren, en el calendario de quien busca y en el de quien lleva la
 * exploración, con alguien de la empresa invitado. Unir una sesión a una de ellas guarda su evento
 * (`SesionPlaneada.evento`); cuando ocurre, la sesión se liga a su reunión de Meet y espera su
 * transcripción. Lo lee lib/google/agenda-de-la-empresa.ts (servidor); acá solo se decide.
 */
import { esDominioDeCalendario } from "@/lib/sessions/dominio-propio";
import { esBloqueDeTarea } from "@/lib/google/meet-sync-cambios";
import { esInstanciaDeUnaSerie, mismaReunion } from "./lectura";

/** Las semanas que mira «Agendadas». */
export const SEMANAS_DE_AGENDADAS = 6;

/** Lo que hace falta de un evento de Google Calendar (la forma de `events.list`). */
export interface EventoDelCalendario {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  recurringEventId?: string | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
  conferenceData?: { conferenceSolution?: { key?: { type?: string | null } | null } | null } | null;
  attendees?: { email?: string | null; self?: boolean | null; responseStatus?: string | null; resource?: boolean | null }[] | null;
  organizer?: { email?: string | null } | null;
}

/** Una reunión agendada con la empresa, lista para unirla a una sesión. */
export interface Agendada {
  /** El id de la instancia en Google Calendar (en una serie, el de esa fecha). */
  id: string;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  fin: string | null;
  /** El calendario donde se leyó (ahí se vuelve a mirar si se mueve o se cancela). */
  calendario: string;
  /** Es la instancia de una serie: se usa solo esa fecha. */
  serie: boolean;
  /** Cuántos invitados son de Smarteam y cuántos de afuera (sin salas ni calendarios). */
  internos: number;
  externos: number;
}

/** ISO UTC de la fecha de un evento; uno de todo el día empieza a las 00:00 de Costa Rica. null = no se entiende. */
export function isoDelEvento(t: EventoDelCalendario["start"]): string | null {
  const v = t?.dateTime ?? (t?.date ? `${t.date}T00:00:00-06:00` : null);
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const dominioDe = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

/**
 * Las agendadas con la empresa de un calendario: con Meet (como la sincronización de Meet), no
 * canceladas, no rechazadas por la dueña del calendario, que no sean el bloque de una tarea de Nexus, que
 * no hayan terminado, y con algún invitado de un dominio de la empresa o algún correo de su gente. La más
 * próxima primero.
 */
export function filtrarAgendadas(
  items: readonly EventoDelCalendario[],
  o: {
    calendario: string;
    /** Los dominios de la empresa (Client.emailDomains y los de afuera de sus reuniones que no comparte con otros clientes). */
    dominios: readonly string[];
    /** Los correos de la gente de la empresa que estuvo en sus reuniones. */
    correos: readonly string[];
    /** Los dominios de Smarteam (para contar internos y externos). */
    internos?: ReadonlySet<string>;
    ahora: Date;
  },
): Agendada[] {
  const dominios = new Set(o.dominios.map((d) => d.trim().toLowerCase()).filter(Boolean));
  const correos = new Set(o.correos.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const internos = o.internos ?? new Set<string>();
  const out: Agendada[] = [];
  for (const e of items) {
    if (!e.id || e.status === "cancelled") continue;
    if (e.conferenceData?.conferenceSolution?.key?.type !== "hangoutsMeet") continue;
    if (esBloqueDeTarea(e)) continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const inicio = isoDelEvento(e.start);
    if (!inicio) continue;
    const fin = isoDelEvento(e.end);
    if (Date.parse(fin ?? inicio) < o.ahora.getTime()) continue;
    const unicos = invitadosDelEvento(e);
    if (!unicos.some((c) => correos.has(c) || dominios.has(dominioDe(c)))) continue;
    const deSmarteam = unicos.filter((c) => internos.has(dominioDe(c))).length;
    out.push({
      id: e.id,
      titulo: e.summary?.trim() || "(Sin título)",
      inicio,
      fin,
      calendario: o.calendario,
      serie: esInstanciaDeUnaSerie(e.id) || !!e.recurringEventId,
      internos: deSmarteam,
      externos: unicos.length - deSmarteam,
    });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Los invitados de un evento (con quien lo organiza), en minúscula y sin salas ni calendarios. */
export function invitadosDelEvento(e: Pick<EventoDelCalendario, "attendees" | "organizer">): string[] {
  const gente = [...(e.attendees ?? []).filter((a) => !a.resource).map((a) => a.email ?? ""), e.organizer?.email ?? ""]
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.includes("@") && !esDominioDeCalendario(dominioDe(c)));
  return [...new Set(gente)];
}

/** ¿Alguno de estos invitados es de la empresa? (un correo de su gente o un dominio de la empresa) */
export function tieneALaEmpresa(invitados: readonly string[], o: { dominios: readonly string[]; correos: readonly string[] }): boolean {
  const dominios = new Set(o.dominios.map((d) => d.trim().toLowerCase()).filter(Boolean));
  const correos = new Set(o.correos.map((c) => c.trim().toLowerCase()).filter(Boolean));
  return invitados.some((c) => {
    const correo = c.trim().toLowerCase();
    return correos.has(correo) || dominios.has(dominioDe(correo));
  });
}

/** Junta las agendadas de varios calendarios: el mismo evento cuenta una vez (gana el primer calendario). */
export function juntarAgendadas(listas: readonly (readonly Agendada[])[]): Agendada[] {
  const vistas = new Map<string, Agendada>();
  for (const lista of listas) for (const a of lista) if (!vistas.has(a.id)) vistas.set(a.id, a);
  return [...vistas.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Las agendadas de HubSpot (la agenda de la preventa) que no están ya en el calendario: la misma reunión,
 * vista desde HubSpot y desde Google, empieza a menos de dos horas y cuenta una vez (la de Google, que se
 * puede unir por su evento).
 */
export function agendaDeHubspotSinRepetir(
  agenda: readonly { id: string; titulo: string; inicio: string }[],
  deGoogle: readonly Pick<Agendada, "inicio">[],
  ahora: Date,
): { id: string; titulo: string; inicio: string }[] {
  return agenda.filter((a) => Date.parse(a.inicio) > ahora.getTime() && !deGoogle.some((g) => mismaReunion(g.inicio, a.inicio)));
}

/**
 * Los dominios y los correos de la empresa para reconocer sus agendadas: los dominios registrados (por
 * regla, únicos de la empresa) y, de sus reuniones, los de afuera (sin Smarteam, sin calendarios ni salas,
 * sin los genéricos que traen muchas empresas) que NO aparecen en reuniones de otros clientes
 * (`compartidos`: HubSpot, una agencia, un integrador). Sin ese filtro, alguien de HubSpot en una reunión
 * de la empresa hacía que «Agendadas» listara reuniones de otros clientes (invariante 1). Un correo con
 * dominio genérico se mira solo por el correo exacto. `genericos`: dominios de correo personal.
 */
export function genteDeLaEmpresa(
  registrados: readonly string[],
  participantes: readonly string[],
  o: {
    internos: ReadonlySet<string>;
    genericos?: ReadonlySet<string>;
    compartidos?: { dominios: ReadonlySet<string>; correos: ReadonlySet<string> };
  },
): { dominios: string[]; correos: string[] } {
  const genericos = o.genericos ?? DOMINIOS_GENERICOS;
  const compartidos = o.compartidos ?? { dominios: new Set<string>(), correos: new Set<string>() };
  const correos = new Set<string>();
  const dominios = new Set(registrados.map((d) => d.trim().toLowerCase()).filter(Boolean));
  for (const c of participantes) {
    const correo = c.trim().toLowerCase();
    const d = dominioDe(correo);
    if (!d || o.internos.has(d) || esDominioDeCalendario(d)) continue;
    if (compartidos.correos.has(correo) || (!genericos.has(d) && compartidos.dominios.has(d))) continue;
    correos.add(correo);
    if (!genericos.has(d)) dominios.add(d);
  }
  return { dominios: [...dominios], correos: [...correos] };
}

/** Lo que hay que preguntar a `genteCompartidaConOtrosClientes`: los dominios de afuera no registrados ni genéricos, y los correos. */
export function candidatosACompartidos(
  registrados: readonly string[],
  participantes: readonly string[],
  o: { internos: ReadonlySet<string>; genericos?: ReadonlySet<string> },
): { dominios: string[]; correos: string[] } {
  const genericos = o.genericos ?? DOMINIOS_GENERICOS;
  const registradosSet = new Set(registrados.map((d) => d.trim().toLowerCase()));
  const { dominios, correos } = genteDeLaEmpresa([], participantes, { internos: o.internos, genericos });
  return { dominios: dominios.filter((d) => !registradosSet.has(d)), correos: correos.filter((c) => !registradosSet.has(dominioDe(c))) };
}

/** Dominios de correo personal: una persona con gmail no hace de gmail.com un dominio de la empresa. */
export const DOMINIOS_GENERICOS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "me.com",
  "msn.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);
