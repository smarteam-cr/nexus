import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";
import { crearProjectRecord, hasProjectsWriteScope } from "@/lib/hubspot/project-record";
import { pipelineByKey } from "@/lib/projects/kind";

/**
 * lib/hubspot/handoff-sync.ts  (Fase 5 del bloque de fundación)
 *
 * Sincroniza un Handoff (entidad Nexus) hacia el CRM de Smarteam (HubSpot SISTEMA):
 * crea el record "projects" (objectType 0-970) en el pipeline "Customer Success CRM"
 * / etapa "Hand off", lo asocia a la company (+ deal ancla) y marca el flag de
 * onboarding en la company. Nexus es la fuente de verdad; HubSpot es un sync
 * EVENTUAL + REINTENTABLE gobernado por Handoff.hubspotSyncStatus.
 *
 * IDEMPOTENCIA + sin loop con sync-projects (el objeto "projects" 0-970 es el MISMO
 * que sync-projects gestiona vía Project.hubspotServiceId):
 *  - Si el Project del handoff ya tiene `hubspotServiceId` → NO se crea otro record;
 *    se linkea a ese (evita duplicado en HubSpot y el re-import como Project nuevo).
 *  - Si no lo tiene → se crea UNO y se setea `Project.hubspotServiceId` = ese id para
 *    que sync-projects lo ACTUALICE en vez de re-importarlo como Project duplicado.
 *  - Si `Handoff.hubspotProjectId` ya está → skip. Asociación/flag son upsert.
 *
 * GATE: no escribe nada si el token del sistema no tiene `crm.objects.projects.write`
 * (token-info / getPortalInfo).
 */

/* El pipeline y la etapa inicial ya NO viven acá. Eran una copia de la fila de Customer Success
   de `lib/projects/kind.ts` —los mismos dos ids, escritos dos veces— y envejecían por separado.
   Ahora salen de la tabla, y el POST lo hace `lib/hubspot/project-record.ts`, el único módulo
   autorizado a crear un proyecto en HubSpot. */

// Flag de onboarding en la COMPANY (checkbox booleano). Confirmado por Elías:
// internal name `nexus` (label "Nexus") — "true" era el VALOR del checkbox, no el
// nombre. Se setea en true al sincronizar. Si null, no se escribe ninguna prop.
const COMPANY_HANDOFF_FLAG_PROPERTY: string | null = "nexus";

export type SyncStatus = "synced" | "linked" | "skipped" | "no_scope" | "failed";
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
      project: { select: { name: true, hubspotServiceId: true } },
    },
  });
  if (!handoff) return { handoffId, status: "failed", error: "handoff no existe" };

  // Idempotencia dura: ya linkeado/sincronizado → no tocar nada.
  if (handoff.hubspotProjectId) {
    return { handoffId, status: "skipped", hubspotProjectId: handoff.hubspotProjectId, created: false };
  }

  if (!(await hasProjectsWriteScope())) {
    return { handoffId, status: "no_scope" };
  }

  const companyId = handoff.client.hubspotCompanyId;

  try {
    const hs = await getSystemHubspotClient();

    // ── CASO A: el Project del handoff YA tiene record en HubSpot ───────────────
    // (handoff migrado, o proyecto ya importado por sync-projects). Crear otro 0-970
    // lo DUPLICA — linkeamos a ese record; no creamos ni cambiamos la etapa (puede
    // estar más avanzado que "Hand off").
    if (handoff.project.hubspotServiceId) {
      const existing = handoff.project.hubspotServiceId;
      if (companyId && COMPANY_HANDOFF_FLAG_PROPERTY) {
        await writeCompanyFlag(hs, companyId, COMPANY_HANDOFF_FLAG_PROPERTY);
      }
      await prisma.handoff.update({
        where: { id: handoffId },
        data: { hubspotProjectId: existing, hubspotSyncStatus: "synced", hubspotSyncError: null },
      });
      return { handoffId, status: "linked", hubspotProjectId: existing, created: false };
    }

    // ── CASO B: no hay record en HubSpot → crear y LINKEAR al Project ───────────
    // Setear Project.hubspotServiceId = nuevo record para que sync-projects lo
    // RECONOZCA (update) en vez de re-importarlo como Project nuevo (el bug).
    /* Las asociaciones viajan DENTRO del POST (ver `project-record.ts`). Antes se hacían en
       dos llamadas más, después de crear: un timeout en el medio dejaba un record sin empresa,
       que el espejo no puede descubrir nunca — o sea, basura irrecuperable en el CRM. */
    const newProjectId = await crearProjectRecord(hs, {
      nombre: handoff.project.name || handoff.client.name || "Proyecto",
      /* Este camino es el del handoff clásico y nace SIEMPRE como implementación: es el flujo
         de Ventas → Customer Success. El alta única (Tanda C) es la que elige el tipo. */
      pipeline: pipelineByKey("customer-success"),
      // Solo CASO B (creación). Si el handoff nació del stepper, trae el owner a setear.
      ownerId: handoff.hubspotOwnerIdOnCreate,
      empresaId: companyId,
      tratoId: handoff.hubspotDealId,
    });
    // Link inmediato y secuencial (project primero): si el 2º update fallara, el retry
    // entra por CASO A (project.hubspotServiceId ya seteado) → linkea, no duplica.
    await prisma.project.update({ where: { id: handoff.projectId }, data: { hubspotServiceId: newProjectId } });
    await prisma.handoff.update({ where: { id: handoffId }, data: { hubspotProjectId: newProjectId } });

    if (companyId && COMPANY_HANDOFF_FLAG_PROPERTY) {
      await writeCompanyFlag(hs, companyId, COMPANY_HANDOFF_FLAG_PROPERTY);
    }

    await prisma.handoff.update({
      where: { id: handoffId },
      data: { hubspotSyncStatus: "synced", hubspotSyncError: null },
    });
    return { handoffId, status: "synced", hubspotProjectId: newProjectId, created: true };
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

/* `createProjectRecord` y `associateDefault` se fueron a `lib/hubspot/project-record.ts`
   (2026-07-30). No fue solo mudanza: las asociaciones pasaron a viajar DENTRO del POST de
   creación. Antes eran dos llamadas posteriores, y un timeout entre medio dejaba un record sin
   empresa — que el espejo no puede descubrir nunca, porque encuentra proyectos recorriendo las
   asociaciones de la company. Basura irrecuperable, sin error. */

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
