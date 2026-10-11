/**
 * lib/google/agenda-de-la-empresa.ts — las reuniones que VIENEN en un calendario, a pedido. SERVIDOR.
 *
 * Para unir una sesión de la exploración a su reunión ANTES de que ocurra (etapa A, 2026-10-09: «una
 * sesión se une a su evento del calendario y espera su transcripción»). Se lee solo cuando alguien abre
 * el selector de «Agregar sesión» (las próximas semanas) o el lienzo mira si un evento ya unido se movió
 * o se canceló (`releerEventos`, como mucho 5 eventos). Nunca escribe en el calendario.
 *
 * ⛔ No es la sincronización de Meet y NUNCA se ensancha su `timeMax` (lib/google/meet-sync.ts, incidente
 * del 2026-09-21: las filas de 2037). Esto no guarda nada en `FirefliesSession`: devuelve lo que vio.
 *
 * Usa el permiso de siempre (`calendar.readonly` con la delegación, getImpersonatedAuth), el mismo que la
 * sincronización de Meet usa en producción. Qué evento es una reunión con la empresa lo decide
 * lib/exploraciones/agendadas.ts (puro): este archivo no sabe nada de la exploración.
 */
import "server-only";
import { calendar as apiCalendar, type calendar_v3 } from "googleapis/build/src/apis/calendar";
import { getImpersonatedAuth } from "./auth";

/** Por qué no se pudo leer un calendario: Google sin configurar (local), sin permiso para esa persona, u otra falla. */
export type MotivoSinAgenda = "sin-google" | "sin-permiso" | "error";

export type ResultadoDeLaAgenda<T> = { ok: true; datos: T } | { ok: false; motivo: MotivoSinAgenda };

export function agendaDisponible(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

function motivoDelError(e: unknown): MotivoSinAgenda {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number | string })?.code ?? (e as { response?: { status?: number } })?.response?.status;
  return code === 401 || code === 403 || /unauthorized_client|invalid_grant|insufficient|forbidden|not authorized/i.test(msg) ? "sin-permiso" : "error";
}

/** Los campos que hacen falta para decidir si un evento es una reunión con la empresa (y nada más). */
const CAMPOS_DEL_EVENTO =
  "id,status,summary,description,start,end,recurringEventId,extendedProperties,conferenceData(conferenceSolution(key(type))),attendees(email,self,responseStatus,resource),organizer(email)";

/**
 * Los eventos del calendario principal de `email` desde ahora hasta dentro de `semanas` semanas, una fila
 * por fecha (`singleEvents`: en una serie, cada fecha es su propia instancia). Hasta 250.
 */
export async function eventosProximos(email: string, o: { semanas: number; ahora?: Date }): Promise<ResultadoDeLaAgenda<calendar_v3.Schema$Event[]>> {
  if (!agendaDisponible()) return { ok: false, motivo: "sin-google" };
  const ahora = o.ahora ?? new Date();
  const hasta = new Date(ahora.getTime() + Math.max(1, Math.min(o.semanas, 8)) * 7 * 24 * 60 * 60 * 1000);
  try {
    const cal = apiCalendar({ version: "v3", auth: getImpersonatedAuth(email) });
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: ahora.toISOString(),
      timeMax: hasta.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      fields: `items(${CAMPOS_DEL_EVENTO})`,
    });
    return { ok: true, datos: (res.data.items ?? []) as calendar_v3.Schema$Event[] };
  } catch (e) {
    console.error(`[google/agenda-de-la-empresa] no se pudo leer el calendario de ${email}`, e instanceof Error ? e.message : e);
    return { ok: false, motivo: motivoDelError(e) };
  }
}

/** Lo que dice el calendario hoy de un evento que ya se unió a una sesión. */
export type EstadoDelEvento =
  /** `invitados`: los correos de quienes están invitados (con quien lo organiza), para mirar que siga siendo con la empresa. */
  | { id: string; estado: "ok"; inicio: string; fin: string | null; titulo: string | null; invitados: string[] }
  | { id: string; estado: "cancelado" }
  /** Ya no está en ese calendario (lo borraron, o quien lo unió dejó de estar invitado). */
  | { id: string; estado: "noExiste" };

/** Hasta cuántos eventos se releen por vez (cada uno es un pedido a Google). */
export const MAX_EVENTOS_A_RELEER = 5;

/** Fecha y hora de un evento, en ISO UTC (uno de todo el día empieza a las 00:00 de Costa Rica). */
function isoDe(t: calendar_v3.Schema$EventDateTime | undefined | null): string | null {
  const v = t?.dateTime ?? (t?.date ? `${t.date}T00:00:00-06:00` : null);
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Vuelve a mirar, en el calendario de `email`, los eventos de esos ids (hasta `MAX_EVENTOS_A_RELEER`). */
export async function releerEventos(email: string, ids: readonly string[]): Promise<ResultadoDeLaAgenda<EstadoDelEvento[]>> {
  if (!agendaDisponible()) return { ok: false, motivo: "sin-google" };
  const cal = apiCalendar({ version: "v3", auth: getImpersonatedAuth(email) });
  const salida: EstadoDelEvento[] = [];
  for (const id of ids.slice(0, MAX_EVENTOS_A_RELEER)) {
    try {
      const res = await cal.events.get({ calendarId: "primary", eventId: id, fields: "id,status,summary,start,end,attendees(email,resource),organizer(email)" });
      const e = res.data;
      if (e.status === "cancelled") {
        salida.push({ id, estado: "cancelado" });
        continue;
      }
      const inicio = isoDe(e.start);
      if (!inicio) {
        salida.push({ id, estado: "noExiste" });
        continue;
      }
      const invitados = [...(e.attendees ?? []).filter((a) => !a.resource).map((a) => a.email ?? ""), e.organizer?.email ?? ""]
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.includes("@"));
      salida.push({ id, estado: "ok", inicio, fin: isoDe(e.end), titulo: e.summary ?? null, invitados: [...new Set(invitados)] });
    } catch (e) {
      const code = (e as { code?: number | string })?.code ?? (e as { response?: { status?: number } })?.response?.status;
      if (code === 404 || code === 410) {
        salida.push({ id, estado: "noExiste" });
        continue;
      }
      console.error(`[google/agenda-de-la-empresa] no se pudo releer el evento ${id}`, e instanceof Error ? e.message : e);
      return { ok: false, motivo: motivoDelError(e) };
    }
  }
  return { ok: true, datos: salida };
}
