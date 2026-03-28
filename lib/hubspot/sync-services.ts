import { getSystemHubspotClient } from "./client";
import { prisma } from "@/lib/db/prisma";

// ── Mapeo de servicio_contratado → serviceType + projectType ─────────────────

interface ServiceMapping {
  serviceType: string | null;
  projectType: "USE_CASE" | "BASE_IMPLEMENTATION";
  hubTag: string | null;
}

const SERVICE_MAP: Record<string, ServiceMapping> = {
  "Loop Marketing Transformation": { serviceType: "loop_marketing", projectType: "USE_CASE", hubTag: "Marketing Hub" },
  "Loop Sales Transformation": { serviceType: "loop_sales", projectType: "USE_CASE", hubTag: "Sales Hub" },
  "Loop Service Transformation": { serviceType: "loop_service", projectType: "USE_CASE", hubTag: "Service Hub" },
  "Implementación de Marketing Hub": { serviceType: "loop_marketing", projectType: "BASE_IMPLEMENTATION", hubTag: "Marketing Hub" },
  "Implementación de Sales Hub": { serviceType: "loop_sales", projectType: "BASE_IMPLEMENTATION", hubTag: "Sales Hub" },
  "Implementación de Service Hub": { serviceType: "loop_service", projectType: "BASE_IMPLEMENTATION", hubTag: "Service Hub" },
  "Implementación de Data Hub": { serviceType: null, projectType: "BASE_IMPLEMENTATION", hubTag: null },
  "Signals Based Marketing": { serviceType: "loop_marketing", projectType: "USE_CASE", hubTag: "Marketing Hub" },
};

function inferServiceMapping(servicioContratado: string | null): ServiceMapping {
  if (!servicioContratado) return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };

  // Exact match
  if (SERVICE_MAP[servicioContratado]) return SERVICE_MAP[servicioContratado];

  // Fuzzy match by keyword
  const lower = servicioContratado.toLowerCase();
  if (lower.includes("marketing")) return { serviceType: "loop_marketing", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Marketing Hub" };
  if (lower.includes("sales") || lower.includes("ventas")) return { serviceType: "loop_sales", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Sales Hub" };
  if (lower.includes("service") || lower.includes("servicio")) return { serviceType: "loop_service", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Service Hub" };

  return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };
}

// ── Propiedades a leer del objeto Service ────────────────────────────────────

const SERVICE_PROPERTIES = [
  "hs_name",
  "servicio_nombre",
  "servicio_contratado",
  "estatus_del_servicio",
  "service_status",
  "hs_pipeline",
  "hs_pipeline_stage",
  "account_manager",
  "valor_total_del_servicio",
  "kick_off",
  "nombre_de_la_empresa_asociada",
];

// ── Sync principal ───────────────────────────────────────────────────────────

export interface SyncResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncServicesForClient(clientId: string): Promise<SyncResult> {
  const result: SyncResult = { found: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  // 1. Obtener client con su hubspotCompanyId
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, hubspotCompanyId: true, name: true },
  });

  if (!client?.hubspotCompanyId) {
    result.errors.push("Cliente no tiene hubspotCompanyId");
    return result;
  }

  // 2. Obtener HubSpot client del sistema
  let hsClient;
  try {
    hsClient = await getSystemHubspotClient();
  } catch (e) {
    result.errors.push(`Error al obtener HubSpot client: ${(e as Error).message}`);
    return result;
  }

  // 3. Buscar servicios asociados a la empresa
  //    HubSpot Services object puede tener diferentes slugs en la API
  //    Probamos "services" y "0-70" (objectTypeId predeterminado de Services)
  let serviceIds: string[] = [];
  const ASSOCIATION_SLUGS = ["services", "0-70"];

  for (const slug of ASSOCIATION_SLUGS) {
    try {
      const assocResponse = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${client.hubspotCompanyId}/associations/${slug}`,
      });
      const assocData = (await assocResponse.json()) as {
        results?: Array<{ toObjectId: number }>;
      };
      const ids = (assocData.results ?? []).map((r) => String(r.toObjectId));
      if (ids.length > 0) {
        serviceIds = ids;
        break;
      }
    } catch {
      // Try next slug
      continue;
    }
  }

  if (serviceIds.length === 0) {
    // Debug: list CRM object schemas to find the correct service object name
    const debugInfo: string[] = [];
    try {
      const schemasRes = await hsClient.apiRequest({
        method: "GET",
        path: "/crm/v3/schemas",
      });
      const schemas = (await schemasRes.json()) as { results?: Array<{ name: string; objectTypeId: string; labels: { singular: string } }> };
      const names = (schemas.results ?? []).map((s) => `${s.name}(${s.objectTypeId}:${s.labels?.singular})`);
      debugInfo.push(`Custom schemas: ${names.join(", ") || "none"}`);
    } catch (e) {
      debugInfo.push(`Schema error: ${(e as Error).message}`);
    }

    // Try searching for services with different object names
    for (const objName of ["services", "0-70", "service"]) {
      try {
        const searchRes = await hsClient.apiRequest({
          method: "POST",
          path: `/crm/v3/objects/${objName}/search`,
          body: { filterGroups: [], properties: ["hs_name", "servicio_nombre", "nombre_de_la_empresa_asociada"], limit: 3 },
        });
        const searchData = (await searchRes.json()) as { total?: number; results?: Array<{ id: string; properties: Record<string, string> }> };
        if (searchData.total && searchData.total > 0) {
          debugInfo.push(`FOUND via "${objName}": total=${searchData.total}, samples=${JSON.stringify(searchData.results?.slice(0, 3).map(r => ({ id: r.id, name: r.properties.hs_name || r.properties.servicio_nombre })))}`);
        } else {
          debugInfo.push(`"${objName}": total=${searchData.total ?? 'undefined'}`);
        }
      } catch (e) {
        debugInfo.push(`"${objName}" search failed: ${(e as Error).message?.substring(0, 100)}`);
      }
    }

    // Try listing all object types via CRM Object Schemas
    try {
      const objTypesRes = await hsClient.apiRequest({
        method: "GET",
        path: "/crm-object-schemas/v3/schemas",
      });
      const objTypes = (await objTypesRes.json()) as { results?: Array<{ name: string; objectTypeId: string }> };
      debugInfo.push(`All schemas: ${(objTypes.results ?? []).map(o => `${o.name}(${o.objectTypeId})`).join(", ") || "empty"}`);
    } catch (e) {
      debugInfo.push(`Schemas v2 error: ${(e as Error).message?.substring(0, 100)}`);
    }

    result.errors.push(...debugInfo);
    return result;
  }

  // 4. Batch read de propiedades de cada servicio
  //    Intenta con "services" y "0-70" como objectType
  let services: Array<{ id: string; properties: Record<string, string | null> }> = [];
  const READ_SLUGS = ["services", "0-70"];

  for (const slug of READ_SLUGS) {
    try {
      const batchResponse = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${slug}/batch/read`,
        body: {
          inputs: serviceIds.map((id) => ({ id })),
          properties: SERVICE_PROPERTIES,
        },
      });
      const batchData = (await batchResponse.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
      };
      const found = batchData.results ?? [];
      if (found.length > 0) {
        services = found;
        break;
      }
    } catch {
      continue;
    }
  }

  if (services.length === 0 && serviceIds.length > 0) {
    result.errors.push(`Found ${serviceIds.length} service IDs but could not read their properties`);
    return result;
  }

  result.found = services.length;

  // 5. Sincronizar cada servicio
  for (const service of services) {
    const props = service.properties;
    const svcName = props.servicio_nombre || props.hs_name || "Servicio sin nombre";
    const servicioContratado = props.servicio_contratado;
    const rawStatus = props.estatus_del_servicio;
    const status = rawStatus?.toLowerCase()?.trim();

    // Solo sync servicios activos — si no tiene status, asumimos activo
    // El valor puede ser "🟢 Activo (Activo)" u otros formatos con emojis
    if (status && !status.includes("activo")) {
      result.skipped++;
      continue;
    }
    const mapping = inferServiceMapping(servicioContratado);

    // Verificar si ya existe
    const existing = await prisma.project.findUnique({
      where: { hubspotServiceId: service.id },
    });

    if (existing) {
      // Update
      await prisma.project.update({
        where: { id: existing.id },
        data: {
          name: svcName,
          serviceType: mapping.serviceType,
          projectType: mapping.projectType,
          tags: mapping.hubTag ? [mapping.hubTag] : [],
        },
      });
      result.updated++;
    } else {
      // Create
      await prisma.project.create({
        data: {
          clientId,
          name: svcName,
          hubspotServiceId: service.id,
          serviceType: mapping.serviceType,
          projectType: mapping.projectType,
          tags: mapping.hubTag ? [mapping.hubTag] : [],
          status: "active",
        },
      });
      result.created++;
    }
  }

  return result;
}
