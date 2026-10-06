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
 *
 * ⛔ «No soportado» y «falló» NO son lo mismo (2026-10-05, mismo criterio que company-contacts.ts).
 * Un 403 dice que no hay permiso: `supported: false`. Cualquier otro fallo (un 500, un 429, la red,
 * un 401 aun con el token renovado) LANZA `FalloAlLeerTickets`: si devolviera «soportado, cero
 * tickets», la copia de señales escribiría «0 abiertos» encima de los guardados y el cliente con
 * fricción se vería tranquilo por un fallo pasajero de HubSpot. Quien llama (cs-signals.ts) atrapa
 * el error y conserva los tickets de la copia anterior.
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

/** HubSpot contestó algo que no es ni el dato ni «sin permiso»: no se sabe cuántos tickets hay. */
export class FalloAlLeerTickets extends Error {
  /** El status de HubSpot, o null si ni siquiera hubo respuesta (la red). */
  readonly status: number | null;
  constructor(status: number | null, detalle: string) {
    super(`no se pudieron leer los tickets de HubSpot: ${detalle}`);
    this.name = "FalloAlLeerTickets";
    this.status = status;
  }
}

/** `status` 401 vuelve para reintentar con el token renovado; cualquier otro fallo LANZA. */
async function fetchOnce(
  hsClient: HsClient,
  companyId: string,
): Promise<{ status: number; result: CompanyTicketsResult }> {
  const assocRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/companies/${companyId}/associations/tickets?limit=100`,
  });
  if (assocRes.status === 403) return { status: 403, result: { supported: false, tickets: [] } };
  if (assocRes.status === 401) return { status: 401, result: { supported: true, tickets: [] } };
  if (assocRes.status !== 200) throw new FalloAlLeerTickets(assocRes.status, `las asociaciones respondieron ${assocRes.status}`);

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
  if (batchRes.status === 401) return { status: 401, result: { supported: true, tickets: [] } };
  if (batchRes.status !== 200 && batchRes.status !== 207) {
    throw new FalloAlLeerTickets(batchRes.status, `la lectura en lote respondió ${batchRes.status}`);
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

/**
 * Tickets de la company, con degradación de scope (403 → `supported: false`) y retry-401 (token
 * compartido). ⛔ Ante cualquier otro fallo LANZA `FalloAlLeerTickets`: nunca devuelve «cero
 * tickets» sin saberlo.
 */
export async function fetchCompanyTickets(
  hsClient: HsClient,
  companyId: string,
): Promise<CompanyTicketsResult> {
  try {
    let r = await fetchOnce(hsClient, companyId);
    if (r.status === 401) {
      await forceRefreshSystemToken();
      r = await fetchOnce(await getSystemHubspotClient(), companyId);
      // Ni con el token renovado: tampoco se sabe cuántos hay.
      if (r.status === 401) throw new FalloAlLeerTickets(401, "401 aun con el token renovado");
    }
    return r.result;
  } catch (e) {
    // API caída ≠ scope faltante: el fallo SUBE para que la copia conserve lo que tenía.
    if (e instanceof FalloAlLeerTickets) throw e;
    throw new FalloAlLeerTickets(null, e instanceof Error ? e.message : String(e));
  }
}
