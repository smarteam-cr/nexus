import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { crearOReusarFicha, fichaConLaEmpresa } from "@/lib/clients/empresa-de-hubspot";
import { esUnicoViolado } from "@/lib/db/unico-violado";
import { datosAlNacerDesdeHubspot, proponerDato } from "@/lib/clients/datos-de-la-empresa-server";

// Propiedad HubSpot que marca a un contacto/empresa como cliente Nexus
const IMPLEMENTOR_PROPERTY = "nexus";

interface HubspotCompanyResult {
  id: string;
  properties: {
    name?: string | null;
    domain?: string | null;
    industry?: string | null;
    nexus?: string | null;
  };
}

// POST /api/system/hubspot/import
// Trae todas las empresas de HubSpot con implementor = true y las crea/actualiza como clientes
export const POST = withAuth(async () => {
  // Importación masiva del portal HubSpot → operación de sistema, solo SUPER_ADMIN.
  const guard = await guardPermission("configuracion", "manage");
  if (guard instanceof NextResponse) return guard;

  let hs: Awaited<ReturnType<typeof getSystemHubspotClient>>;
  try {
    hs = await getSystemHubspotClient();
  } catch {
    return NextResponse.json(
      { error: "No hay cuenta HubSpot del sistema configurada" },
      { status: 400 }
    );
  }

  // Traer empresas con implementor = true (paginado)
  const companies: HubspotCompanyResult[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: IMPLEMENTOR_PROPERTY,
              operator: "EQ",
              value: "true",
            },
          ],
        },
      ],
      properties: ["name", "domain", "industry", IMPLEMENTOR_PROPERTY],
      limit: 100,
      ...(after ? { after } : {}),
    };

    // El transporte del cliente renueva el token ante un 401 y espera ante un 429 (lib/hubspot/client.ts).
    const res = await hs.apiRequest({ method: "POST", path: "/crm/v3/objects/companies/search", body });

    if (!res.ok) {
      const errText = await res.text();
      console.error("HubSpot search error:", errText);
      return NextResponse.json(
        { error: "Error al consultar HubSpot", detail: errText },
        { status: 502 }
      );
    }

    const data = await res.json() as {
      results: HubspotCompanyResult[];
      paging?: { next?: { after?: string } };
    };

    companies.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  // Crear o actualizar clientes en la DB
  let created = 0;
  let updated = 0;
  const saltadas: string[] = [];

  for (const company of companies) {
    const props = company.properties;
    const hsCompanyId = company.id;
    const name = props.name?.trim() || props.domain?.trim() || `Empresa ${hsCompanyId}`;
    const domain = props.domain?.trim() || null;
    const industry = props.industry?.trim() || null;

    /* R7b (2026-10-24): primero la ficha que YA tiene esta empresa; si no hay, una con el dominio que todavía no tenga
       empresa de HubSpot. Antes el `findFirst` con OR podía devolver una ficha del mismo dominio con OTRA empresa y
       pisarle el id, o dejar dos fichas con el mismo. */
    const existing =
      (await fichaConLaEmpresa(hsCompanyId)) ??
      (domain
        ? await prisma.client.findFirst({
            where: { hubspotCompanyId: null, company: { contains: domain, mode: "insensitive" as const } },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, kind: true },
          })
        : null);

    if (existing) {
      // Solo si sigue sin empresa (o con esta): otra ficha pudo tomarla entre la lectura y la escritura.
      const tomada = await prisma.client
        .updateMany({ where: { id: existing.id, OR: [{ hubspotCompanyId: null }, { hubspotCompanyId: hsCompanyId }] }, data: { hubspotCompanyId: hsCompanyId } })
        .catch((e) => {
          if (esUnicoViolado(e)) return { count: 0 };
          throw e;
        });
      if (tomada.count === 0) {
        saltadas.push(`${name} (${hsCompanyId})`);
        continue;
      }
      // La industria de HubSpot entra por la regla de los datos de la empresa (lo que una persona corrigió no se pisa).
      if (industry) {
        await proponerDato({ clientId: existing.id, clave: "industry", valor: industry, fuente: "hubspot" }).catch((e) =>
          console.error(`[hubspot/import] la industria de ${hsCompanyId} no se guardó`, e),
        );
      }
      updated++;
    } else {
      const r = await crearOReusarFicha(hsCompanyId, () =>
        prisma.client.create({
          data: {
            name,
            company: domain ?? name,
            ...datosAlNacerDesdeHubspot({ industry }),
            hubspotCompanyId: hsCompanyId,
          },
          select: { id: true },
        }),
      );

      // NO creamos un stub "Proyecto principal": estos clientes vienen de HubSpot
      // (nexus=true → con hubspotCompanyId), así que sus proyectos REALES los trae el
      // sync al entrar al cliente. El stub quedaba OCULTO (sin hubspotServiceId, filtro
      // del detalle) y además contaminaba el clasificador de sesiones (un candidato
      // fantasma que podía robarse el handoff). El empty-state del workspace ya guía
      // mientras el sync corre.
      if (r.creado) created++;
      else updated++;
    }
  }

  // Invalidar sidebar — pueden haber nuevos clientes o cambios de industry
  if (created > 0 || updated > 0) {
    revalidateClientsSidebar();
    // PERF #1: clientes nuevos/editados pueden mover el match → re-resolver en background.
    void resolveAllSessions().catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    total: companies.length,
    created,
    updated,
    ...(saltadas.length ? { saltadas } : {}),
  });
});
