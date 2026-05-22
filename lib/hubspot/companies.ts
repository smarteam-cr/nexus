/**
 * lib/hubspot/companies.ts
 *
 * Lookup de HubSpot Companies por dominio. Usado por la categorización
 * de sesiones para identificar empresas del portal de Smarteam que NO
 * tienen un Client de Nexus asociado.
 *
 * Estrategia:
 *   - Buscar en batch (1 search request con filtro IN [domains])
 *   - HubSpot Companies tiene la property `domain` (string, único por company)
 *   - Si el portal tiene >100 results en un batch, paginar con `after`
 *   - El caller usa esto típicamente UNA vez por render del page de Sesiones
 *
 * Performance: una llamada por render con N dominios únicos.
 *   Si la BD crece y el page se siente lento, mover a tabla cacheada
 *   (HubspotCompany) con sync diario.
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { getSystemHubspotClient } from "./client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/companies/models/Filter";

/** Tag de cache de companies. Llamar `revalidateTag(HUBSPOT_COMPANIES_TAG)`
 *  si hay un webhook de HubSpot que notifique cambios en companies. */
export const HUBSPOT_COMPANIES_TAG = "hubspot-companies";

export interface HubspotCompanyLite {
  id: string;
  name: string;
  domain: string;
}

/**
 * Busca múltiples companies en el portal Smarteam por sus dominios.
 * Devuelve un Map<domain, company> para lookup O(1).
 *
 * Dominios que no existen como company simplemente no aparecen en el map.
 *
 * @param domains Lista de dominios externos a buscar (ej: ["acme.com", "xyz.io"]).
 *                Se normalizan a lowercase y deduplicate antes de la llamada.
 */
export async function searchCompaniesByDomains(
  domains: string[]
): Promise<Map<string, HubspotCompanyLite>> {
  const result = new Map<string, HubspotCompanyLite>();

  // Normalizar y deduplicar dominios
  const uniqueDomains = [
    ...new Set(
      domains
        .map((d) => d?.trim().toLowerCase())
        .filter((d): d is string => !!d && d.includes("."))
    ),
  ];

  if (uniqueDomains.length === 0) return result;

  const client = await getSystemHubspotClient();

  // HubSpot SearchAPI permite hasta 100 valores en un filter IN.
  // Si tenemos más, partimos en chunks.
  const CHUNK_SIZE = 100;

  for (let i = 0; i < uniqueDomains.length; i += CHUNK_SIZE) {
    const chunk = uniqueDomains.slice(i, i + CHUNK_SIZE);

    let after: string | undefined = undefined;
    let pagesFetched = 0;
    const MAX_PAGES = 10; // safety cap

    do {
      try {
        const response = await client.crm.companies.searchApi.doSearch({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "domain",
                  operator: FilterOperatorEnum.In,
                  values: chunk,
                },
              ],
            },
          ],
          properties: ["domain", "name"],
          limit: 100,
          after: after ?? "0",
          sorts: [],
        });

        for (const company of response.results ?? []) {
          const domain = (company.properties?.domain ?? "").toLowerCase();
          const name = company.properties?.name ?? domain;
          if (domain) {
            result.set(domain, {
              id: company.id,
              name,
              domain,
            });
          }
        }

        after = response.paging?.next?.after ?? undefined;
        pagesFetched += 1;
        if (pagesFetched >= MAX_PAGES) break;
      } catch (err) {
        console.error(
          "[hubspot/companies] Error buscando companies por dominio:",
          err instanceof Error ? err.message : err
        );
        break;
      }
    } while (after);
  }

  return result;
}

/**
 * Versión single — busca UNA company por dominio. Wrapper de conveniencia.
 */
export async function searchCompanyByDomain(domain: string): Promise<HubspotCompanyLite | null> {
  const map = await searchCompaniesByDomains([domain]);
  return map.get(domain.toLowerCase()) ?? null;
}

// ─── Versión cacheada (Fase 10 — optimización) ───────────────────────────────
//
// `searchCompaniesByDomains` hace 1 HTTP roundtrip a HubSpot (200-800ms).
// Esto se llamaba en CADA render de /sessions sin cache.
//
// El wrapper cacheado:
//   1. Normaliza + ordena dominios → cache key estable
//   2. Internamente guarda como array (Map no es JSON-serializable)
//   3. Reconstruye Map a la salida → interfaz idéntica para el caller
//
// TTL 30 min: companies en HubSpot cambian poco. Para invalidación instantánea
// agregar un webhook receiver que llame `revalidateTag(HUBSPOT_COMPANIES_TAG)`.

const _fetchCompaniesArrayCached = unstable_cache(
  async (sortedKey: string): Promise<HubspotCompanyLite[]> => {
    if (!sortedKey) return [];
    const domains = sortedKey.split(",");
    const map = await searchCompaniesByDomains(domains);
    return [...map.values()];
  },
  ["hubspot-companies-by-domains"],
  { revalidate: 1800, tags: [HUBSPOT_COMPANIES_TAG] }
);

export async function cachedSearchCompaniesByDomains(
  domains: string[]
): Promise<Map<string, HubspotCompanyLite>> {
  const sortedKey = [
    ...new Set(
      domains
        .map((d) => d?.trim().toLowerCase())
        .filter((d): d is string => !!d && d.includes("."))
    ),
  ]
    .sort()
    .join(",");

  const array = await _fetchCompaniesArrayCached(sortedKey);
  return new Map(array.map((c) => [c.domain, c]));
}

/** Invalidar el cache de HubSpot companies (llamar desde webhook si existe). */
export function revalidateHubspotCompanies() {
  // Next 16: revalidateTag requiere un cache profile como 2do arg.
  revalidateTag(HUBSPOT_COMPANIES_TAG, "default");
}
