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
 * de objeto en la app). Si falla / no hay datos, devuelve "" (no rompe la generación).
 */
import type { Client } from "@hubspot/api-client";

type V1Engagement = {
  engagement?: { type?: string; timestamp?: number };
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
  type: "NOTE" | "CALL" | "MEETING";
  title: string;
  body: string;
  date: string | null;
  ts: number;
};

/** Ítems del timeline de la company (notas + llamadas + reuniones), más reciente primero,
 *  o [] si no hay datos / falla la API. Topeado para no inflar. Lo usa el panel y el prompt. */
export async function fetchCompanyTimelineItems(hsClient: Client, companyId: string): Promise<TimelineItem[]> {
  let raw: V1Engagement[] = [];
  try {
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/engagements/v1/engagements/associated/company/${companyId}/paged?limit=100`,
    });
    if (res.status !== 200) return [];
    const data = (await res.json()) as { results?: V1Engagement[] };
    raw = data.results ?? [];
  } catch {
    return [];
  }

  return raw
    .filter((e) => WANT.has(e.engagement?.type ?? ""))
    .map((e): TimelineItem | null => {
      const type = (e.engagement?.type ?? "") as TimelineItem["type"];
      const { title, body } = engagementText(type, e.metadata ?? {});
      if (!body) return null;
      return { type, title, body, date: fmtDate(e.engagement?.timestamp), ts: e.engagement?.timestamp ?? 0 };
    })
    .filter((x): x is TimelineItem => x !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 25);
}

/** Serializa los ítems a texto para el prompt del agente. */
export function serializeTimeline(items: TimelineItem[]): string {
  return items
    .map((i) => {
      const head = [TYPE_LABEL[i.type] ?? i.type, i.date ? `· ${i.date}` : "", i.title ? `· ${i.title}` : ""]
        .filter(Boolean)
        .join(" ");
      return `### ${head}\n${i.body}`;
    })
    .join("\n\n");
}

/** Timeline serializado a texto (para el contexto del agente), o "" si no hay nada. */
export async function fetchCompanyTimeline(hsClient: Client, companyId: string): Promise<string> {
  return serializeTimeline(await fetchCompanyTimelineItems(hsClient, companyId));
}
