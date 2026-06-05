import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient, getSystemAccessToken, getPortalInfo } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";

/**
 * lib/hubspot/handoff-sync.ts  (Fase 5 del bloque de fundación)
 *
 * Sincroniza un Handoff (entidad Nexus) hacia el CRM de Smarteam (HubSpot SISTEMA):
 * crea el record "projects" (objectType 0-970) en el pipeline "Customer Success CRM"
 * / etapa "Hand off", lo asocia a la company (+ deal ancla) y marca el flag de
 * onboarding en la company. Nexus es la fuente de verdad; HubSpot es un sync
 * EVENTUAL + REINTENTABLE gobernado por Handoff.hubspotSyncStatus.
 *
 * IDEMPOTENCIA (requisito explícito):
 *  - El record "projects" se crea SOLO si Handoff.hubspotProjectId es null. Retry x2
 *    sobre el mismo handoff NO duplica el project.
 *  - La asociación default v4 (PUT) y el flag de company (checkbox) son upsert por
 *    naturaleza → re-aplicarlos no duplica. Se re-aplican en cada sync (robusto ante
 *    fallos parciales) sin riesgo de duplicado.
 *
 * GATE: no escribe nada si el token del sistema no tiene `crm.objects.projects.write`
 * (token-info / getPortalInfo).
 */

// Pipeline "Customer Success CRM" + etapa "Hand off" (confirmados por inspección).
export const HUBSPOT_CS_PIPELINE_ID = "826270797";
export const HUBSPOT_HANDOFF_STAGE_ID = "1225193551";

// Objeto "projects" (confirmado por inspección): objectTypeId 0-970, nombre = hs_name.
const PROJECTS_OBJECT_TYPE = "0-970";
const PROJECT_NAME_PROPERTY = "hs_name";

// Flag de onboarding en la COMPANY (checkbox booleano). Confirmado por Elías:
// internal name `nexus` (label "Nexus") — "true" era el VALOR del checkbox, no el
// nombre. Se setea en true al sincronizar. Si null, no se escribe ninguna prop.
const COMPANY_HANDOFF_FLAG_PROPERTY: string | null = "nexus";

/** token-info: ¿el token del sistema tiene el scope de escritura de projects? */
export async function hasProjectsWriteScope(): Promise<boolean> {
  try {
    const token = await getSystemAccessToken();
    const info = await getPortalInfo(token);
    return info.scopes?.includes("crm.objects.projects.write") ?? false;
  } catch {
    return false;
  }
}

export type SyncStatus = "synced" | "skipped" | "no_scope" | "failed";
export interface SyncResult {
  handoffId: string;
  status: SyncStatus;
  hubspotProjectId?: string;
  created?: boolean; // true si este sync creó el record (false = ya existía)
  error?: string;
}

/**
 * Sincroniza UN handoff. Idempotente: el record se crea solo si falta
 * `hubspotProjectId`; asociación + flag se re-aplican (upsert) sin duplicar.
 * Si falta el scope → "no_scope" (no escribe). Si falla → "failed" (reintentable).
 */
export async function syncHandoffToHubspot(handoffId: string): Promise<SyncResult> {
  const handoff = await prisma.handoff.findUnique({
    where: { id: handoffId },
    include: {
      client: { select: { hubspotCompanyId: true, name: true } },
      project: { select: { name: true } },
    },
  });
  if (!handoff) return { handoffId, status: "failed", error: "handoff no existe" };

  if (!(await hasProjectsWriteScope())) {
    return { handoffId, status: "no_scope" };
  }

  try {
    const hs = await getSystemHubspotClient();
    const companyId = handoff.client.hubspotCompanyId;
    let projectId = handoff.hubspotProjectId;
    let created = false;

    // 1. Crear el record SOLO si no existe (idempotencia dura del project).
    if (!projectId) {
      projectId = await createProjectRecord(hs, {
        name: handoff.project.name || handoff.client.name || "Proyecto",
      });
      created = true;
      // Persistir el id de inmediato: si un paso posterior falla, el retry no recrea.
      await prisma.handoff.update({ where: { id: handoffId }, data: { hubspotProjectId: projectId } });
    }

    // 2. Asociación project↔company (default v4, upsert) — idempotente.
    if (companyId) {
      await associateDefault(hs, projectId, "companies", companyId);
    }
    // 3. Asociación al deal ancla (default v4), si hay.
    if (handoff.hubspotDealId) {
      await associateDefault(hs, projectId, "deals", handoff.hubspotDealId);
    }
    // 4. Flag de onboarding en la company (checkbox) — idempotente. Solo si está
    //    confirmada la propiedad (COMPANY_HANDOFF_FLAG_PROPERTY != null).
    if (companyId && COMPANY_HANDOFF_FLAG_PROPERTY) {
      await writeCompanyFlag(hs, companyId, COMPANY_HANDOFF_FLAG_PROPERTY);
    }

    await prisma.handoff.update({
      where: { id: handoffId },
      data: { hubspotSyncStatus: "synced", hubspotSyncError: null },
    });
    return { handoffId, status: created ? "synced" : "skipped", hubspotProjectId: projectId, created };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.handoff.update({
      where: { id: handoffId },
      data: { hubspotSyncStatus: "failed", hubspotSyncError: error.slice(0, 1000) },
    });
    return { handoffId, status: "failed", error };
  }
}

/** Reintenta TODOS los handoffs pendientes/fallidos sin project en HubSpot. Idempotente. */
export async function retryPendingHandoffs(): Promise<SyncResult[]> {
  const pend = await prisma.handoff.findMany({
    where: { hubspotProjectId: null, hubspotSyncStatus: { in: ["pending", "failed"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const results: SyncResult[] = [];
  for (const h of pend) results.push(await syncHandoffToHubspot(h.id));
  return results;
}

/** Crea el record "projects" en el pipeline/etapa correctos. Devuelve su id. */
async function createProjectRecord(hs: HsClient, { name }: { name: string }): Promise<string> {
  const res = await hs.apiRequest({
    method: "POST",
    path: `/crm/v3/objects/${PROJECTS_OBJECT_TYPE}`,
    body: {
      properties: {
        [PROJECT_NAME_PROPERTY]: name,
        hs_pipeline: HUBSPOT_CS_PIPELINE_ID,
        hs_pipeline_stage: HUBSPOT_HANDOFF_STAGE_ID,
      },
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`crear project HubSpot falló (${res.status}): ${body.slice(0, 300)}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

/** Asociación default v4 (upsert — no duplica). */
async function associateDefault(hs: HsClient, projectId: string, toType: string, toId: string): Promise<void> {
  const res = await hs.apiRequest({
    method: "PUT",
    path: `/crm/v4/objects/${PROJECTS_OBJECT_TYPE}/${projectId}/associations/default/${toType}/${toId}`,
  });
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`asociar project→${toType} falló (${res.status}): ${body.slice(0, 200)}`);
  }
}

/** Marca el flag (checkbox booleano) en la company. Idempotente (set true). */
async function writeCompanyFlag(hs: HsClient, companyId: string, property: string): Promise<void> {
  const res = await hs.apiRequest({
    method: "PATCH",
    path: `/crm/v3/objects/companies/${companyId}`,
    body: { properties: { [property]: "true" } },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`marcar flag company falló (${res.status}): ${body.slice(0, 200)}`);
  }
}
