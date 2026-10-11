/**
 * lib/hubspot/grabaciones-de-reuniones.ts — el resumen de IA y la transcripción de las reuniones grabadas
 * con HubSpot (Elías, 2026-10-08: «está en el CRM, ¿por qué Nexus no la toma?»). SERVIDOR. Solo lee.
 *
 * Desde el 31 de agosto de 2026, HubSpot guarda la grabación de una reunión (su notetaker, o Zoom, Meet o
 * Teams sincronizados) en la PROPIA reunión: `hs_meeting_summary` (el resumen de IA),
 * `hs_has_meeting_transcript` y `hs_meeting_transcription_id` (el número de la transcripción). Nexus lee la
 * actividad por la API v1 de engagements, que no trae ninguno de los tres. Acá se piden aparte:
 *   · las propiedades, en lote, por la API v3 de reuniones (con los permisos de siempre: medido el
 *     2026-10-08 contra la reunión del 28 sep de CreditForce, devolvió su resumen de 1.784 letras);
 *   · la transcripción completa, una por una, por la API de transcripciones (permiso opcional
 *     `crm.extensions_calling_transcripts.read`: se suma por `HUBSPOT_SCOPES_OPCIONALES_EXTRA`; sin él,
 *     HubSpot responde 403, también medido ese día).
 * Sin permiso para una de las dos, se sigue sin ella: nunca rompe la lectura. Lo que se negó no se
 * vuelve a pedir por una hora (cada pedido negado es un 403 más en el log).
 */
import type { Client } from "@hubspot/api-client";
import { forceRefreshSystemToken, getSystemHubspotClient } from "./client";
import { textoDeLaTranscripcion, type IntervencionDeHubspot } from "./transcripcion-de-reunion";

export interface GrabacionDeReunion {
  /** El resumen de IA de HubSpot (HTML), si lo hay. */
  resumen: string | null;
  /** La transcripción como texto (transcripcion-de-reunion.ts), si se pidió y se pudo leer. */
  transcripcion: string | null;
  /** HubSpot dice que tiene transcripción (aunque no se haya podido leer). */
  tieneTranscripcion: boolean;
  /** Los usuarios de HubSpot de la reunión (su dueño y los asistentes internos), por id. */
  propietarios: string[];
}

/** La versión de la API de transcripciones (la de fecha; si no responde, la v3 de antes). */
export const VERSION_DE_TRANSCRIPCIONES = "2026-09";

const PROPIEDADES = ["hs_meeting_summary", "hs_ai_summary", "hs_has_meeting_transcript", "hs_meeting_transcription_id", "hubspot_owner_id", "hs_attendee_owner_ids"];
const UNA_HORA = 60 * 60 * 1000;
const negado: { reuniones: number; transcripciones: number } = { reuniones: 0, transcripciones: 0 };

type Pedido = { method: "GET" | "POST"; path: string; body?: unknown };

/**
 * Un pedido con un reintento si el token del sistema venció. Con `cliente` (el portal de un cliente, como
 * en el handoff), sin reintento. null si ni siquiera hubo respuesta.
 */
async function pedir(pedido: Pedido, cliente?: Client): Promise<{ status: number; json: unknown; texto: string } | null> {
  try {
    let hs = cliente ?? (await getSystemHubspotClient());
    let res = await hs.apiRequest(pedido);
    if (res.status === 401 && !cliente) {
      await forceRefreshSystemToken();
      hs = await getSystemHubspotClient();
      res = await hs.apiRequest(pedido);
    }
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* no es JSON */
    }
    return { status: res.status, json, texto };
  } catch (e) {
    console.error(`[hubspot/grabaciones] ${pedido.method} ${pedido.path} falló`, e);
    return null;
  }
}

function avisarSinPermiso(que: keyof typeof negado, texto: string) {
  negado[que] = Date.now();
  // El mensaje de HubSpot dice qué permiso falta: es lo que hay que sumar a la app.
  console.warn(`[hubspot/grabaciones] sin permiso para leer ${que === "reuniones" ? "las reuniones (v3)" : "las transcripciones"}: ${texto.slice(0, 300)}`);
}

const verdadero = (v: unknown) => v === true || v === "true";

/**
 * Las grabaciones de estas reuniones, por id. `transcripciones`: de cuántas (las primeras de `ids`, que
 * van de la más reciente a la más vieja) se pide además la transcripción completa; 0 = solo el resumen.
 */
export async function grabacionesDeReuniones(
  ids: readonly string[],
  o: { transcripciones: number; cliente?: Client },
): Promise<Map<string, GrabacionDeReunion>> {
  const out = new Map<string, GrabacionDeReunion>();
  const unicos = [...new Set(ids.filter((id) => /^\d+$/.test(id)))];
  // Lo negado se recuerda solo para la cuenta del sistema: el portal de un cliente tiene otros permisos.
  const recordar = !o.cliente;
  if (!unicos.length || (recordar && Date.now() - negado.reuniones < UNA_HORA)) return out;

  const numeros = new Map<string, string>();
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const r = await pedir({ method: "POST", path: "/crm/v3/objects/meetings/batch/read", body: { properties: PROPIEDADES, inputs: lote.map((id) => ({ id })) } }, o.cliente);
    if (!r) return out;
    if (r.status === 403) {
      if (recordar) avisarSinPermiso("reuniones", r.texto);
      return out;
    }
    if (r.status !== 200 && r.status !== 207) {
      console.error(`[hubspot/grabaciones] las reuniones respondieron ${r.status}`);
      return out;
    }
    const resultados = ((r.json as { results?: { id?: string; properties?: Record<string, unknown> }[] })?.results ?? []);
    for (const x of resultados) {
      if (!x.id) continue;
      const p = x.properties ?? {};
      const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
      const resumen = texto(p.hs_meeting_summary) ?? texto(p.hs_ai_summary);
      const numero = texto(p.hs_meeting_transcription_id)?.trim() ?? null;
      // `hs_attendee_owner_ids` viene separado por punto y coma.
      const propietarios = [...new Set([texto(p.hubspot_owner_id), ...(texto(p.hs_attendee_owner_ids) ?? "").split(";")].map((v) => (v ?? "").trim()).filter((v) => /^\d+$/.test(v)))];
      out.set(String(x.id), { resumen, transcripcion: null, tieneTranscripcion: verdadero(p.hs_has_meeting_transcript) || !!numero, propietarios });
      if (numero) numeros.set(String(x.id), numero);
    }
  }

  // La transcripción completa: de las más recientes, y solo si hay permiso.
  const conNumero = unicos.filter((id) => numeros.has(id)).slice(0, Math.max(0, o.transcripciones));
  for (const id of conNumero) {
    if (recordar && Date.now() - negado.transcripciones < UNA_HORA) break;
    const numero = numeros.get(id)!;
    let r = await pedir({ method: "GET", path: `/crm/extensions/calling/${VERSION_DE_TRANSCRIPCIONES}/transcripts/${encodeURIComponent(numero)}` }, o.cliente);
    if (r?.status === 404) r = await pedir({ method: "GET", path: `/crm/v3/extensions/calling/transcripts/${encodeURIComponent(numero)}` }, o.cliente);
    if (!r) continue;
    if (r.status === 403) {
      if (recordar) avisarSinPermiso("transcripciones", r.texto);
      break;
    }
    if (r.status !== 200) {
      console.error(`[hubspot/grabaciones] la transcripción ${numero} respondió ${r.status}`);
      continue;
    }
    const intervenciones = ((r.json as { transcriptUtterances?: IntervencionDeHubspot[] })?.transcriptUtterances ?? []);
    const texto = textoDeLaTranscripcion(intervenciones);
    const actual = out.get(id);
    if (actual && texto) out.set(id, { ...actual, transcripcion: texto });
  }
  return out;
}
