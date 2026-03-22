import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";
import type { Client as HsClient } from "@hubspot/api-client";

interface LineItem {
  id: string;
  name: string;
  quantity: string | null;
  price: string | null;
  amount: string | null;
  hs_sku: string | null;
  description: string | null;
}

interface DealInfo {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
}

type ServiceType = "loop_marketing" | "loop_sales" | "loop_service" | "proyecto_temporal";

/** Detecta el tipo de servicio vendido según los nombres de los line items */
function detectServiceType(lineItems: LineItem[]): ServiceType | null {
  if (lineItems.length === 0) return null;
  const combined = lineItems.map((li) => li.name.toLowerCase()).join(" ");
  if (combined.includes("marketing")) return "loop_marketing";
  if (combined.includes("sales") || combined.includes("ventas") || combined.includes("venta")) return "loop_sales";
  if (combined.includes("service") || combined.includes("servicio")) return "loop_service";
  return "proyecto_temporal";
}

/** Fuerza refresh del token invalidando expiresAt en DB, luego retorna cliente fresco */
async function getHsClientForced(accountId?: string): Promise<HsClient> {
  await prisma.hubspotAccount.updateMany({
    where: accountId ? { id: accountId } : { isSystem: true },
    data: { expiresAt: new Date(0) },
  });
  return accountId ? getHubspotClient(accountId) : getSystemHubspotClient();
}

/** Obtiene propiedades y line items de un deal específico */
async function fetchDealData(hsClient: HsClient, dealId: string): Promise<{
  deal: DealInfo | null;
  lineItems: LineItem[];
}> {
  type LineItemResult = {
    id: string;
    properties: {
      name?: string | null;
      quantity?: string | null;
      price?: string | null;
      amount?: string | null;
      hs_sku?: string | null;
      description?: string | null;
    };
  };

  const LI_PROPS = ["name", "quantity", "price", "amount", "hs_sku", "description"];

  // Propiedades del deal
  const dealRes = await hsClient.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/deals/${dealId}?properties=dealname,amount,closedate`,
  });
  if (!dealRes.ok) return { deal: null, lineItems: [] };

  const dealData = (await dealRes.json()) as {
    id: string;
    properties: { dealname?: string | null; amount?: string | null; closedate?: string | null };
  };

  const deal: DealInfo = {
    id: dealData.id,
    name: dealData.properties.dealname ?? "Deal sin nombre",
    amount: dealData.properties.amount ?? null,
    closedate: dealData.properties.closedate ?? null,
  };

  // Line items (dos estrategias en paralelo)
  const [searchData, assocLiData] = await Promise.all([
    hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/line_items/search",
      body: {
        filterGroups: [{ filters: [{ propertyName: "hs_deal_id", operator: "EQ", value: dealId }] }],
        properties: LI_PROPS,
        limit: 100,
      },
    }).then((r) => r.json() as Promise<{ results?: LineItemResult[] }>).catch(() => ({ results: [] as LineItemResult[] })),

    hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/deals/${dealId}/associations/line_items?limit=100`,
    }).then(async (r) => {
      const d = (await r.json()) as { results?: { id: string }[] };
      const ids = (d.results ?? []).map((x) => x.id).filter(Boolean);
      if (ids.length === 0) return { results: [] as LineItemResult[] };
      const batchRes = await hsClient.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/line_items/batch/read",
        body: { inputs: ids.slice(0, 100).map((id) => ({ id })), properties: LI_PROPS },
      });
      return batchRes.json() as Promise<{ results?: LineItemResult[] }>;
    }).catch(() => ({ results: [] as LineItemResult[] })),
  ]);

  const rawItems = (searchData.results?.length ?? 0) >= (assocLiData.results?.length ?? 0)
    ? (searchData.results ?? [])
    : (assocLiData.results ?? []);

  const lineItems: LineItem[] = rawItems.map((li) => ({
    id: li.id,
    name: li.properties.name ?? "Producto sin nombre",
    quantity: li.properties.quantity ?? null,
    price: li.properties.price ?? null,
    amount: li.properties.amount ?? null,
    hs_sku: li.properties.hs_sku ?? null,
    description: li.properties.description ?? null,
  }));

  return { deal, lineItems };
}

export const GET = withAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("projectId");

  const [client, project] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      include: { hubspotAccount: { select: { id: true } } },
    }),
    projectId ? prisma.project.findUnique({ where: { id: projectId }, select: { id: true, hubspotDealId: true } }) : null,
  ]);

  if (!client?.hubspotCompanyId) {
    return NextResponse.json({ deal: null, lineItems: [], availableDeals: [] });
  }

  const accountId = client.hubspotAccount?.id;

  try {
    let hsClient = accountId
      ? await getHubspotClient(accountId)
      : await getSystemHubspotClient();

    // ── Si el proyecto ya tiene un deal vinculado, ir directo ─────────────────
    console.log("[deal-line-items] project.hubspotDealId:", project?.hubspotDealId);
    if (project?.hubspotDealId) {
      let { deal, lineItems } = await fetchDealData(hsClient, project.hubspotDealId);
      console.log("[deal-line-items] fetchDealData result - deal:", deal?.id, "lineItems:", lineItems.length);
      // Retry en 401 (token expirado)
      if (!deal) {
        hsClient = await getHsClientForced(accountId);
        ({ deal, lineItems } = await fetchDealData(hsClient, project.hubspotDealId));
      }
      const serviceType = detectServiceType(lineItems);
      return NextResponse.json({ deal, lineItems, serviceType, dealId: project.hubspotDealId });
    }

    // ── Lookup de todos los deals de la empresa ───────────────────────────────
    console.log("[deal-line-items] Buscando deals para companyId:", client.hubspotCompanyId);
    let assocRes = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${client.hubspotCompanyId}/associations/deals?limit=100`,
    });
    console.log("[deal-line-items] assocRes.status:", assocRes.status);

    // Retry en 401
    if (assocRes.status === 401) {
      console.log("[deal-line-items] 401 → forzando refresh de token y reintentando");
      hsClient = await getHsClientForced(accountId);
      assocRes = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${client.hubspotCompanyId}/associations/deals?limit=100`,
      });
      console.log("[deal-line-items] assocRes.status tras retry:", assocRes.status);
    }

    const assocData = (await assocRes.json()) as { results?: { id: string }[] };
    const dealIds = (assocData.results ?? []).map((r) => r.id);
    console.log("[deal-line-items] dealIds encontrados:", dealIds.length, dealIds.slice(0, 3));

    if (dealIds.length === 0) {
      console.log("[deal-line-items] Sin deals asociados → retornando vacío");
      return NextResponse.json({ deal: null, lineItems: [], availableDeals: [] });
    }

    // ── Leer propiedades de todos los deals ───────────────────────────────────
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

    const allDeals = dealsData.results ?? [];

    // Deals ganados ordenados por fecha de cierre (más reciente primero)
    const wonDeals = allDeals
      .filter((d) => d.properties.hs_is_closed_won === "true")
      .sort((a, b) => {
        const tA = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0;
        const tB = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0;
        return tB - tA;
      });

    // Lista de todos los deals para el selector (ganados primero, luego el resto)
    const availableDeals = [
      ...wonDeals,
      ...allDeals.filter((d) => d.properties.hs_is_closed_won !== "true"),
    ].map((d) => ({
      id: d.id,
      name: d.properties.dealname ?? "Deal sin nombre",
      amount: d.properties.amount ?? null,
      closedate: d.properties.closedate ?? null,
      isWon: d.properties.hs_is_closed_won === "true",
    }));

    if (wonDeals.length === 0) {
      return NextResponse.json({ deal: null, lineItems: [], availableDeals });
    }

    const latestDeal = wonDeals[0];

    // ── Fetch line items del deal auto-seleccionado ───────────────────────────
    const { deal, lineItems } = await fetchDealData(hsClient, latestDeal.id);
    const serviceType = detectServiceType(lineItems);

    // Auto-guardar el deal en el proyecto si se pasó projectId
    if (project && deal) {
      await prisma.project.update({
        where: { id: project.id },
        data: { hubspotDealId: deal.id },
      }).catch(() => {}); // no bloquear si falla
    }

    return NextResponse.json({ deal, lineItems, serviceType, dealId: latestDeal.id, availableDeals });
  } catch (err) {
    console.error("[deal-line-items] Error:", err);
    return NextResponse.json({ deal: null, lineItems: [], availableDeals: [], error: "fetch_failed" });
  }
});
