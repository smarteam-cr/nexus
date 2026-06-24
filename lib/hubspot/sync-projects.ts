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
  // Para meta info del proyecto que se muestra en el GPS
  "hubspot_owner_id",
  "hs_createdate",
  "hs_pipeline",
  "hs_pipeline_stage",    // D.2: etapa actual del pipeline de CS (ancla del cronograma vivo)
  "cls_encargado",        // propiedad custom (si existe en el portal)
];

// ── Slugs del objeto Proyectos ───────────────────────────────────────────────
// CANÓNICOS: "projects"/"PROJECT" son el objeto Proyectos estándar de HubSpot.
// FALLBACK numérico ("0-18"/"0-49"): guesses de ÚLTIMO recurso para portales donde
// el slug nombrado no existe. Peligrosos si matchean OTRO objeto (p.ej. en este
// portal "0-49" devuelve 28 objetos que NO son proyectos), así que SOLO se usan
// cuando no pudimos identificar el objeto Proyectos ni por slug nombrado ni por schema.
const NAMED_PROJECT_SLUGS = ["projects", "PROJECT"];
const FALLBACK_PROJECT_SLUGS = ["0-18", "0-49"];
const ASSOCIATION_SLUGS = [...NAMED_PROJECT_SLUGS, ...FALLBACK_PROJECT_SLUGS]; // para mensajes
const READ_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

/**
 * Ids de los records "projects" (0-970) asociados a una company en HubSpot.
 * Versión LIVIANA para lecturas (el stepper de handoff lista los proyectos de una
 * company) contra el portal SISTEMA, donde el objeto Proyectos es conocido. Prueba los
 * slugs nombrados y el tipo 0-970; NO usa los fallbacks numéricos peligrosos (0-18/0-49)
 * ni el schema-discovery del sync completo — `syncProjectsForClient` mantiene esa
 * robustez para portales de clientes arbitrarios.
 */
export async function resolveCompanyProjectIds(hs: Client, companyId: string): Promise<string[]> {
  for (const slug of [...NAMED_PROJECT_SLUGS, "0-970"]) {
    try {
      const res = await hs.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ toObjectId: number }> };
        const ids = (data.results ?? []).map((r) => String(r.toObjectId));
        if (ids.length > 0) return ids;
      }
    } catch {
      /* probar el siguiente slug */
    }
  }
  return [];
}

// ── Helpers para resolver owner y pipeline ──────────────────────────────────

// Cache en memoria por proceso para evitar fetches repetidos durante un sync
const ownerCache = new Map<string, { name: string | null; email: string | null }>();
const pipelineNameCache = new Map<string, string | null>();
// D.2 — cache de las etapas de un pipeline (slug:pipelineId → Map<stageId,label>).
const pipelineStagesCache = new Map<string, Map<string, string>>();

async function resolveOwner(
  hs: Client,
  ownerId: string | null | undefined,
): Promise<{ name: string | null; email: string | null }> {
  if (!ownerId) return { name: null, email: null };
  if (ownerCache.has(ownerId)) return ownerCache.get(ownerId)!;
  try {
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/owners/${ownerId}`,
    });
    const data = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      id?: string;
    };
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || null;
    const result = { name, email: data.email ?? null };
    ownerCache.set(ownerId, result);
    return result;
  } catch {
    const result = { name: null, email: null };
    ownerCache.set(ownerId, result);
    return result;
  }
}

async function resolvePipelineName(
  hs: Client,
  pipelineId: string | null | undefined,
  workingSlug: string,
): Promise<string | null> {
  if (!pipelineId) return null;
  const cacheKey = `${workingSlug}:${pipelineId}`;
  if (pipelineNameCache.has(cacheKey)) return pipelineNameCache.get(cacheKey)!;
  try {
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}`,
    });
    const data = (await res.json()) as { label?: string };
    const label = data.label ?? null;
    pipelineNameCache.set(cacheKey, label);
    return label;
  } catch {
    pipelineNameCache.set(cacheKey, null);
    return null;
  }
}

// D.2 — resuelve el label legible de una etapa (hs_pipeline_stage) del pipeline.
// Cachea TODAS las etapas del pipeline en una sola llamada (slug:pipelineId).
async function resolvePipelineStageLabel(
  hs: Client,
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  workingSlug: string,
): Promise<string | null> {
  if (!pipelineId || !stageId) return null;
  const cacheKey = `${workingSlug}:${pipelineId}`;
  let stages = pipelineStagesCache.get(cacheKey);
  if (!stages) {
    stages = new Map<string, string>();
    try {
      const res = await hs.apiRequest({
        method: "GET",
        path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}/stages`,
      });
      const data = (await res.json()) as { results?: Array<{ id: string; label: string }> };
      for (const s of data.results ?? []) stages.set(s.id, s.label);
    } catch {
      // cache vacío → no reintenta este pipeline en la corrida
    }
    pipelineStagesCache.set(cacheKey, stages);
  }
  return stages.get(stageId) ?? null;
}

// ── Sync principal ───────────────────────────────────────────────────────────

export interface SyncResult {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  debug?: string[];
}

/**
 * Verifica el estado REAL de un objeto proyecto en HubSpot antes de que la
 * reconciliación lo desactive. El set `projectIds` de asociaciones puede salir
 * mal (hipo de la API → fallback a un slug equivocado), así que NUNCA confiamos
 * solo en "no vino en la lista". Devuelve:
 *   - "alive":  el objeto existe y no está cerrado → NO desactivar.
 *   - "closed": existe pero en estado cerrado/terminado → desactivar.
 *   - "gone":   confirmado 404 (borrado/desasociado) → desactivar.
 * Ante CUALQUIER ambigüedad (timeout, scope, error transitorio) devuelve "alive"
 * (conservador): preferimos conservar un proyecto vivo que ocultarlo por error.
 */
async function verifyProjectInHubspot(hsClient: Client, objectId: string): Promise<"alive" | "closed" | "gone"> {
  let confirmedNotFound = false;
  let ambiguous = false;
  for (const slug of READ_SLUGS) {
    try {
      const res = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/${slug}/${objectId}?properties=hs_name,hs_status,nombre_del_proyecto,estatus_del_proyecto`,
      });
      if (res.status === 404) { confirmedNotFound = true; continue; }
      if (!res.ok) { ambiguous = true; continue; } // 429/5xx → no concluir nada
      const data = (await res.json()) as { id?: string; properties?: Record<string, string | null> };
      if (data?.id) {
        const raw = (data.properties?.hs_status || data.properties?.estatus_del_proyecto || "").toLowerCase().trim();
        const closed =
          raw === "completed" || raw === "cancelled" ||
          raw.includes("completado") || raw.includes("cancelado") || raw.includes("cerrado");
        return closed ? "closed" : "alive";
      }
      ambiguous = true;
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      if (msg.includes("404") || /not found/i.test(msg)) confirmedNotFound = true;
      else ambiguous = true;
    }
  }
  // No lo encontramos vivo por ningún slug. Solo confirmamos "gone" si hubo un 404
  // claro y CERO errores ambiguos; sino, conservador: "alive" (no desactivar).
  return confirmedNotFound && !ambiguous ? "gone" : "alive";
}

export async function syncProjectsForClient(clientId: string): Promise<SyncResult> {
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
  //    Caso B: cliente está en el portal del sistema (Smarteam) → usar cuenta del sistema
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
      result.debug!.push("✓ Usando cuenta HubSpot del sistema (Smarteam)");
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

  // 4. Buscar proyectos HubSpot asociados a la empresa.
  //    Estrategia robusta (evita ocultar/crear proyectos por datos basura):
  //      a) slugs nombrados canónicos ("projects"/"PROJECT")
  //      b) descubrimiento por schema (objeto cuyo nombre incluye project/proyecto) — autoritativo
  //      c) fallbacks numéricos SOLO si no identificamos el objeto y NO hubo error transitorio
  //         (sino abortamos la corrida para no reconciliar con un set incompleto).
  let projectIds: string[] = [];
  let workingAssocSlug: string | null = null;
  let objectIdentified = false; // ¿pudimos identificar el objeto Proyectos del portal?
  let anyTransient = false;     // ¿hubo algún error transitorio (timeout/5xx) consultando?

  // Consulta company→slug. Distingue OK / ausente (4xx) / transitorio (5xx/throw).
  const queryAssoc = async (
    slug: string,
  ): Promise<{ kind: "ok"; ids: string[] } | { kind: "absent" } | { kind: "transient" }> => {
    try {
      const res = await hsClient.apiRequest({
        method: "GET",
        path: `/crm/v4/objects/companies/${companyId}/associations/${slug}`,
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ toObjectId: number }> };
        return { kind: "ok", ids: (data.results ?? []).map((r) => String(r.toObjectId)) };
      }
      if (res.status >= 400 && res.status < 500) {
        result.debug!.push(`Slug "${slug}": HTTP ${res.status} (objeto/asociación ausente)`);
        return { kind: "absent" };
      }
      result.debug!.push(`Slug "${slug}": HTTP ${res.status} (transitorio)`);
      return { kind: "transient" };
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      result.debug!.push(`Slug "${slug}": error - ${msg.slice(0, 80)}`);
      return /\b40\d\b|not found|invalid/i.test(msg) ? { kind: "absent" } : { kind: "transient" };
    }
  };

  // a) Slugs nombrados canónicos.
  for (const slug of NAMED_PROJECT_SLUGS) {
    const r = await queryAssoc(slug);
    if (r.kind === "transient") anyTransient = true;
    if (r.kind === "ok") {
      objectIdentified = true;
      if (r.ids.length > 0) {
        projectIds = r.ids;
        workingAssocSlug = slug;
        result.debug!.push(`✓ ${r.ids.length} proyectos via slug "${slug}"`);
        break;
      }
      result.debug!.push(`Slug "${slug}": 0 asociaciones (objeto existe, empresa sin proyectos)`);
    }
  }

  // b) Descubrimiento por schema (autoritativo: objeto cuyo nombre incluye project/proyecto).
  if (projectIds.length === 0) {
    try {
      const schemasRes = await hsClient.apiRequest({ method: "GET", path: "/crm/v3/schemas" });
      if (schemasRes.ok) {
        const schemas = (await schemasRes.json()) as {
          results?: Array<{ name: string; objectTypeId: string; labels: { singular: string; plural: string } }>;
        };
        const customSchemas = schemas.results ?? [];
        result.debug!.push(
          `Custom schemas: ${customSchemas.map((s) => `${s.name}(${s.objectTypeId})`).join(", ") || "ninguno"}`,
        );
        const projectSchema = customSchemas.find((s) => {
          const n = (s.name + " " + s.labels?.singular + " " + s.labels?.plural).toLowerCase();
          return n.includes("project") || n.includes("proyecto");
        });
        if (projectSchema) {
          result.debug!.push(`Schema candidato: ${projectSchema.name} (${projectSchema.objectTypeId})`);
          const r = await queryAssoc(projectSchema.objectTypeId);
          if (r.kind === "transient") anyTransient = true;
          if (r.kind === "ok") {
            objectIdentified = true;
            if (r.ids.length > 0) {
              projectIds = r.ids;
              workingAssocSlug = projectSchema.objectTypeId;
              result.debug!.push(`✓ ${r.ids.length} proyectos via schema ${projectSchema.name}`);
            }
          }
        }
      } else {
        anyTransient = true;
        result.debug!.push(`Schemas: HTTP ${schemasRes.status}`);
      }
    } catch (e) {
      anyTransient = true;
      result.debug!.push(`Error obteniendo schemas: ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  // c) Fallbacks numéricos: ÚLTIMO recurso, solo si NO identificamos el objeto y NO hubo
  //    error transitorio. Así nunca ingerimos objetos no-proyecto cuando el objeto real
  //    respondió (aunque vacío) ni cuando hubo un hipo de la API.
  if (projectIds.length === 0 && !objectIdentified && !anyTransient) {
    for (const slug of FALLBACK_PROJECT_SLUGS) {
      const r = await queryAssoc(slug);
      if (r.kind === "ok" && r.ids.length > 0) {
        projectIds = r.ids;
        workingAssocSlug = slug;
        result.debug!.push(`✓ ${r.ids.length} proyectos via fallback "${slug}"`);
        break;
      }
    }
  }

  if (projectIds.length === 0) {
    // Error transitorio sin objeto identificado → ABORTAR la corrida SIN reconciliar:
    // no podemos confiar en un set incompleto, así que no desactivamos nada.
    if (anyTransient && !objectIdentified) {
      result.errors.push(
        `No se pudieron consultar las asociaciones de proyectos de la empresa ${companyId} ` +
        `(error transitorio de HubSpot). Se omite esta corrida para no reconciliar con datos incompletos.`,
      );
      return result;
    }
    result.errors.push(
      objectIdentified
        ? `La empresa ${companyId} no tiene proyectos asociados (objeto Proyectos identificado, 0 asociaciones).`
        : `No se identificó el objeto Proyectos para la empresa ${companyId}. ` +
          `Slugs intentados: ${ASSOCIATION_SLUGS.join(", ")}. Verifica que los Proyectos estén asociados en HubSpot.`,
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

    const realName = props.nombre_del_proyecto || props.hs_name || null;
    const projectName = realName ?? `Proyecto ${project.id}`;

    const rawStatus = (props.hs_status || props.estatus_del_proyecto || "").toLowerCase().trim();

    // ── Proyectos sin propiedades legibles (fallback de último recurso) ────────
    // Si no hay nombre real ni estado, HubSpot no pudo devolver los datos.
    // Si ya existe en DB con nombre fantasma → ocultarlo (inactive).
    // Si no existe → no crear tab vacío.
    const hasRealProps = !!(realName || rawStatus);
    if (!hasRealProps) {
      const ghost = await prisma.project.findUnique({ where: { hubspotServiceId: project.id } });
      if (ghost && ghost.status === "active") {
        await prisma.project.update({
          where: { id: ghost.id },
          data: { status: "inactive" },
        });
        result.updated++; // dispara router.refresh() en WorkspaceClient
        result.debug!.push(`Ocultando proyecto fantasma: ${ghost.name} (${project.id})`);
      } else {
        result.skipped++;
      }
      continue;
    }

    // ── Saltear proyectos terminados/cancelados ────────────────────────────────
    if (rawStatus && (
      rawStatus === "completed" || rawStatus === "cancelled" ||
      rawStatus.includes("completado") || rawStatus.includes("cancelado") ||
      rawStatus.includes("cerrado")
    )) {
      const finished = await prisma.project.findUnique({ where: { hubspotServiceId: project.id } });
      if (finished && finished.status === "active") {
        await prisma.project.update({
          where: { id: finished.id },
          data: { status: "inactive" },
        });
        result.updated++; // dispara router.refresh() en WorkspaceClient
      } else {
        result.skipped++;
      }
      continue;
    }

    const servicioContratado = props.servicio_contratado || props.tipo_de_servicio || projectName;
    const mapping = inferServiceMapping(servicioContratado);

    // ── Resolver owner (CSE encargado) ────────────────────────────────────
    // Priorizar propiedad custom "cls_encargado" (string libre, normalmente nombre)
    // sobre el owner estándar de HubSpot.
    const clsRaw = (props.cls_encargado ?? "").trim();
    const hubOwnerId = (props.hubspot_owner_id ?? "").trim() || null;
    const ownerInfo = await resolveOwner(hsClient, hubOwnerId);
    const ownerName = clsRaw || ownerInfo.name;
    const ownerEmail = ownerInfo.email;

    // ── Resolver pipeline name ─────────────────────────────────────────────
    const pipelineId = (props.hs_pipeline ?? "").trim() || null;
    const readSlugForPipeline = workingAssocSlug ?? "projects";
    const pipelineName = await resolvePipelineName(hsClient, pipelineId, readSlugForPipeline);

    // D.2 — etapa actual del pipeline de CS (ancla del cronograma vivo)
    const stageId = (props.hs_pipeline_stage ?? "").trim() || null;
    const stageLabel = await resolvePipelineStageLabel(hsClient, pipelineId, stageId, readSlugForPipeline);

    // ── Parsear fecha de creación ──────────────────────────────────────────
    const createdAtRaw = (props.hs_createdate ?? "").trim();
    const hubCreatedAt = createdAtRaw ? new Date(createdAtRaw) : null;
    const hubCreatedAtValid = hubCreatedAt && !isNaN(hubCreatedAt.getTime()) ? hubCreatedAt : null;

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
          status: "active",
          hubspotOwnerId:      hubOwnerId,
          hubspotOwnerName:    ownerName,
          hubspotOwnerEmail:   ownerEmail,
          hubspotCreatedAt:    hubCreatedAtValid,
          hubspotPipelineName: pipelineName,
          hubspotPipelineStageId:    stageId,
          hubspotPipelineStageLabel: stageLabel,
          hubspotStageSyncedAt:      stageId ? new Date() : null,
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
          hubspotOwnerId:      hubOwnerId,
          hubspotOwnerName:    ownerName,
          hubspotOwnerEmail:   ownerEmail,
          hubspotCreatedAt:    hubCreatedAtValid,
          hubspotPipelineName: pipelineName,
          hubspotPipelineStageId:    stageId,
          hubspotPipelineStageLabel: stageLabel,
          hubspotStageSyncedAt:      stageId ? new Date() : null,
          status: "active",
        },
      });
      await createDefaultCanvases(newProject.id);
      result.created++;
      // Proyecto NUEVO → adoptar las sesiones existentes del cliente (huérfanas:
      // matcheadas al cliente, sin SessionProject) para que el handoff / la pestaña de
      // reuniones no queden vacíos. Fire-and-forget (no bloquea el sync) + dynamic
      // import (no arrastra el clasificador al grafo del sync).
      void import("@/lib/projects/analyze-participants")
        .then((m) => m.autoClassifyOrphanSessions(clientId))
        .catch(() => {});
    }
  }

  // ── Reconciliación: ocultar proyectos sincronizados que YA NO están en HubSpot ──
  // (borrados o desasociados de la empresa). Solo si tenemos un set confiable de
  // projectIds (>0) — si fuera 0 el flujo ya cortó antes (L276), así un fallo de la
  // API de HubSpot NO desactiva todo. NUNCA toca proyectos sin hubspotServiceId
  // (manuales / handoff / sentinel __strategy__): esos no son de HubSpot.
  if (projectIds.length > 0) {
    // Candidatos: proyectos sincronizados (hubspotServiceId) activos que NO vinieron
    // en el set de asociaciones de ESTA corrida. ANTES era un updateMany ciego — pero
    // `projectIds` puede estar incompleto/erróneo (hipo de la API → fallback a un slug
    // equivocado), y eso desactivaba proyectos VIVOS. Ahora verificamos cada uno
    // directamente en HubSpot y solo desactivamos si está confirmado gone/closed.
    const candidates = await prisma.project.findMany({
      where: { clientId, status: "active", hubspotServiceId: { not: null, notIn: projectIds } },
      select: { id: true, name: true, hubspotServiceId: true },
    });
    for (const cand of candidates) {
      const verdict = await verifyProjectInHubspot(hsClient, cand.hubspotServiceId!);
      if (verdict === "alive") {
        result.debug!.push(
          `Reconciliación: "${cand.name}" (${cand.hubspotServiceId}) no vino en la asociación pero SIGUE vivo en HubSpot → se conserva activo (probable hipo de la API o slug equivocado)`,
        );
        continue;
      }
      await prisma.project.update({ where: { id: cand.id }, data: { status: "inactive" } });
      result.updated++; // dispara router.refresh() en WorkspaceClient
      result.debug!.push(
        `Reconciliación: "${cand.name}" (${cand.hubspotServiceId}) ${verdict === "gone" ? "no existe (404)" : "en estado cerrado"} en HubSpot → inactive`,
      );
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
