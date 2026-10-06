/**
 * lib/hubspot/company-timeline.ts
 *
 * Lee el TIMELINE de una company de HubSpot — notas + llamadas + reuniones (con su
 * resumen/body) — y lo serializa a texto para alimentar a los agentes (business case +
 * canvas de proyecto). Clave para prospectos que vienen por HubSpot cuyas reuniones
 * (Zoom) NO están en el sync de Meet, pero sí quedan en el registro de empresa de HubSpot.
 *
 * USA LA API LEGACY v1 DE ENGAGEMENTS (`/engagements/v1/engagements/associated/company/...`):
 * verificado contra la cuenta real, funciona con los scopes ACTUALES (no requiere agregar
 * scopes ni re-consent). Los scopes de objeto v3 (crm.objects.notes/calls/meetings) NO están
 * disponibles para esta app (legacy), por eso esta es la vía.
 *
 * De la llamada se extrae `callSummary` (resumen IA de HubSpot) + `body`. El transcript
 * COMPLETO (hasTranscript=true) no viene en el metadata v1 — quedaría para la API de
 * conversation-intelligence aparte (diferido). El resumen ya captura lo relevante.
 *
 * ⚠️ La API v1 es legacy: si HubSpot la sunsetea habría que migrar (o conseguir los scopes
 * de objeto en la app).
 *
 * ⛔ «Sin permiso» y «falló» NO son lo mismo (2026-10-05, mismo criterio que company-contacts.ts).
 * Un 403 (sin permiso) devuelve vacío, como siempre. Cualquier otro fallo (un 500, un 429, la red,
 * un 401 aun con el token renovado) LANZA `FalloAlLeerElRegistro`: si devolviera «cero ítems», la
 * copia de señales de Éxito del cliente borraría la última actividad y el cliente se vería «frío»
 * por un fallo pasajero de HubSpot. cs-signals.ts atrapa el error y conserva lo que tenía. Los
 * demás llamadores (generación de propuesta, handoff, columnas de HubSpot) ya lo envuelven en
 * try/catch y siguen sin el timeline: la generación no se rompe.
 */
import type { Client } from "@hubspot/api-client";
import { getSystemHubspotClient, forceRefreshSystemToken } from "./client";
import { esNotaDeLaFicha } from "@/lib/clients/ficha";

type V1Engagement = {
  engagement?: { id?: number | string; type?: string; timestamp?: number };
  metadata?: Record<string, unknown>;
};

const WANT = new Set(["NOTE", "CALL", "MEETING"]);
const TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

/** Los bodies/summaries de HubSpot vienen en HTML → texto plano. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fmtDate(ms?: number): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** Texto útil del metadata v1 según el tipo de engagement. */
function engagementText(type: string, m: Record<string, unknown>): { title: string; body: string } {
  const get = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");
  if (type === "NOTE") return { title: "", body: stripHtml(get("body")) };
  if (type === "CALL") {
    // callSummary = resumen IA de HubSpot; body = nota manual (puede haber uno u otro).
    const body = [get("callSummary"), get("body")].map(stripHtml).filter(Boolean).join("\n");
    return { title: stripHtml(get("title")), body };
  }
  if (type === "MEETING") return { title: stripHtml(get("title")), body: stripHtml(get("body")) };
  return { title: "", body: "" };
}

export type TimelineItem = {
  /** Id ESTABLE del engagement en HubSpot (v1) — clave para excluir/promover un ítem
   *  por-handoff sin ambigüedad. String para no perder precisión de enteros grandes. */
  id: string;
  type: "NOTE" | "CALL" | "MEETING";
  title: string;
  body: string;
  date: string | null;
  ts: number;
};

/** HubSpot contestó algo que no es ni el dato ni «sin permiso»: no se sabe qué hay en el registro. */
export class FalloAlLeerElRegistro extends Error {
  /** El status de HubSpot, o null si ni siquiera hubo respuesta (la red). */
  readonly status: number | null;
  constructor(status: number | null, detalle: string) {
    super(`no se pudo leer el registro de actividad de HubSpot: ${detalle}`);
    this.name = "FalloAlLeerElRegistro";
    this.status = status;
  }
}

/** Una llamada cruda a la v1 de engagements. 401 vuelve para reintentar; 403 = sin permiso (vacío);
 *  cualquier otro status LANZA. */
async function fetchEngagements(hsClient: Client, companyId: string): Promise<{ status: number; results: V1Engagement[] }> {
  const res = await hsClient.apiRequest({
    method: "GET",
    path: `/engagements/v1/engagements/associated/company/${companyId}/paged?limit=100`,
  });
  if (res.status === 401 || res.status === 403) return { status: res.status, results: [] };
  if (res.status !== 200) throw new FalloAlLeerElRegistro(res.status, `los engagements respondieron ${res.status}`);
  const data = (await res.json()) as { results?: V1Engagement[] };
  return { status: 200, results: data.results ?? [] };
}

/** Todos los ítems útiles del timeline (sin ventana ni cap), más reciente primero.
 *  ⛔ Ante un fallo que no sea «sin permiso» LANZA `FalloAlLeerElRegistro` (ver la cabecera). */
async function fetchAllTimelineItems(hsClient: Client, companyId: string): Promise<TimelineItem[]> {
  let raw: V1Engagement[] = [];
  try {
    let r = await fetchEngagements(hsClient, companyId);
    // 401 = el access token del sistema está stale: la cuenta de HubSpot del sistema es
    // compartida (PROD/local/scripts/2da PC) y el refresh-token ROTA, así que un entorno
    // desincroniza al otro. Forzamos refresh y reintentamos UNA vez con un cliente fresco; si
    // no, el panel y el contexto de generación quedaban VACÍOS sin avisar (síntoma real visto
    // en Visual Branding). Ver forceRefreshSystemToken en lib/hubspot/client.ts.
    if (r.status === 401) {
      await forceRefreshSystemToken();
      r = await fetchEngagements(await getSystemHubspotClient(), companyId);
      if (r.status === 401) throw new FalloAlLeerElRegistro(401, "401 aun con el token renovado");
    }
    raw = r.results;
  } catch (e) {
    if (e instanceof FalloAlLeerElRegistro) throw e;
    throw new FalloAlLeerElRegistro(null, e instanceof Error ? e.message : String(e));
  }

  return raw
    .filter((e) => WANT.has(e.engagement?.type ?? ""))
    .map((e): TimelineItem | null => {
      const type = (e.engagement?.type ?? "") as TimelineItem["type"];
      const { title, body } = engagementText(type, e.metadata ?? {});
      if (!body) return null;
      /* La nota que deja Nexus al confirmar la ficha del cliente lleva campos internos (apertura,
         su porqué, motivación de compra). Este timeline alimenta la propuesta que abre el cliente:
         la nota no entra a ninguna fuente (lib/clients/ficha.ts › esNotaDeLaFicha). */
      if (type === "NOTE" && esNotaDeLaFicha(body)) return null;
      const id = e.engagement?.id != null ? String(e.engagement.id) : "";
      if (!id) return null; // sin id estable no se puede excluir/promover el ítem con seguridad
      return { id, type, title, body, date: fmtDate(e.engagement?.timestamp), ts: e.engagement?.timestamp ?? 0 };
    })
    .filter((x): x is TimelineItem => x !== null)
    .sort((a, b) => b.ts - a.ts);
}

/** Ítems del timeline de la company (notas + llamadas + reuniones), más reciente primero, o []
 *  si no hay datos o no hay permiso (403). ⛔ Si la API FALLA, lanza `FalloAlLeerElRegistro`.
 *  Topeado para no inflar. Lo usa el panel y el prompt. */
export async function fetchCompanyTimelineItems(
  hsClient: Client,
  companyId: string,
  opts?: { since?: Date },
): Promise<TimelineItem[]> {
  const all = await fetchAllTimelineItems(hsClient, companyId);
  return all
    // Ventana temporal opcional (ej. "era del proyecto"): filtrar ANTES del cap de 25,
    // así el cap se llena con ítems de la era y no con historial viejo de la company.
    .filter((i) => !opts?.since || i.ts >= opts.since.getTime())
    .slice(0, 25);
}

/** Cap de ítems del historial PREVIO a la era del proyecto (trasfondo comprimido). */
export const TIMELINE_PREVIOUS_CAP = 10;

/**
 * Timeline partido por la era del proyecto: `current` (≥ since, cap 25 — material del
 * proyecto) y `previous` (< since, cap 10 — trasfondo de implementaciones anteriores,
 * clave en RE-implementaciones: describe lo que YA existe construido sin volver a
 * mezclar el historial completo en todos los proyectos). Una sola llamada a la API.
 */
export async function fetchCompanyTimelineSplit(
  hsClient: Client,
  companyId: string,
  since: Date,
): Promise<{ current: TimelineItem[]; previous: TimelineItem[] }> {
  const all = await fetchAllTimelineItems(hsClient, companyId);
  const sinceMs = since.getTime();
  return {
    current: all.filter((i) => i.ts >= sinceMs).slice(0, 25),
    previous: all.filter((i) => i.ts < sinceMs).slice(0, TIMELINE_PREVIOUS_CAP),
  };
}

/** Serializa los ítems a texto para el prompt del agente. `perItemChars` recorta cada
 *  body (para bloques comprimidos como el historial previo). */
export function serializeTimeline(items: TimelineItem[], opts?: { perItemChars?: number }): string {
  return items
    .map((i) => {
      const head = [TYPE_LABEL[i.type] ?? i.type, i.date ? `· ${i.date}` : "", i.title ? `· ${i.title}` : ""]
        .filter(Boolean)
        .join(" ");
      const body = opts?.perItemChars ? i.body.slice(0, opts.perItemChars) : i.body;
      return `### ${head}\n${body}`;
    })
    .join("\n\n");
}

/** Timeline serializado a texto (para el contexto del agente), o "" si no hay nada.
 *  ⛔ Si la API falla, lanza `FalloAlLeerElRegistro` (quien lo usa lo envuelve en try/catch). */
export async function fetchCompanyTimeline(
  hsClient: Client,
  companyId: string,
  opts?: { since?: Date },
): Promise<string> {
  return serializeTimeline(await fetchCompanyTimelineItems(hsClient, companyId, opts));
}

/** Meses hacia atrás desde el nacimiento del proyecto que definen su "era". */
export const PROJECT_ERA_LOOKBACK_MONTHS = 6;

/**
 * Inicio de la "era" de un proyecto: (hubspotCreatedAt ?? createdAt) − 6 meses.
 * Se usa para acotar el timeline de HubSpot del handoff/panel: sin esto, engagements
 * de implementaciones viejas de la misma company contaminaban por igual el contexto
 * de TODOS los proyectos del cliente.
 */
export function projectEraSince(p: { hubspotCreatedAt: Date | null; createdAt: Date }): Date {
  const base = new Date(p.hubspotCreatedAt ?? p.createdAt);
  base.setMonth(base.getMonth() - PROJECT_ERA_LOOKBACK_MONTHS);
  return base;
}
