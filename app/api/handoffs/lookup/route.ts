import { NextRequest, NextResponse } from "next/server";
import { guardLecturaParaArrancar } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient, forceRefreshSystemToken } from "@/lib/hubspot/client";
import { elegirCandidato } from "@/lib/hubspot/cliente-de-la-empresa";
import { fetchCompanyDeals } from "@/lib/hubspot/deals";

/**
 * GET /api/handoffs/lookup?domain=<dominio>
 *
 * Para arrancar algo con un cliente nuevo —un handoff o un proyecto—: busca la company por
 * dominio en el CRM de Smarteam (HubSpot SISTEMA) y devuelve sus deals (ganados
 * primero). También indica si ya existe un Client de Nexus vinculado a esa company
 * (para reusarlo en vez de duplicar). No crea nada — solo lectura.
 */
export async function GET(req: NextRequest) {
  const guard = await guardLecturaParaArrancar();
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
    });
  } catch (e) {
    console.error("[handoffs/lookup] error:", e);
    return NextResponse.json({ error: "No se pudo buscar el handoff." }, { status: 500 });
  }
}
