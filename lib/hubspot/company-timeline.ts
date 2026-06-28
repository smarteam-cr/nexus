/**
 * lib/hubspot/company-timeline.ts
 *
 * Lee el TIMELINE de una company de HubSpot — notas + llamadas + reuniones (con su
 * body/nota registrada) — y lo serializa a texto para alimentar a los agentes (business
 * case + canvas de proyecto). Clave para prospectos que vienen por HubSpot cuyas reuniones
 * (Zoom) NO están en el sync de Meet, pero sí quedan en el registro de empresa de HubSpot.
 *
 * Requiere scopes `crm.objects.{notes,calls,meetings}.read` (ver app/api/auth/hubspot).
 * Si falta el scope o no hay datos, devuelve "" (no rompe la generación).
 *
 * ⚠️ El transcript COMPLETO de Conversation Intelligence (con speakers) NO es accesible
 * de forma confiable por la API pública de HubSpot. Sí se lee `hs_call_body`/`hs_meeting_body`
 * (la nota/resumen registrado) y `hs_note_body` — donde muchas integraciones (Zoom) dejan
 * el transcript/resumen. Verificar con un probe sobre una call real tras el re-consent.
 */
import type { Client } from "@hubspot/api-client";

type EngagementSpec = {
  object: "notes" | "calls" | "meetings";
  label: string;
  titleKey?: string;
  bodyKeys: string[];
};

const SPECS: EngagementSpec[] = [
  { object: "notes", label: "Notas de la empresa", bodyKeys: ["hs_note_body"] },
  { object: "calls", label: "Llamadas registradas", titleKey: "hs_call_title", bodyKeys: ["hs_call_body"] },
  { object: "meetings", label: "Reuniones", titleKey: "hs_meeting_title", bodyKeys: ["hs_meeting_body", "hs_internal_meeting_notes"] },
];

function fmtDate(ts?: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** Los bodies de HubSpot vienen en HTML → texto plano. */
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

async function fetchEngagementTexts(
  hsClient: Client,
  companyId: string,
  spec: EngagementSpec,
  max: number,
): Promise<string[]> {
  try {
    const assocRes = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}/associations/${spec.object}?limit=100`,
    });
    if (assocRes.status !== 200) return []; // sin scope → 403 → vacío (no rompe)
    const assoc = (await assocRes.json()) as { results?: { id: string }[] };
    const ids = (assoc.results ?? []).map((r) => r.id);
    if (ids.length === 0) return [];

    const properties = [...spec.bodyKeys, ...(spec.titleKey ? [spec.titleKey] : []), "hs_timestamp"];
    const batchRes = await hsClient.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${spec.object}/batch/read`,
      body: { inputs: ids.map((id) => ({ id })), properties },
    });
    if (batchRes.status !== 200) return [];
    const data = (await batchRes.json()) as {
      results?: { properties: Record<string, string | null | undefined> }[];
    };

    return (data.results ?? [])
      .map((r) => {
        const p = r.properties;
        const body = stripHtml(spec.bodyKeys.map((k) => (p[k] ?? "").trim()).filter(Boolean).join("\n"));
        if (!body) return null;
        const title = spec.titleKey ? (p[spec.titleKey] ?? "").trim() : "";
        const date = fmtDate(p.hs_timestamp);
        const head = [date ? `[${date}]` : "", title].filter(Boolean).join(" ");
        const ts = p.hs_timestamp ? new Date(p.hs_timestamp).getTime() : 0;
        return { ts, text: head ? `${head}\n${body}` : body };
      })
      .filter((x): x is { ts: number; text: string } => x !== null)
      .sort((a, b) => b.ts - a.ts) // más reciente primero
      .slice(0, max)
      .map((i) => i.text);
  } catch {
    return [];
  }
}

/**
 * Timeline de la company (notas + llamadas + reuniones) serializado a texto, o "" si no
 * hay datos / falta scope. Topeado por tipo para no inflar el prompt del LLM.
 */
export async function fetchCompanyTimeline(hsClient: Client, companyId: string): Promise<string> {
  const results = await Promise.all(
    SPECS.map((s) => fetchEngagementTexts(hsClient, companyId, s, s.object === "notes" ? 20 : 12)),
  );
  const blocks: string[] = [];
  SPECS.forEach((spec, i) => {
    if (results[i].length) blocks.push(`## ${spec.label} (HubSpot)\n${results[i].join("\n\n")}`);
  });
  return blocks.join("\n\n");
}
