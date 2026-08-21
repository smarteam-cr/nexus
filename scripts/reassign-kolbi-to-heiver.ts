/**
 * scripts/reassign-kolbi-to-heiver.ts
 *
 * Reasignación puntual de UN cliente: kölbi, de Lorena Osorio
 * (losorio@smarteamcr.com, owner HubSpot 49081628) a Heiver Gómez
 * (hgomez@smarteamcr.com, owner HubSpot 87810520).
 *
 * ⚠ A diferencia de scripts/reassign-felipe-to-lorena.ts (que movía TODA la
 * cartera de Felipe porque dejó el equipo), Lorena sigue activa: esto se acota
 * al cliente kölbi, nunca a su cartera entera.
 *
 * Verificado en vivo (2026-08-21) contra HubSpot, no contra el caché de Nexus:
 *   · "Kolbi | Marketing y ventas" (512234010466) — csl_encargado = Lorena
 *   · "Kolbi | Sales Hub"          (536013582648) — csl_encargado = Lorena
 *   · "Integración con InfoClic | kölbi" (577325239054) — csl_encargado =
 *     94391053 (OTRO owner, no Lorena) → SE OMITE, no es parte del pedido.
 *
 * Hace TRES cosas, en orden:
 *   1. Escribe `csl_encargado` (fuente de verdad de la asignación) en cada
 *      proyecto de HubSpot de kölbi que hoy apunta a Lorena — re-verificado en
 *      vivo antes de escribir, por si cambió entre el diagnóstico y el apply.
 *   2. Reasigna los ActionItem PENDING de Lorena EN ESTE CLIENTE (clientId de
 *      kölbi) a Heiver. No toca ActionItem de ningún otro cliente de Lorena.
 *   3. Dispara un sync de HubSpot del cliente para que los Project de Nexus
 *      reflejen el cambio de inmediato.
 *
 * Dry-run por default. Aplicar con:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/reassign-kolbi-to-heiver.ts --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

const APPLY = resolverApply();

const CLIENT_ID = "cmo2esfqu000s8sij55rp7wmi"; // kölbi
const LORENA_EMAIL = "losorio@smarteamcr.com";
const LORENA_HS_OWNER_ID = "49081628";
const HEIVER_HS_OWNER_ID = "87810520";
const HEIVER_EMAIL = "hgomez@smarteamcr.com";

async function main() {
  console.log(
    APPLY ? "APLICANDO reasignación kölbi: Lorena → Heiver…\n" : "DRY-RUN (usá --apply para escribir)\n",
  );

  // ── 1. Proyectos de HubSpot de kölbi con csl_encargado = Lorena (EN VIVO) ────
  const candidateProjects = await prisma.project.findMany({
    where: { clientId: CLIENT_ID, hubspotServiceId: { not: null } },
    select: { id: true, name: true, hubspotServiceId: true },
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
    if (live === LORENA_HS_OWNER_ID) {
      toReassign.push(p);
      console.log(`✓ "${p.name}" — csl_encargado vivo = Lorena → reasignar`);
    } else {
      console.log(
        `⚠ "${p.name}" — csl_encargado vivo = ${live ?? "(vacío)"} (≠ Lorena) → SE OMITE`,
      );
    }
  }

  if (APPLY) {
    for (const p of toReassign) {
      await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/objects/projects/${p.hubspotServiceId}`,
        body: { properties: { csl_encargado: HEIVER_HS_OWNER_ID } },
      });
      console.log(`  → escrito: "${p.name}" csl_encargado = ${HEIVER_HS_OWNER_ID} (Heiver)`);
    }
  }

  // ── 2. ActionItem pendientes de Lorena EN ESTE CLIENTE → Heiver ──────────────
  const actionItems = await prisma.actionItem.findMany({
    where: { clientId: CLIENT_ID, ownerEmail: LORENA_EMAIL, done: false },
    select: { id: true },
  });
  console.log(`\n${actionItems.length} ActionItem PENDING de Lorena en kölbi → reasignar a Heiver`);
  if (APPLY && actionItems.length > 0) {
    const r = await prisma.actionItem.updateMany({
      where: { clientId: CLIENT_ID, ownerEmail: LORENA_EMAIL, done: false },
      data: { ownerEmail: HEIVER_EMAIL },
    });
    console.log(`  → ${r.count} ActionItem reasignados`);
  }

  // ── 3. Re-sync del cliente (para que Nexus refleje el cambio YA) ─────────────
  console.log(`\nRe-sincronizando kölbi…`);
  if (APPLY) {
    try {
      const result = await syncProjectsForClient(CLIENT_ID);
      console.log(`  → sync OK: ${JSON.stringify(result).slice(0, 200)}…`);
    } catch (e) {
      console.log(`  ⚠ sync falló: ${(e as Error).message}`);
    }
  }

  console.log(
    `\nResumen: ${toReassign.length}/${candidateProjects.length} proyectos ${APPLY ? "reasignados" : "a reasignar"}, ` +
      `${actionItems.length} ActionItem ${APPLY ? "reasignados" : "a reasignar"}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
