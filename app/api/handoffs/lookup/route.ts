import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient, forceRefreshSystemToken } from "@/lib/hubspot/client";
import { fetchCompanyDeals } from "@/lib/hubspot/deals";

/**
 * GET /api/handoffs/lookup?domain=<dominio>
 *
 * Para el flujo de creación de handoff "cliente nuevo": busca la company por
 * dominio en el CRM de Smarteam (HubSpot SISTEMA) y devuelve sus deals (ganados
 * primero). También indica si ya existe un Client de Nexus vinculado a esa company
 * (para reusarlo en vez de duplicar). No crea nada — solo lectura.
 */
export async function GET(req: NextRequest) {
  const guard = await guardCapability("createHandoff");
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
    // El token del sistema puede estar vencido aunque expiresAt diga lo contrario (clock
    // skew / rotación entre entornos). Si da 401, refrescamos a la fuerza y reintentamos.
    if (searchRes.status === 401) {
      await forceRefreshSystemToken();
      hs = await getSystemHubspotClient();
      searchRes = await hs.apiRequest(searchBody);
    }
    // Distinguir "no hay company" (200 + 0 resultados) de un fallo de HubSpot (no-ok): el
    // error genérico NO debe mostrarse como "no existe registro".
    if (!searchRes.ok) {
      console.error("[handoffs/lookup] HubSpot search no-ok:", searchRes.status);
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
      prisma.client.findFirst({ where: { hubspotCompanyId: company.id }, select: { id: true, name: true } }),
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
    });
  } catch (e) {
    console.error("[handoffs/lookup] error:", e);
    return NextResponse.json({ error: "No se pudo buscar el handoff." }, { status: 500 });
  }
}
