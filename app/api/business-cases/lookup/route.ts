/**
 * GET /api/business-cases/lookup?domain=<dominio>
 *
 * Busca una empresa por dominio en el CRM del SISTEMA (HubSpot Smarteam) y
 * devuelve sus deals (todos — el deal es opcional para el business case) + si ya
 * existe un Client de Nexus vinculado. No crea nada. Espejo del lookup del
 * handoff, pero gateado por guardSalesAccess (VENTAS/CSL/SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient, forceRefreshSystemToken } from "@/lib/hubspot/client";
import { fetchCompanyDeals } from "@/lib/hubspot/deals";

export async function GET(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase() ?? "";
  if (domain.length < 3) {
    return NextResponse.json({ error: "Dominio requerido (mín. 3 caracteres)" }, { status: 400 });
  }

  const searchBody = {
    method: "POST" as const,
    path: "/crm/v3/objects/companies/search",
    body: {
      filterGroups: [
        { filters: [{ propertyName: "domain", operator: "CONTAINS_TOKEN", value: domain }] },
        { filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: domain }] },
      ],
      properties: ["name", "domain"],
      limit: 5,
    },
  };

  try {
    let hs = await getSystemHubspotClient();
    let searchRes = await hs.apiRequest(searchBody);
    if (searchRes.status === 401) {
      await forceRefreshSystemToken();
      hs = await getSystemHubspotClient();
      searchRes = await hs.apiRequest(searchBody);
    }
    if (!searchRes.ok) {
      console.error("[business-cases/lookup] HubSpot search no-ok:", searchRes.status);
      return NextResponse.json(
        { error: "No se pudo consultar HubSpot. Revisá la conexión del sistema." },
        { status: 502 },
      );
    }
    const data = (await searchRes.json()) as {
      results?: { id: string; properties: { name?: string | null; domain?: string | null } }[];
    };
    const companies = data.results ?? [];
    if (companies.length === 0) {
      return NextResponse.json({ company: null, deals: [], existingClientId: null, existingClientName: null });
    }

    const company = companies[0];
    const [deals, existing] = await Promise.all([
      fetchCompanyDeals(hs, company.id),
      prisma.client.findFirst({
        where: { hubspotCompanyId: company.id },
        select: { id: true, name: true, isProspect: true },
      }),
    ]);

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.properties.name ?? "(sin nombre)",
        domain: company.properties.domain ?? null,
      },
      deals,
      existingClientId: existing?.id ?? null,
      existingClientName: existing?.name ?? null,
      existingIsProspect: existing?.isProspect ?? null,
    });
  } catch (e) {
    console.error("[business-cases/lookup] error:", e);
    return NextResponse.json({ error: "No se pudo buscar la empresa." }, { status: 500 });
  }
}
