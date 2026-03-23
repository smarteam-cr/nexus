/**
 * lib/matching/enrichment.ts
 *
 * Fetcher de datos HubSpot para matching de sesiones Fireflies.
 * Obtiene dominios, contactos de empresa y contactos de deals.
 * Incluye cache in-memory por ciclo de sync.
 */

import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";
import { extractDomains } from "@/lib/utils/matching";
import type { Client as HubSpotClient } from "@hubspot/api-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface EnrichedClientData {
  domains: Set<string>;
  companyContactEmails: Set<string>;
  dealContactEmails: Set<string>;
}

const EMPTY_ENRICHMENT: EnrichedClientData = {
  domains: new Set(),
  companyContactEmails: new Set(),
  dealContactEmails: new Set(),
};

interface EnrichableClient {
  company?: string | null;
  hubspotCompanyId?: string | null;
  hubspotAccount?: { id: string } | null;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function getClient(hubspotAccountId?: string): Promise<HubSpotClient> {
  return hubspotAccountId
    ? getHubspotClient(hubspotAccountId)
    : getSystemHubspotClient();
}

async function fetchCompanyDomains(
  hsClient: HubSpotClient,
  companyId: string,
  clientCompany?: string | null
): Promise<Set<string>> {
  try {
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=domain,website`,
    });
    const data = (await res.json()) as {
      properties?: { domain?: string | null; website?: string | null };
    };
    return extractDomains([
      clientCompany,
      data.properties?.domain,
      data.properties?.website,
    ]);
  } catch {
    return extractDomains([clientCompany]);
  }
}

async function fetchCompanyContactEmails(
  hsClient: HubSpotClient,
  companyId: string
): Promise<Set<string>> {
  const emails = new Set<string>();
  try {
    const assocRes = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}/associations/contacts?limit=100`,
    });
    const assocData = (await assocRes.json()) as { results?: { id: string }[] };
    const contactIds = (assocData.results ?? []).map((r) => r.id);
    if (contactIds.length === 0) return emails;

    const contactRes = await hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/contacts/batch/read",
      body: {
        inputs: contactIds.slice(0, 100).map((id) => ({ id })),
        properties: ["email"],
      },
    });
    const contactData = (await contactRes.json()) as {
      results?: { properties?: { email?: string | null } }[];
    };
    for (const c of contactData.results ?? []) {
      if (c.properties?.email) emails.add(c.properties.email.toLowerCase());
    }
  } catch { /* no fatal */ }
  return emails;
}

async function fetchDealContactEmails(
  hsClient: HubSpotClient,
  companyId: string
): Promise<Set<string>> {
  const emails = new Set<string>();
  try {
    // Obtener deals asociados a la empresa (máx 10)
    const dealRes = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}/associations/deals?limit=10`,
    });
    const dealData = (await dealRes.json()) as { results?: { id: string }[] };
    const dealIds = (dealData.results ?? []).map((r) => r.id);
    if (dealIds.length === 0) return emails;

    // Por cada deal, obtener contactos asociados (en paralelo, máx 5 deals a la vez)
    const allContactIds = new Set<string>();
    const BATCH_SIZE = 5;

    for (let i = 0; i < dealIds.length; i += BATCH_SIZE) {
      const batch = dealIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (dealId) => {
          try {
            const res = await hsClient.apiRequest({
              method: "GET",
              path: `/crm/v3/objects/deals/${dealId}/associations/contacts?limit=20`,
            });
            const data = (await res.json()) as { results?: { id: string }[] };
            return (data.results ?? []).map((r) => r.id);
          } catch {
            return [];
          }
        })
      );
      for (const ids of results) ids.forEach((id) => allContactIds.add(id));
    }

    if (allContactIds.size === 0) return emails;

    // Batch read de emails (máx 100)
    const contactRes = await hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/contacts/batch/read",
      body: {
        inputs: Array.from(allContactIds).slice(0, 100).map((id) => ({ id })),
        properties: ["email"],
      },
    });
    const contactData = (await contactRes.json()) as {
      results?: { properties?: { email?: string | null } }[];
    };
    for (const c of contactData.results ?? []) {
      if (c.properties?.email) emails.add(c.properties.email.toLowerCase());
    }
  } catch { /* no fatal */ }
  return emails;
}

// ── Función principal de enriquecimiento ──────────────────────────────────────

export async function enrichClient(
  client: EnrichableClient
): Promise<EnrichedClientData> {
  // Sin hubspotCompanyId → solo dominio de client.company
  if (!client.hubspotCompanyId) {
    return {
      domains: extractDomains([client.company]),
      companyContactEmails: new Set(),
      dealContactEmails: new Set(),
    };
  }

  try {
    const hsClient = await getClient(client.hubspotAccount?.id);
    const companyId = client.hubspotCompanyId;

    // Fetch dominios y contactos de empresa en paralelo
    const [domains, companyContactEmails] = await Promise.all([
      fetchCompanyDomains(hsClient, companyId, client.company),
      fetchCompanyContactEmails(hsClient, companyId),
    ]);

    // Deal contacts se fetchean solo si se necesita (lazy en cascade)
    // Pero para pre-cache en sync, lo traemos también
    const dealContactEmails = await fetchDealContactEmails(hsClient, companyId);

    return { domains, companyContactEmails, dealContactEmails };
  } catch {
    return {
      domains: extractDomains([client.company]),
      companyContactEmails: new Set(),
      dealContactEmails: new Set(),
    };
  }
}

// ── Cache in-memory por ciclo de sync ─────────────────────────────────────────

export function createEnrichmentCache() {
  const cache = new Map<string, Promise<EnrichedClientData>>();

  return {
    get(clientId: string, client: EnrichableClient): Promise<EnrichedClientData> {
      let cached = cache.get(clientId);
      if (!cached) {
        cached = enrichClient(client);
        cache.set(clientId, cached);
      }
      return cached;
    },
    clear() {
      cache.clear();
    },
  };
}

// ── TTL cache para check-new (5 minutos) ─────────────────────────────────────

let ttlCache: { data: Map<string, EnrichedClientData>; expiresAt: number } | null = null;

export async function getEnrichmentWithTTL(
  clients: { id: string; name: string; company: string | null; hubspotCompanyId: string | null; hubspotAccount: { id: string } | null }[],
  ttlMs = 5 * 60 * 1000
): Promise<Map<string, EnrichedClientData>> {
  if (ttlCache && Date.now() < ttlCache.expiresAt) return ttlCache.data;

  const result = new Map<string, EnrichedClientData>();
  const BATCH = 5;

  for (let i = 0; i < clients.length; i += BATCH) {
    const batch = clients.slice(i, i + BATCH);
    const enriched = await Promise.all(
      batch.map((c) => enrichClient(c))
    );
    batch.forEach((c, idx) => result.set(c.id, enriched[idx]));
  }

  ttlCache = { data: result, expiresAt: Date.now() + ttlMs };
  return result;
}
