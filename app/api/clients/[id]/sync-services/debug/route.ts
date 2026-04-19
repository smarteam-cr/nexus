import { NextRequest, NextResponse } from "next/server";
import { getSystemHubspotClient, getHubspotClient } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/clients/[id]/sync-services/debug
 * Endpoint temporal de diagnóstico — muestra exactamente qué devuelve HubSpot
 * para los proyectos asociados a la empresa del cliente.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const log: string[] = [];

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, hubspotCompanyId: true, name: true },
  });

  if (!client?.hubspotCompanyId) {
    return NextResponse.json({ error: "Sin hubspotCompanyId", client });
  }
  log.push(`Cliente: ${client.name} | companyId: ${client.hubspotCompanyId}`);

  // Usar cuenta del cliente si tiene una, sino la del sistema (Smarteam)
  const hubspotAccount = await prisma.hubspotAccount.findFirst({
    where: { clientId: client.id },
    select: { id: true },
  });

  let hsClient;
  try {
    hsClient = hubspotAccount
      ? await getHubspotClient(hubspotAccount.id)
      : await getSystemHubspotClient();
    log.push(`✓ HubSpot client obtenido (${hubspotAccount ? "cuenta del cliente" : "sistema"})`);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, log });
  }

  const companyId = client.hubspotCompanyId;

  // 1. Probar slugs de asociación estándar
  const slugsToTry = ["projects", "0-18", "0-49", "PROJECT", "project"];
  const assocResults: Record<string, unknown> = {};

  for (const slug of slugsToTry) {
    try {
      const res = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      const data = await res.json();
      assocResults[slug] = data;
      const count = (data as { results?: unknown[] }).results?.length ?? 0;
      log.push(`Slug "${slug}": ${count} asociaciones`);
    } catch (e) {
      assocResults[slug] = { error: (e as Error).message?.slice(0, 200) };
      log.push(`Slug "${slug}": ERROR - ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  // 2. Listar TODOS los tipos de asociación disponibles para companies
  let allAssocTypes: unknown = null;
  try {
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v4/associations/companies/definitions`,
    });
    allAssocTypes = await res.json();
    log.push(`✓ Tipos de asociación de companies obtenidos`);
  } catch (e) {
    log.push(`Error obteniendo tipos de asociación: ${(e as Error).message?.slice(0, 100)}`);
  }

  // 3. Schemas custom del portal
  let schemas: unknown = null;
  try {
    const res = await hsClient.apiRequest({
      method: "GET",
      path: "/crm/v3/schemas",
    });
    schemas = await res.json();
    const results = (schemas as { results?: Array<{ name: string; objectTypeId: string }> }).results ?? [];
    log.push(`Custom schemas: ${results.map((s) => `${s.name}(${s.objectTypeId})`).join(", ") || "ninguno"}`);
  } catch (e) {
    log.push(`Error schemas: ${(e as Error).message?.slice(0, 100)}`);
  }

  // 4. Intentar leer directamente con GET de proyectos (si algún slug funcionó)
  let projectsRead: unknown = null;
  const workingSlug = Object.entries(assocResults).find(([, v]) => {
    const r = (v as { results?: unknown[] }).results;
    return Array.isArray(r) && r.length > 0;
  });
  if (workingSlug) {
    const [slug, data] = workingSlug;
    const ids = ((data as { results?: Array<{ toObjectId: number }> }).results ?? [])
      .map((r) => String(r.toObjectId));
    log.push(`Intentando leer propiedades con slug "${slug}", ids: ${ids.join(", ")}`);
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${slug}/batch/read`,
        body: {
          inputs: ids.map((i) => ({ id: i })),
          properties: ["hs_name", "hs_status", "nombre_del_proyecto", "estatus_del_proyecto"],
        },
      });
      projectsRead = await res.json();
      log.push(`✓ Propiedades leídas`);
    } catch (e) {
      log.push(`Error leyendo propiedades: ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  return NextResponse.json({
    log,
    assocResults,
    allAssocTypes,
    schemas,
    projectsRead,
  });
}
