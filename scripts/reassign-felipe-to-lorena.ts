/**
 * scripts/reassign-felipe-to-lorena.ts
 *
 * Reasignación puntual de cartera: Felipe Sepúlveda (asepulveda@smarteamcr.com,
 * owner HubSpot 80566917) → Lorena Osorio (losorio@smarteamcr.com, owner HubSpot
 * 49081628). Felipe ya no trabaja en Smarteam.
 *
 * Hace TRES cosas, en orden:
 *   1. Escribe `csl_encargado` (fuente de verdad de la asignación) en cada objeto
 *      "Proyectos" de HubSpot que hoy apunta a Felipe (verificado en vivo, no
 *      contra el caché de Nexus).
 *   2. Reasigna los ActionItem PENDING de Felipe a Lorena (ownerEmail).
 *   3. Dispara un sync de HubSpot por cada cliente tocado para que
 *      Project.hubspotOwnerEmail refleje el cambio de inmediato en Nexus.
 *
 * NO desactiva a Felipe (eso es scripts/deactivate-team-members.ts, aparte).
 *
 * Dry-run por default. Aplicar con: npx tsx scripts/reassign-felipe-to-lorena.ts --apply
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

const APPLY = process.argv.includes("--apply");

const FELIPE_EMAIL = "asepulveda@smarteamcr.com";
const FELIPE_HS_OWNER_ID = "80566917";
const LORENA_EMAIL = "losorio@smarteamcr.com";
const LORENA_HS_OWNER_ID = "49081628";

async function main() {
  console.log(APPLY ? "APLICANDO reasignación Felipe → Lorena…\n" : "DRY-RUN (usá --apply para escribir)\n");

  // ── 1. Proyectos de HubSpot con csl_encargado = Felipe (verificado EN VIVO) ──
  const candidateProjects = await prisma.project.findMany({
    where: { hubspotOwnerEmail: FELIPE_EMAIL, hubspotServiceId: { not: null } },
    select: { id: true, name: true, hubspotServiceId: true, clientId: true, client: { select: { name: true } } },
  });

  const hs = await getSystemHubspotClient();
  const toReassign: typeof candidateProjects = [];
  for (const p of candidateProjects) {
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/projects/${p.hubspotServiceId}?properties=csl_encargado`,
    });
    const data = await res.json();
    const live = data.properties?.csl_encargado ?? null;
    if (live === FELIPE_HS_OWNER_ID) {
      toReassign.push(p);
      console.log(`✓ [${p.client.name}] "${p.name}" — csl_encargado vivo = Felipe → reasignar`);
    } else {
      console.log(`⚠ [${p.client.name}] "${p.name}" — csl_encargado vivo = ${live ?? "(vacío)"} (≠ Felipe) → SE OMITE (caché de Nexus desactualizado)`);
    }
  }

  if (APPLY) {
    for (const p of toReassign) {
      await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/objects/projects/${p.hubspotServiceId}`,
        body: { properties: { csl_encargado: LORENA_HS_OWNER_ID } },
      });
      console.log(`  → escrito: "${p.name}" csl_encargado = ${LORENA_HS_OWNER_ID} (Lorena)`);
    }
  }

  // ── 2. ActionItem pendientes de Felipe → Lorena ──────────────────────────────
  const actionItems = await prisma.actionItem.findMany({
    where: { ownerEmail: FELIPE_EMAIL, done: false },
    select: { id: true },
  });
  console.log(`\n${actionItems.length} ActionItem PENDING de Felipe → reasignar a Lorena`);
  if (APPLY && actionItems.length > 0) {
    const r = await prisma.actionItem.updateMany({
      where: { ownerEmail: FELIPE_EMAIL, done: false },
      data: { ownerEmail: LORENA_EMAIL },
    });
    console.log(`  → ${r.count} ActionItem reasignados`);
  }

  // ── 3. Re-sync por cliente tocado (para que Nexus refleje el cambio YA) ──────
  const clientIds = [...new Set(toReassign.map((p) => p.clientId))];
  console.log(`\n${clientIds.length} clientes a re-sincronizar: ${[...new Set(toReassign.map((p) => p.client.name))].join(", ")}`);
  if (APPLY) {
    for (const clientId of clientIds) {
      try {
        const result = await syncProjectsForClient(clientId);
        console.log(`  → sync OK: ${clientId} (${JSON.stringify(result).slice(0, 120)}…)`);
      } catch (e) {
        console.log(`  ⚠ sync falló para ${clientId}: ${(e as Error).message}`);
      }
    }
  }

  console.log(`\nResumen: ${toReassign.length}/${candidateProjects.length} proyectos ${APPLY ? "reasignados" : "a reasignar"}, ${actionItems.length} ActionItem ${APPLY ? "reasignados" : "a reasignar"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
