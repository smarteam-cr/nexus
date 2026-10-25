/**
 * lib/comunicaciones/reuniones.ts — ¿UNA REUNIÓN O UNA LLAMADA DE HUBSPOT YA LLEGA POR MEET? (U7, 2026-10-25). PURO.
 *
 * Medido el 2026-10-24 en el portal: 759 reuniones y 566 llamadas tienen el resumen de Notetaker, y casi todas las
 * reuniones de HubSpot son las MISMAS del calendario de Google (`hs_meeting_source = BIDIRECTIONAL_SYNC`): su enlace
 * (`hs_meeting_external_url`) es el del evento de Google Calendar. Una llamada de Notetaker de una videollamada trae el
 * enlace de la reunión (`hs_hosted_video_conference_url`). Por eso tres claves, de la más firme a la más floja:
 *   1. el evento de Google Calendar (el `eid` del enlace, en base64: «idDelEvento correoDelCalendario») contra
 *      `FirefliesSession.googleEventId`;
 *   2. el código de Meet (abc-defg-hij) contra `FirefliesSession.conferenceId` (U1);
 *   3. sin ninguna de las dos: la misma cuenta y la misma hora (±10 minutos).
 *
 * La regla: una reunión de HubSpot NO se guarda si la reunión de Meet que la cubre TIENE TEXTO (transcripción, resumen o
 * minuta): sería la misma conversación dos veces. Si la de Meet no tiene texto, el resumen de HubSpot es lo único que hay
 * y se guarda (con la clave, para darlo de baja el día en que llegue el de Meet). Una de Zoom o de Teams no tiene
 * reunión de Meet: se guarda siempre.
 *
 * ⛔ Invariante 1: si la reunión de Meet que la cubre es de OTRO cliente (alguien asoció en HubSpot la reunión de B a la
 * empresa A), la de HubSpot no se guarda, tenga texto o no: su dueño lo decide el chokepoint, no la asociación de
 * HubSpot. Una reunión de Meet sin dueño no decide nada.
 *
 * Quién es el dueño de una reunión de Meet lo decide el chokepoint (`indiceDeReunionesDeMeet`,
 * lib/sessions/project-sources.ts); acá solo se cruza.
 */

/** Un código de Meet: tres letras, cuatro y tres. */
const CODIGO_DE_MEET = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i;

/** El código de Meet del primer texto que lo traiga (el enlace de la videollamada, el lugar, el cuerpo). */
export function codigoDeMeetDe(...textos: readonly (string | null | undefined)[]): string | null {
  for (const t of textos) {
    const m = t ? CODIGO_DE_MEET.exec(t) : null;
    if (m) return m[1]!.toLowerCase();
  }
  return null;
}

/**
 * El id del evento de Google Calendar de un enlace `https://www.google.com/calendar/event?eid=…`. El `eid` es base64
 * (url-safe, sin relleno) de «idDelEvento correoDelCalendario». null si el enlace no es de Google Calendar.
 */
export function eventoDeGoogleDe(url: string | null | undefined): string | null {
  if (!url || !/google\.com\/calendar/i.test(url)) return null;
  let eid: string | null = null;
  try {
    eid = new URL(url).searchParams.get("eid");
  } catch {
    return null;
  }
  if (!eid) return null;
  const b64 = eid.replace(/-/g, "+").replace(/_/g, "/");
  let crudo: string;
  try {
    crudo = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8");
  } catch {
    return null;
  }
  const id = crudo.split(/\s+/)[0]?.trim() ?? "";
  return /^[a-zA-Z0-9_]{5,}$/.test(id) ? id : null;
}

/** Una reunión de Meet de Nexus, como la cruza esta regla (sale del chokepoint). */
export interface ReunionDeMeet {
  id: string;
  googleEventId: string | null;
  conferenceId: string | null;
  /** ms */
  inicio: number;
  /** El dueño (el chokepoint), o null si no tiene. */
  clientId: string | null;
  conTexto: boolean;
}

/** Las reuniones de Meet indexadas por cada clave. */
export interface IndiceDeMeet {
  porEvento: Map<string, ReunionDeMeet>;
  porCodigo: Map<string, ReunionDeMeet[]>;
  porCliente: Map<string, ReunionDeMeet[]>;
}

export function indexarReunionesDeMeet(lista: readonly ReunionDeMeet[]): IndiceDeMeet {
  const indice: IndiceDeMeet = { porEvento: new Map(), porCodigo: new Map(), porCliente: new Map() };
  for (const r of lista) {
    if (r.googleEventId) indice.porEvento.set(r.googleEventId, r);
    if (r.conferenceId) indice.porCodigo.set(r.conferenceId.toLowerCase(), [...(indice.porCodigo.get(r.conferenceId.toLowerCase()) ?? []), r]);
    if (r.clientId) indice.porCliente.set(r.clientId, [...(indice.porCliente.get(r.clientId) ?? []), r]);
  }
  return indice;
}

/** Cuánto pueden distar dos inicios para ser la misma reunión (solo la tercera clave). */
export const MINUTOS_DE_TOLERANCIA = 10;
/**
 * Un código de Meet se reusa (una recurrente, o la sala fija de una persona que la usa con varios clientes el mismo
 * día): cuenta solo la reunión a la misma hora (±2 h), no la de otra hora del mismo día.
 */
const HORAS_DEL_MISMO_CODIGO = 2;

/** Las claves de una reunión o llamada de HubSpot. */
export interface ClavesDeReunion {
  googleEventId: string | null;
  codigoDeMeet: string | null;
  /** ms */
  inicio: number;
}

/** La reunión de Meet que cubre a esta de HubSpot, o null. `clientId` = el dueño que salió de sus asociaciones. */
export function reunionDeMeetQueLaCubre(c: ClavesDeReunion, clientId: string | null, indice: IndiceDeMeet): ReunionDeMeet | null {
  if (c.googleEventId) {
    const r = indice.porEvento.get(c.googleEventId);
    if (r) return r;
  }
  if (c.codigoDeMeet) {
    const candidatas = (indice.porCodigo.get(c.codigoDeMeet) ?? []).filter((r) => Math.abs(r.inicio - c.inicio) <= HORAS_DEL_MISMO_CODIGO * 3_600_000);
    if (candidatas.length) return candidatas.sort((a, b) => Math.abs(a.inicio - c.inicio) - Math.abs(b.inicio - c.inicio))[0]!;
  }
  if (!clientId) return null;
  const mismas = (indice.porCliente.get(clientId) ?? []).filter((r) => Math.abs(r.inicio - c.inicio) <= MINUTOS_DE_TOLERANCIA * 60_000);
  return mismas.sort((a, b) => Number(b.conTexto) - Number(a.conTexto))[0] ?? null;
}

export type CruceConMeet =
  /** La de Meet que la cubre tiene texto: sería la misma conversación dos veces. */
  | "ya_llega_por_meet"
  /** La de Meet que la cubre es de otro cliente (invariante 1): no se guarda. */
  | "de_otro_cliente"
  /** Se guarda: no hay de Meet, o no tiene texto y es del mismo cliente (o no tiene dueño). */
  | "se_guarda";

/** Qué hacer con una reunión o llamada de HubSpot. `clientId` = el dueño que salió de sus asociaciones. */
export function cruceConMeet(c: ClavesDeReunion, clientId: string | null, indice: IndiceDeMeet): CruceConMeet {
  const meet = reunionDeMeetQueLaCubre(c, clientId, indice);
  if (!meet) return "se_guarda";
  if (meet.clientId && clientId && meet.clientId !== clientId) return "de_otro_cliente";
  // Una de Meet sin dueño no aparece en la ficha de nadie: la de HubSpot (que sí es de una cuenta) se guarda.
  if (!meet.clientId && clientId) return "se_guarda";
  return meet.conTexto ? "ya_llega_por_meet" : "se_guarda";
}

/** ¿La de HubSpot sobra? Sí si la de Meet que la cubre tiene texto. */
export function yaLlegaPorMeet(c: ClavesDeReunion, clientId: string | null, indice: IndiceDeMeet): boolean {
  return cruceConMeet(c, clientId, indice) === "ya_llega_por_meet";
}
