import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemAccessToken } from "@/lib/hubspot/client";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

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
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  let accessToken: string;
  try {
    accessToken = await getSystemAccessToken();
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

    const res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/companies/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

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

  for (const company of companies) {
    const props = company.properties;
    const hsCompanyId = company.id;
    const name = props.name?.trim() || props.domain?.trim() || `Empresa ${hsCompanyId}`;
    const domain = props.domain?.trim() || null;
    const industry = props.industry?.trim() || null;

    // Buscar por hubspotCompanyId primero, luego por nombre
    const existing = await prisma.client.findFirst({
      where: {
        OR: [
          { hubspotCompanyId: hsCompanyId },
          ...(domain ? [{ company: { contains: domain, mode: "insensitive" as const } }] : []),
        ],
      },
    });

    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          hubspotCompanyId: hsCompanyId,
          ...(industry ? { industry } : {}),
        },
      });
      updated++;
    } else {
      const newClient = await prisma.client.create({
        data: {
          name,
          company: domain ?? name,
          industry,
          hubspotCompanyId: hsCompanyId,
        },
      });

      // Crear proyecto principal automáticamente
      const newProject = await prisma.project.create({
        data: {
          clientId: newClient.id,
          name: "Proyecto principal",
        },
      });
      await createDefaultCanvases(newProject.id);

      created++;
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
  });
});
