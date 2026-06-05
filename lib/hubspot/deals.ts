import type { Client as HsClient } from "@hubspot/api-client";

export interface AvailableDeal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
}

/**
 * Lee los deals asociados a una company y los formatea: ganados primero (por
 * closedate desc), luego el resto. Mismo criterio que el selector de
 * deal-line-items. Devuelve [] si no hay company o no hay deals.
 */
export async function fetchCompanyDeals(hsClient: HsClient, companyId: string): Promise<AvailableDeal[]> {
  const assocRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/companies/${companyId}/associations/deals?limit=100`,
  });
  if (assocRes.status !== 200) return [];

  const assocData = (await assocRes.json()) as { results?: { id: string }[] };
  const dealIds = (assocData.results ?? []).map((r) => r.id);
  if (dealIds.length === 0) return [];

  const dealsRes = await hsClient.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/deals/batch/read",
    body: {
      inputs: dealIds.slice(0, 100).map((id) => ({ id })),
      properties: ["dealname", "amount", "closedate", "hs_is_closed_won"],
    },
  });
  const dealsData = (await dealsRes.json()) as {
    results?: {
      id: string;
      properties: {
        dealname?: string | null;
        amount?: string | null;
        closedate?: string | null;
        hs_is_closed_won?: string | null;
      };
    }[];
  };
  const all = dealsData.results ?? [];

  const won = all
    .filter((d) => d.properties.hs_is_closed_won === "true")
    .sort((a, b) => {
      const tA = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0;
      const tB = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0;
      return tB - tA;
    });

  return [...won, ...all.filter((d) => d.properties.hs_is_closed_won !== "true")].map((d) => ({
    id: d.id,
    name: d.properties.dealname ?? "Deal sin nombre",
    amount: d.properties.amount ?? null,
    closedate: d.properties.closedate ?? null,
    isWon: d.properties.hs_is_closed_won === "true",
  }));
}
