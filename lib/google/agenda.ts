/**
 * lib/google/agenda.ts — los bloques de una tarea en Google Calendar y lo ocupado de tu semana. SERVIDOR.
 *
 * Una tarea, su bloque (decisión de Elías, 8 oct). Nexus los crea con el clic de la dueña de la tarea, en SU
 * calendario principal, como PRIVADOS (el resto de la empresa ve «Ocupado»), sin Meet ni invitados y sin avisar a
 * nadie. Cada bloque guarda su calendario: solo la dueña lo mueve o lo quita.
 *
 *   - Lo OCUPADO se lee con el `calendar.readonly` de siempre (getImpersonatedAuth), solo del calendario de quien pide.
 *   - Crear y quitar usa el JWT aparte (getAgendaWriteAuth, `calendar.events.owned`). Si Google lo rechaza (el permiso
 *     no está autorizado en Google Admin, o Google sin configurar en local), lanza `AgendaSinPermiso` y la pantalla
 *     ofrece el enlace de plantilla.
 */
import "server-only";
import { calendar as apiCalendar, type calendar_v3 } from "googleapis/build/src/apis/calendar";
import { getAgendaWriteAuth, getImpersonatedAuth } from "./auth";
import { esBloqueDeTarea } from "./meet-sync-cambios";

export { esBloqueDeTarea };

export class AgendaSinPermiso extends Error {}

export function googleConfigurado(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

export interface Ocupado {
  inicio: string;
  fin: string;
  titulo: string;
  /** Todo el día (fuera de la oficina, o un evento de día completo que bloquea). */
  todoElDia: boolean;
  /** Un bloque de una tarea de Nexus. */
  deTarea: boolean;
}

/** Lo ocupado de un calendario entre dos instantes. Un evento privado dice «Ocupado»; una invitación rechazada no ocupa. */
export async function ocupadoEntre(email: string, desde: Date, hasta: Date): Promise<Ocupado[]> {
  const cal = apiCalendar({ version: "v3", auth: getImpersonatedAuth(email) });
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
    fields: "items(summary,start,end,transparency,eventType,visibility,status,description,extendedProperties,attendees(self,responseStatus))",
  });
  const salida: Ocupado[] = [];
  for (const e of (res.data.items ?? []) as calendar_v3.Schema$Event[]) {
    if (e.status === "cancelled" || e.transparency === "transparent") continue;
    const yo = e.attendees?.find((a) => a.self);
    if (yo?.responseStatus === "declined") continue;
    const todoElDia = !!e.start?.date && !e.start?.dateTime;
    if (todoElDia && e.eventType !== "outOfOffice") continue; // un evento de todo el día que no es «Fuera de la oficina» no ocupa horas
    const inicio = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T06:00:00.000Z` : null);
    const fin = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T06:00:00.000Z` : null);
    if (!inicio || !fin) continue;
    salida.push({
      inicio: new Date(inicio).toISOString(),
      fin: new Date(fin).toISOString(),
      titulo: e.visibility === "private" || e.visibility === "confidential" ? "Ocupado" : (e.summary ?? "Ocupado"),
      todoElDia,
      deTarea: esBloqueDeTarea(e),
    });
  }
  return salida;
}

function esErrorDePermiso(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number | string; response?: { status?: number } })?.code ?? (e as { response?: { status?: number } })?.response?.status;
  return code === 401 || code === 403 || /unauthorized_client|invalid_grant|insufficient|forbidden|not authorized/i.test(msg);
}

/** Crea los bloques de una tarea en el calendario de su dueña. Devuelve los ids de los eventos. */
export async function crearBloques(o: {
  email: string;
  tareaId: string;
  titulo: string;
  url: string;
  bloques: readonly { inicio: string; fin: string }[];
}): Promise<{ eventoId: string; inicio: string; fin: string }[]> {
  if (!googleConfigurado()) throw new AgendaSinPermiso("Google no está configurado en este servidor.");
  const cal = apiCalendar({ version: "v3", auth: getAgendaWriteAuth(o.email) });
  const creados: { eventoId: string; inicio: string; fin: string }[] = [];
  try {
    for (const b of o.bloques) {
      const res = await cal.events.insert({
        calendarId: "primary",
        sendUpdates: "none",
        conferenceDataVersion: 0,
        requestBody: {
          summary: `Tarea · ${o.titulo}`.slice(0, 200),
          description: `${o.url}\n\nnexustarea ${o.tareaId}`,
          start: { dateTime: b.inicio, timeZone: "America/Costa_Rica" },
          end: { dateTime: b.fin, timeZone: "America/Costa_Rica" },
          visibility: "private",
          transparency: "opaque",
          reminders: { useDefault: true },
          extendedProperties: { private: { nexusTareaId: o.tareaId } },
        },
      });
      if (res.data.id) creados.push({ eventoId: res.data.id, inicio: b.inicio, fin: b.fin });
    }
    return creados;
  } catch (e) {
    // Lo que alcanzó a crearse se quita: una tanda va entera o no va.
    for (const c of creados) await cal.events.delete({ calendarId: "primary", eventId: c.eventoId, sendUpdates: "none" }).catch(() => undefined);
    if (esErrorDePermiso(e)) throw new AgendaSinPermiso("Nexus todavía no tiene permiso para crear eventos en tu calendario.");
    throw e;
  }
}

/**
 * Quita los bloques de una tarea. Solo los del calendario de quien pide (cada bloque guarda el suyo), y nunca un evento
 * que ya existía y la persona unió a la tarea (`asociado`, P3): ese no lo creó Nexus, así que no lo borra.
 */
export async function quitarBloques(email: string, bloques: readonly { calendario: string; eventoId: string | null; asociado?: boolean }[]): Promise<number> {
  const propios = bloques.filter((b) => b.calendario.toLowerCase() === email.toLowerCase() && b.eventoId && !b.asociado);
  if (!propios.length) return 0;
  if (!googleConfigurado()) throw new AgendaSinPermiso("Google no está configurado en este servidor.");
  const cal = apiCalendar({ version: "v3", auth: getAgendaWriteAuth(email) });
  let quitados = 0;
  for (const b of propios) {
    try {
      await cal.events.delete({ calendarId: "primary", eventId: b.eventoId!, sendUpdates: "none" });
      quitados++;
    } catch (e) {
      const status = (e as { code?: number })?.code;
      if (status === 404 || status === 410) {
        quitados++; // ya no estaba
        continue;
      }
      if (esErrorDePermiso(e)) throw new AgendaSinPermiso("Nexus todavía no tiene permiso para quitar eventos de tu calendario.");
      throw e;
    }
  }
  return quitados;
}

/**
 * Un evento del calendario de una persona, por su id (P3, «Asociar a una tarea»), con el `calendar.readonly` de siempre.
 * null si no está, se canceló o es de todo el día (no tiene horario para la tarea).
 */
export async function leerEventoDelCalendario(email: string, eventoId: string): Promise<{ id: string; titulo: string; inicio: string; fin: string } | null> {
  if (!googleConfigurado()) return null;
  const cal = apiCalendar({ version: "v3", auth: getImpersonatedAuth(email) });
  try {
    const res = await cal.events.get({ calendarId: "primary", eventId: eventoId, fields: "id,summary,start,end,status,visibility" });
    const e = res.data;
    if (!e?.id || e.status === "cancelled" || !e.start?.dateTime || !e.end?.dateTime) return null;
    return { id: e.id, titulo: e.summary?.trim() || "(Sin título)", inicio: new Date(e.start.dateTime).toISOString(), fin: new Date(e.end.dateTime).toISOString() };
  } catch (e) {
    const status = (e as { code?: number })?.code;
    if (status === 404 || status === 410) return null;
    throw e;
  }
}
