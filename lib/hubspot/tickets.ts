/**
 * lib/hubspot/tickets.ts
 *
 * Tickets de soporte de una company (CRM v3) — señal de fricción para el panel
 * de Éxito del cliente. Patrón de deals.ts: associations + batch read.
 *
 * DEGRADACIÓN DE SCOPE (clave): la app OAuth puede NO tener
 * `crm.objects.tickets.read` autorizado todavía. Un 403 NO es error: devuelve
 * `{ supported: false }` y el módulo CS marca `ticketsSupported=false` — el
 * panel muestra "sin permiso" y el watchdog omite la señal. Cuando se re-autorice
 * la app con el scope, esto empieza a andar solo.
 *
 * Retry-401 con forceRefreshSystemToken: la cuenta del sistema es compartida
 * (PROD/local/scripts) y el refresh token ROTA — lección de company-timeline.ts.
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient, forceRefreshSystemToken } from "./client";

export interface CompanyTicket {
  id: string;
  subject: string;
  pipelineStage: string | null; // id de hs_pipeline_stage (label no se resuelve acá — señal, no UI de detalle)
  priority: string | null; // hs_ticket_priority (LOW/MEDIUM/HIGH/URGENT)
  createdAt: string | null;
  closedAt: string | null; // null = abierto
}

export interface CompanyTicketsResult {
  /** false = el scope de tickets no está autorizado (403) — degradar sin ruido. */
  supported: boolean;
  tickets: CompanyTicket[];
}

async function fetchOnce(
  hsClient: HsClient,
  companyId: string,
): Promise<{ status: number; result: CompanyTicketsResult }> {
  const assocRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/companies/${companyId}/associations/tickets?limit=100`,
  });
  if (assocRes.status === 403) return { status: 403, result: { supported: false, tickets: [] } };
  if (assocRes.status !== 200) return { status: assocRes.status, result: { supported: true, tickets: [] } };

  const assocData = (await assocRes.json()) as { results?: { id: string }[] };
  const ids = (assocData.results ?? []).map((r) => r.id);
  if (ids.length === 0) return { status: 200, result: { supported: true, tickets: [] } };

  const batchRes = await hsClient.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/tickets/batch/read",
    body: {
      inputs: ids.slice(0, 100).map((id) => ({ id })),
      properties: ["subject", "hs_pipeline_stage", "hs_ticket_priority", "createdate", "closed_date"],
    },
  });
  if (batchRes.status === 403) return { status: 403, result: { supported: false, tickets: [] } };
  if (batchRes.status !== 200 && batchRes.status !== 207) {
    return { status: batchRes.status, result: { supported: true, tickets: [] } };
  }
  const data = (await batchRes.json()) as {
    results?: {
      id: string;
      properties: {
        subject?: string | null;
        hs_pipeline_stage?: string | null;
        hs_ticket_priority?: string | null;
        createdate?: string | null;
        closed_date?: string | null;
      };
    }[];
  };
  const tickets = (data.results ?? [])
    .map((t) => ({
      id: t.id,
      subject: t.properties.subject ?? "Ticket sin asunto",
      pipelineStage: t.properties.hs_pipeline_stage ?? null,
      priority: t.properties.hs_ticket_priority ?? null,
      createdAt: t.properties.createdate ?? null,
      closedAt: t.properties.closed_date ?? null,
    }))
    .sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });
  return { status: 200, result: { supported: true, tickets } };
}

/** Tickets de la company, con degradación de scope y retry-401 (token compartido). */
export async function fetchCompanyTickets(
  hsClient: HsClient,
  companyId: string,
): Promise<CompanyTicketsResult> {
  try {
    let r = await fetchOnce(hsClient, companyId);
    if (r.status === 401) {
      await forceRefreshSystemToken();
      r = await fetchOnce(await getSystemHubspotClient(), companyId);
    }
    return r.result;
  } catch {
    // API caída ≠ scope faltante: se reporta como soportado pero vacío (el
    // snapshot marca fetchStatus según los errores acumulados).
    return { supported: true, tickets: [] };
  }
}
