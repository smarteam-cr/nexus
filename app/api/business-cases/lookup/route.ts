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
import { elegirCandidato } from "@/lib/hubspot/cliente-de-la-empresa";
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
    const [deals, candidatos] = await Promise.all([
      fetchCompanyDeals(hs, company.id),
      /* ⚠ `findMany` + desempate, no `findFirst`. La columna no es única y hay un caso vivo con
         DOS clientes sobre la misma empresa: «Areyas» [PROSPECTO] y «Areyá» [CLIENTE]. Un
         `findFirst` sin orden devolvía cualquiera de los dos, y si devolvía el prospecto el
         formulario mandaba ESE cliente y el proyecto nacía fuera de cobranza, de la cartera y del
         vigilante, sin ningún error.

         Con ambigüedad real (dos CLIENTE) se devuelve `null` A PROPÓSITO: así el formulario manda
         la empresa en vez del cliente, el alta entra por la rama que sí sabe explicarlo y la
         persona ve por qué, en vez de que Nexus elija a ciegas.

         Lo que este buscador sigue SIN hacer es preguntarle a HubSpot por fusiones ni reapuntar
         nada — eso vive solo en las altas. Ver lib/hubspot/cliente-de-la-empresa.ts. */
      prisma.client.findMany({
        where: { hubspotCompanyId: company.id },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const eleccion = elegirCandidato(candidatos);
    const existing = eleccion.estado === "uno" ? eleccion.cliente : null;

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.properties.name ?? "(sin nombre)",
        domain: company.properties.domain ?? null,
      },
      deals,
      existingClientId: existing?.id ?? null,
      existingClientName: existing?.name ?? null,
      existingIsProspect: existing ? existing.kind === "PROSPECTO" : null,
    });
  } catch (e) {
    console.error("[business-cases/lookup] error:", e);
    return NextResponse.json({ error: "No se pudo buscar la empresa." }, { status: 500 });
  }
}
