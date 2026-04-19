import { getHubspotClient, getSystemHubspotClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import type { Client } from "@hubspot/api-client";

// ── Mapeo de nombre del proyecto → serviceType + projectType ─────────────────

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

function inferServiceMapping(projectName: string | null): ServiceMapping {
  if (!projectName) return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };

  if (SERVICE_MAP[projectName]) return SERVICE_MAP[projectName];

  const lower = projectName.toLowerCase();
  if (lower.includes("marketing")) return { serviceType: "loop_marketing", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Marketing Hub" };
  if (lower.includes("sales") || lower.includes("ventas")) return { serviceType: "loop_sales", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Sales Hub" };
  if (lower.includes("service") || lower.includes("servicio")) return { serviceType: "loop_service", projectType: lower.includes("implementa") ? "BASE_IMPLEMENTATION" : "USE_CASE", hubTag: "Service Hub" };

  return { serviceType: "proyecto_temporal", projectType: "USE_CASE", hubTag: null };
}

// ── Propiedades a leer del objeto Proyectos de HubSpot ──────────────────────
const PROJECT_PROPERTIES = [
  "hs_name",
  "hs_status",
  "hs_object_id",
  "nombre_del_proyecto",
  "servicio_contratado",
  "estatus_del_proyecto",
  "tipo_de_servicio",
  "account_manager",
];

// ── Slugs del objeto Proyectos a probar en orden ─────────────────────────────
// "projects" y "PROJECT" funcionan en HubSpot estándar; "0-18" y "0-49" son fallbacks
const ASSOCIATION_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];
const READ_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

// ── Sync principal ───────────────────────────────────────────────────────────

export interface SyncResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  debug?: string[];
}

export async function syncServicesForClient(clientId: string): Promise<SyncResult> {
  const result: SyncResult = { found: 0, created: 0, updated: 0, skipped: 0, errors: [], debug: [] };

  // 1. Obtener client + HubspotAccount (query directa para evitar quirks del relation lookup)
  const [client, hubspotAccount] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, company: true, hubspotCompanyId: true },
    }),
    prisma.hubspotAccount.findFirst({
      where: { clientId },
      select: { id: true, hubName: true },
    }),
  ]);

  if (!client) {
    result.errors.push("Cliente no encontrado");
    return result;
  }

  // 2. Obtener HubSpot client:
  //    Caso A: cliente tiene su propio portal HubSpot → usar su cuenta
  //    Caso B: cliente está en el portal del sistema (Dinterweb) → usar cuenta del sistema
  let hsClient: Client;
  const usingSystemAccount = !hubspotAccount;

  if (hubspotAccount) {
    try {
      hsClient = await getHubspotClient(hubspotAccount.id);
      result.debug!.push(`✓ Usando cuenta HubSpot del cliente: ${hubspotAccount.hubName ?? hubspotAccount.id}`);
    } catch (e) {
      result.errors.push(`Error al obtener HubSpot client del cliente: ${(e as Error).message}`);
      return result;
    }
  } else if (client.hubspotCompanyId) {
    // Caso B: usar sistema
    try {
      hsClient = await getSystemHubspotClient();
      result.debug!.push("✓ Usando cuenta HubSpot del sistema (Dinterweb)");
    } catch (e) {
      result.errors.push(`Error al obtener HubSpot client del sistema: ${(e as Error).message}`);
      return result;
    }
  } else {
    result.errors.push("Cliente no tiene cuenta HubSpot ni hubspotCompanyId configurado");
    return result;
  }

  // 3. Resolver hubspotCompanyId — si no está guardado, buscarlo por nombre
  let companyId = client.hubspotCompanyId;

  if (!companyId) {
    result.debug!.push("hubspotCompanyId no guardado — buscando empresa en HubSpot por nombre...");
    companyId = await findCompanyId(hsClient, {
      clientName: client.name,
      companyName: client.company,
      hubName: !usingSystemAccount ? hubspotAccount?.hubName ?? null : null,
    });

    if (companyId) {
      result.debug!.push(`✓ Empresa encontrada: ${companyId} — guardando en DB`);
      await prisma.client.update({
        where: { id: clientId },
        data: { hubspotCompanyId: companyId },
      }).catch(() => {});
    } else {
      result.errors.push(
        `No se encontró la empresa en HubSpot. ` +
        `Busca: nombre="${client.name}", company="${client.company ?? ""}". ` +
        `Asegúrate de que la empresa existe en el portal de HubSpot.`
      );
      return result;
    }
  } else {
    result.debug!.push(`✓ hubspotCompanyId: ${companyId}`);
  }

  // 4. Buscar proyectos HubSpot asociados a la empresa
  let projectIds: string[] = [];
  let workingAssocSlug: string | null = null;

  for (const slug of ASSOCIATION_SLUGS) {
    try {
      const assocResponse = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      const assocData = (await assocResponse.json()) as {
        results?: Array<{ toObjectId: number }>;
      };
      const ids = (assocData.results ?? []).map((r) => String(r.toObjectId));
      if (ids.length > 0) {
        projectIds = ids;
        workingAssocSlug = slug;
        result.debug!.push(`✓ ${ids.length} proyectos encontrados via slug "${slug}"`);
        break;
      } else {
        result.debug!.push(`Slug "${slug}": 0 asociaciones`);
      }
    } catch (e) {
      result.debug!.push(`Slug "${slug}": error - ${(e as Error).message?.slice(0, 80)}`);
      continue;
    }
  }

  // 4b. Si los slugs estándar fallan, intentar descubrimiento por schemas
  if (projectIds.length === 0) {
    try {
      const schemasRes = await hsClient.apiRequest({
        method: "GET",
        path: "/crm/v3/schemas",
      });
      const schemas = (await schemasRes.json()) as {
        results?: Array<{ name: string; objectTypeId: string; labels: { singular: string; plural: string } }>;
      };
      const customSchemas = schemas.results ?? [];
      result.debug!.push(
        `Custom schemas: ${customSchemas.map((s) => `${s.name}(${s.objectTypeId})`).join(", ") || "ninguno"}`
      );

      const projectSchema = customSchemas.find((s) => {
        const n = (s.name + " " + s.labels?.singular + " " + s.labels?.plural).toLowerCase();
        return n.includes("project") || n.includes("proyecto");
      });

      if (projectSchema) {
        result.debug!.push(`Schema candidato: ${projectSchema.name} (${projectSchema.objectTypeId})`);
        try {
          const assocRes = await hsClient.apiRequest({
            method: "GET",
            path: `/crm/v4/objects/companies/${companyId}/associations/${projectSchema.objectTypeId}`,
          });
          const assocData = (await assocRes.json()) as { results?: Array<{ toObjectId: number }> };
          const ids = (assocData.results ?? []).map((r) => String(r.toObjectId));
          if (ids.length > 0) {
            projectIds = ids;
            workingAssocSlug = projectSchema.objectTypeId;
            result.debug!.push(`✓ ${ids.length} proyectos via schema ${projectSchema.name}`);
          }
        } catch (e) {
          result.debug!.push(`Error asociación schema: ${(e as Error).message?.slice(0, 100)}`);
        }
      }
    } catch (e) {
      result.debug!.push(`Error obteniendo schemas: ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  if (projectIds.length === 0) {
    result.errors.push(
      `No se encontraron proyectos HubSpot asociados a la empresa ${companyId}. ` +
      `Slugs intentados: ${ASSOCIATION_SLUGS.join(", ")}. ` +
      `Verifica que los Proyectos estén asociados a la empresa en HubSpot.`
    );
    return result;
  }

  // 5. Leer propiedades de cada proyecto
  //    Estrategia: primero intenta batch POST; si falla por MISSING_SCOPES,
  //    intenta GET individual (diferente scope requirement).
  let projects: Array<{ id: string; properties: Record<string, string | null> }> = [];
  const readSlugs = workingAssocSlug ? [workingAssocSlug, ...READ_SLUGS] : READ_SLUGS;
  const uniqueReadSlugs = [...new Set(readSlugs)];
  const propsParam = PROJECT_PROPERTIES.join(",");

  // 5a. Intentar batch POST
  for (const slug of uniqueReadSlugs) {
    try {
      const batchResponse = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${slug}/batch/read`,
        body: {
          inputs: projectIds.map((id) => ({ id })),
          properties: PROJECT_PROPERTIES,
        },
      });
      const batchData = (await batchResponse.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
        status?: string;
        category?: string;
      };
      // Ignorar respuestas de error de scope
      if (batchData.category === "MISSING_SCOPES" || batchData.status === "error") {
        result.debug!.push(`Batch read "${slug}": MISSING_SCOPES — intentando GET individual`);
        break;
      }
      const found = batchData.results ?? [];
      if (found.length > 0) {
        projects = found;
        result.debug!.push(`✓ Propiedades leídas via batch "${slug}"`);
        break;
      }
    } catch {
      continue;
    }
  }

  // 5b. Si el batch falló, intentar GET individual por proyecto
  if (projects.length === 0 && projectIds.length > 0) {
    result.debug!.push("Intentando GET individual por proyecto...");
    const readSlug = workingAssocSlug ?? "projects";
    const fetched = await Promise.all(
      projectIds.map(async (id) => {
        try {
          const res = await hsClient.apiRequest({
            method: "GET",
            path: `/crm/v3/objects/${readSlug}/${id}?properties=${propsParam}`,
          });
          const data = (await res.json()) as {
            id?: string;
            properties?: Record<string, string | null>;
            status?: string;
            category?: string;
          };
          if (data.id && data.properties) return { id: data.id, properties: data.properties };
        } catch { /* ignorar */ }
        return null;
      })
    );
    const valid = fetched.filter((p): p is { id: string; properties: Record<string, string | null> } => p !== null);
    if (valid.length > 0) {
      projects = valid;
      result.debug!.push(`✓ ${valid.length} proyectos leídos via GET individual`);
    }
  }

  // 5c. Intentar search con filtro por IDs (scope diferente al batch)
  if (projects.length === 0 && projectIds.length > 0) {
    result.debug!.push("Intentando search por IDs...");
    const readSlug = workingAssocSlug ?? "projects";
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: `/crm/v3/objects/${readSlug}/search`,
        body: {
          filterGroups: [{
            filters: projectIds.map((id) => ({
              propertyName: "hs_object_id",
              operator: "EQ",
              value: id,
            })),
          }],
          properties: PROJECT_PROPERTIES,
          limit: 100,
        },
      });
      const data = (await res.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
        status?: string;
        category?: string;
      };
      if (data.results && data.results.length > 0) {
        projects = data.results;
        result.debug!.push(`✓ ${projects.length} proyectos leídos via search`);
      } else if (data.category === "MISSING_SCOPES") {
        result.debug!.push("Search también requiere scope adicional");
      }
    } catch { /* ignorar */ }
  }

  if (projects.length === 0 && projectIds.length > 0) {
    // Último recurso: crear proyectos con solo el ID
    // Al menos aparecen las tabs; el nombre se puede editar después
    result.debug!.push("⚠ No se pudieron leer propiedades — creando proyectos con ID como nombre temporal");
    projects = projectIds.map((id) => ({ id, properties: {} }));
  }

  result.found = projects.length;

  // 6. Sincronizar cada proyecto HubSpot → DB
  for (const project of projects) {
    const props = project.properties;

    const projectName =
      props.nombre_del_proyecto ||
      props.hs_name ||
      `Proyecto ${project.id}`;

    // Saltear proyectos terminados/cancelados
    const rawStatus = (props.hs_status || props.estatus_del_proyecto || "").toLowerCase().trim();
    if (rawStatus && (rawStatus === "completed" || rawStatus === "cancelled" ||
        rawStatus.includes("completado") || rawStatus.includes("cancelado") ||
        rawStatus.includes("cerrado"))) {
      result.skipped++;
      continue;
    }

    const servicioContratado = props.servicio_contratado || props.tipo_de_servicio || projectName;
    const mapping = inferServiceMapping(servicioContratado);

    // Buscar existente por hubspotServiceId o por nombre (evitar duplicados)
    const existing =
      (await prisma.project.findUnique({ where: { hubspotServiceId: project.id } })) ??
      (await prisma.project.findFirst({
        where: { clientId, name: projectName, hubspotServiceId: null },
      }));

    if (existing) {
      await prisma.project.update({
        where: { id: existing.id },
        data: {
          name: projectName,
          hubspotServiceId: project.id,
          serviceType: mapping.serviceType,
          projectType: mapping.projectType,
          tags: mapping.hubTag ? [mapping.hubTag] : [],
        },
      });
      result.updated++;
    } else {
      const newProject = await prisma.project.create({
        data: {
          clientId,
          name: projectName,
          hubspotServiceId: project.id,
          serviceType: mapping.serviceType,
          projectType: mapping.projectType,
          tags: mapping.hubTag ? [mapping.hubTag] : [],
          status: "active",
        },
      });
      await createDefaultCanvases(newProject.id);
      result.created++;
    }
  }

  result.debug!.push(`Sync completo: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} saltados`);
  return result;
}

// ── Buscar empresa en HubSpot por nombre/dominio ─────────────────────────────

async function findCompanyId(
  hsClient: Client,
  opts: { clientName: string; companyName: string | null; hubName: string | null }
): Promise<string | null> {
  const { clientName, companyName, hubName } = opts;

  const searches = [
    hubName && { propertyName: "domain", operator: "EQ", value: hubName },
    companyName && { propertyName: "name", operator: "EQ", value: companyName },
    companyName && { propertyName: "name", operator: "CONTAINS_TOKEN", value: companyName },
    clientName !== companyName && { propertyName: "name", operator: "CONTAINS_TOKEN", value: clientName },
  ].filter(Boolean) as Array<{ propertyName: string; operator: string; value: string }>;

  for (const filter of searches) {
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/companies/search",
        body: {
          filterGroups: [{ filters: [filter] }],
          properties: ["name", "domain"],
          limit: 1,
        },
      });
      const data = (await res.json()) as { results?: Array<{ id: string }> };
      if (data.results?.length) return data.results[0].id;
    } catch {
      continue;
    }
  }

  return null;
}
