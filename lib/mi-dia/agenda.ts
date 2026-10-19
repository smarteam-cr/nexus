/**
 * lib/mi-dia/agenda.ts — las reuniones de hoy en el calendario de una persona, con la empresa de cada una (etapa 4c de
 * docs/mi-dia-plan.md). PURO: lo lee lib/mi-dia/agenda-server.ts.
 *
 * La empresa se reconoce por los invitados: primero por el correo exacto de un contacto de HubSpot, si no por el
 * dominio registrado de la empresa (nunca uno de correo personal). Un invitado que es de VARIAS empresas (alguien de
 * HubSpot, de una agencia) no decide nada si hay otro invitado que sí es de una sola: así una reunión con un cliente
 * y alguien de HubSpot es de ese cliente, no de todos los clientes de HubSpot (invariante 1).
 *
 * ⛔ EL resolvedor de evento → cuenta (fase 2.2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17): un evento CUENTA
 * para una cuenta solo si es de UNA empresa (`cuentaDelEvento`). Lo usan la agenda de «Para ti», la regla de servicio
 * («¿la cuenta tiene reunión en los próximos 8 días?»), «Planifica tu semana» y las próximas reuniones de la ficha: no
 * se vuelve a escribir en otro lado. La exploración (lib/exploraciones/agendadas.ts) pregunta otra cosa —¿este evento
 * es con ESTA empresa?, con la gente de sus reuniones pasadas— para unir una sesión a su evento, y sigue con lo suyo.
 */
import { DOMINIOS_GENERICOS, invitadosDelEvento, isoDelEvento, type EventoDelCalendario } from "@/lib/exploraciones/agendadas";
import { esBloqueDeTarea } from "@/lib/google/meet-sync-cambios";
import { clientesNombradosEnteros, type IndiceDeClientes } from "@/lib/sessions/clientes-por-texto";

export interface ReunionDeHoy {
  id: string;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  fin: string | null;
  /** false = la persona lo marcó «disponible». Sin el dato (datos de antes), ocupa. */
  ocupa?: boolean;
  /** Es opcional o respondió «quizás»: se ve más claro, pero igual ocupa. */
  tenue?: boolean;
  conMeet: boolean;
  /** El enlace de Meet del evento, si lo trae. */
  meetUrl: string | null;
  /** El evento en Google Calendar (para «Abrir en Calendar»). */
  calendarUrl: string | null;
  /** Las empresas de Nexus de la reunión. Una = esa es; varias = no se sabe cuál (se elige al preparar). */
  empresas: string[];
  /** Los invitados de afuera (sin Smarteam, sin salas ni calendarios). */
  externos: number;
  internos: number;
  /** Los correos de Smarteam invitados (quién va de la casa). */
  deSmarteam: string[];
}

/** Un evento del calendario con sus enlaces (Meet y la página del evento). */
export type EventoConEnlaces = EventoDelCalendario & { hangoutLink?: string | null; htmlLink?: string | null };

const dominioDe = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

/** Las empresas de un invitado: por su correo exacto; si no, por su dominio (no uno de correo personal). */
function empresasDelInvitado(
  correo: string,
  porCorreo: ReadonlyMap<string, readonly string[]>,
  porDominio: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const exacto = porCorreo.get(correo);
  if (exacto?.length) return exacto;
  const d = dominioDe(correo);
  if (!d || DOMINIOS_GENERICOS.has(d)) return [];
  return porDominio.get(d) ?? [];
}

/** Las empresas de una reunión, con la regla de arriba. */
export function empresasDeLaReunion(
  externos: readonly string[],
  porCorreo: ReadonlyMap<string, readonly string[]>,
  porDominio: ReadonlyMap<string, readonly string[]>,
): string[] {
  const deUna = new Set<string>();
  const deVarias = new Set<string>();
  for (const c of externos) {
    const es = empresasDelInvitado(c, porCorreo, porDominio);
    if (es.length === 1) deUna.add(es[0]);
    else for (const e of es) deVarias.add(e);
  }
  return [...(deUna.size ? deUna : deVarias)].sort();
}

// ── Qué es cada evento del calendario (2026-10-19) ────────────────────────────────────────────
//
// Elías comparó la semana de Andrés Pinzón en Google Calendar con la de «Para ti»: faltaban «Tenis», «Convocatoria
// ICB», «Preparar demo para Accesos Automáticos», «Cita Médica», «Sale Juan del colegio» y «Entrega de notas», y donde
// estaban Nexus sugería un espacio libre. Eran eventos SIN otros invitados: la agenda pintaba solo las reuniones. La
// regla de ahora es la de Google: todo evento con hora se ve, y ocupa el tiempo si lo bloquea.

/** Cómo va la persona a un evento, según su respuesta en Google Calendar. */
export type Asistencia = "va" | "quizas" | "opcional" | "sin-responder" | "no-va";

/** Su respuesta: sin lista de invitados (un evento suyo), va. */
export function asistenciaPropia(e: Pick<EventoConEnlaces, "attendees">): Asistencia {
  const yo = e.attendees?.find((a) => a.self);
  if (!yo) return "va";
  if (yo.responseStatus === "declined") return "no-va";
  if (yo.responseStatus === "tentative") return "quizas";
  if (yo.optional) return "opcional";
  if (yo.responseStatus === "needsAction") return "sin-responder";
  return "va";
}

/** ¿Se ve más claro? Si la persona es opcional o respondió «quizás» (igual ocupa su tiempo). */
export const esTenue = (a: Asistencia) => a === "quizas" || a === "opcional";

/** Los tipos de evento que no son tiempo de nadie: la ubicación de trabajo y los cumpleaños. */
const SIN_HORAS = new Set(["workingLocation", "birthday"]);

/** ¿Es un evento con hora que se pinta en la grilla? No cancelado, no rechazado, no de todo el día ni una ubicación. */
export function esEventoConHora(e: EventoConEnlaces): boolean {
  if (!e.id || e.status === "cancelled" || !e.start?.dateTime) return false;
  if (e.eventType && SIN_HORAS.has(e.eventType)) return false;
  return asistenciaPropia(e) !== "no-va";
}

/**
 * ¿Bloquea el tiempo de la persona? Todo evento con hora, salvo el que marcó «disponible» (`transparent`). Los de todo
 * el día, la ubicación de trabajo y las tareas de Google (no vienen en el calendario) no ocupan horas; uno rechazado,
 * tampoco. «Quizás» u «opcional» sí ocupan: es común estar invitado a dos a la vez e ir a uno.
 */
export function ocupaSuTiempo(e: EventoConEnlaces): boolean {
  return esEventoConHora(e) && e.transparency !== "transparent";
}

/** ¿Es una reunión? Un evento con hora con alguien más invitado, que no es el bloque de una tarea de Nexus. */
function esReunion(e: EventoConEnlaces): boolean {
  return esEventoConHora(e) && !esBloqueDeTarea(e) && invitadosDelEvento(e).length >= 2;
}

/** Un evento con hora que no es una reunión: algo de la persona sola («Tenis», «Cita Médica»), o el bloque de una tarea. */
export interface EventoPropio {
  id: string;
  titulo: string;
  inicio: string;
  fin: string | null;
  calendarUrl: string | null;
  /** false = lo marcó «disponible»: se ve, pero Nexus puede sugerir algo ahí. */
  ocupa: boolean;
  tenue: boolean;
  /** El bloque de una tarea de Nexus: lleva a la tarea. */
  tareaId: string | null;
  /**
   * Las empresas que nombra el título o la descripción (`empresasDelEventoPropio`): una = esa es (`cuentaDelEvento`);
   * vacío o varias = no se sabe y no se inventa. Sin el índice de clientes, vacío.
   */
  empresas: string[];
}

/**
 * Las empresas que nombra un evento propio («Preparar demo para Accesos Automáticos» → Accesos Automáticos), con su
 * nombre ENTERO (lib/sessions/clientes-por-texto.ts › clientesNombradosEnteros, el mismo match de títulos del cascade).
 * Primero el título; si no nombra ninguna, la descripción. Varias se devuelven todas y `cuentaDelEvento` no elige
 * ninguna (invariante 1).
 */
export function empresasDelEventoPropio(e: Pick<EventoConEnlaces, "summary" | "description">, indice: IndiceDeClientes): string[] {
  const delTitulo = e.summary?.trim() ? clientesNombradosEnteros(e.summary, indice) : [];
  if (delTitulo.length > 0) return delTitulo;
  const descripcion = e.description?.trim();
  return descripcion ? clientesNombradosEnteros(descripcion.slice(0, 2_000), indice) : [];
}

/**
 * Los eventos con hora que no son reuniones. Por hora. Con el índice de clientes, cada uno con la empresa que nombra
 * (el bloque de una tarea no: lleva a la tarea, que ya dice para quién es).
 */
export function eventosPropios(eventos: readonly EventoConEnlaces[], indice?: IndiceDeClientes): EventoPropio[] {
  const out: EventoPropio[] = [];
  for (const e of eventos) {
    if (!esEventoConHora(e) || esReunion(e)) continue;
    const inicio = isoDelEvento(e.start);
    if (!inicio) continue;
    const tareaId = e.extendedProperties?.private?.nexusTareaId ?? null;
    out.push({
      id: e.id!,
      titulo: e.summary?.trim() || "(Sin título)",
      inicio,
      fin: isoDelEvento(e.end),
      calendarUrl: e.htmlLink?.startsWith("https://") ? e.htmlLink : null,
      ocupa: ocupaSuTiempo(e),
      tenue: esTenue(asistenciaPropia(e)),
      tareaId,
      empresas: indice && !tareaId ? empresasDelEventoPropio(e, indice) : [],
    });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Un evento de todo el día (un aniversario, un feriado, unas vacaciones). No ocupa horas. */
export interface EventoDeTodoElDia {
  id: string;
  titulo: string;
  /** El primer día y el día siguiente al último, `AAAA-MM-DD` (como los da Google). */
  desde: string;
  hasta: string;
}

/** Los eventos de todo el día, sin la ubicación de trabajo ni los rechazados. */
export function eventosDeTodoElDia(eventos: readonly EventoConEnlaces[]): EventoDeTodoElDia[] {
  const out: EventoDeTodoElDia[] = [];
  for (const e of eventos) {
    if (!e.id || e.status === "cancelled" || !e.start?.date || e.start.dateTime) continue;
    if (e.eventType === "workingLocation") continue;
    if (asistenciaPropia(e) === "no-va") continue;
    const desde = e.start.date;
    const hasta = e.end?.date && e.end.date > desde ? e.end.date : new Date(Date.parse(`${desde}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    out.push({ id: e.id, titulo: e.summary?.trim() || "(Sin título)", desde, hasta });
  }
  return out.sort((a, b) => a.desde.localeCompare(b.desde) || a.titulo.localeCompare(b.titulo));
}

/** Los de todo el día que caen en `dia`. */
export const deTodoElDiaEn = <T extends Pick<EventoDeTodoElDia, "desde" | "hasta">>(eventos: readonly T[], dia: string): T[] =>
  eventos.filter((e) => e.desde <= dia && dia < e.hasta);

/**
 * Las reuniones del día: no canceladas, no rechazadas, que no sean el bloque de una tarea ni de todo el día, y con
 * alguien más invitado. Por hora. Lo demás con hora lo da `eventosPropios`.
 */
export function agendaDelDia(
  eventos: readonly EventoConEnlaces[],
  o: {
    porCorreo: ReadonlyMap<string, readonly string[]>;
    porDominio: ReadonlyMap<string, readonly string[]>;
    /** Los dominios de Smarteam. */
    internos: ReadonlySet<string>;
  },
): ReunionDeHoy[] {
  const out: ReunionDeHoy[] = [];
  for (const e of eventos) {
    if (!esReunion(e)) continue;
    const inicio = isoDelEvento(e.start);
    if (!inicio) continue;
    const gente = invitadosDelEvento(e);
    const externos = gente.filter((c) => !o.internos.has(dominioDe(c)));
    out.push({
      id: e.id!,
      titulo: e.summary?.trim() || "(Sin título)",
      inicio,
      fin: isoDelEvento(e.end),
      ocupa: ocupaSuTiempo(e),
      tenue: esTenue(asistenciaPropia(e)),
      conMeet: e.conferenceData?.conferenceSolution?.key?.type === "hangoutsMeet" || !!e.hangoutLink,
      meetUrl: e.hangoutLink?.startsWith("https://") ? e.hangoutLink : null,
      calendarUrl: e.htmlLink?.startsWith("https://") ? e.htmlLink : null,
      empresas: empresasDeLaReunion(externos, o.porCorreo, o.porDominio),
      externos: externos.length,
      internos: gente.length - externos.length,
      deSmarteam: gente.filter((c) => o.internos.has(dominioDe(c))),
    });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** La cuenta de una reunión: la empresa, si es de UNA. Con varias (o ninguna) no cuenta para nadie (invariante 1). */
export function cuentaDelEvento(r: Pick<ReunionDeHoy, "empresas">): string | null {
  return r.empresas.length === 1 ? r.empresas[0] : null;
}

/** Un rato ocupado del calendario. */
export interface RatoOcupado {
  id: string;
  inicio: string;
  fin: string | null;
  /** Para reconocer el almuerzo que la persona marcó (lib/mi-dia/inicio.ts › esAlmuerzo). */
  titulo: string | null;
}

/**
 * Lo ocupado de un calendario: todo evento que bloquea su tiempo (`ocupaSuTiempo`), aunque no sea una reunión (un
 * bloque de trabajo, un evento sin invitados). Es lo que no pisa un hueco que sugiere Nexus.
 */
export function ocupadoDelCalendario(eventos: readonly EventoConEnlaces[]): RatoOcupado[] {
  const out: RatoOcupado[] = [];
  for (const e of eventos) {
    if (!ocupaSuTiempo(e)) continue;
    const inicio = isoDelEvento(e.start);
    if (!inicio) continue;
    out.push({ id: e.id!, inicio, fin: isoDelEvento(e.end), titulo: e.summary?.trim() || null });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** El día en Costa Rica de un instante, y sus límites en UTC (00:00 a 24:00 CR). */
export function limitesDelDiaCR(ahora: Date): { dia: string; desde: Date; hasta: Date } {
  const dia = new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
  const desde = new Date(`${dia}T00:00:00-06:00`);
  return { dia, desde, hasta: new Date(desde.getTime() + 86_400_000) };
}
