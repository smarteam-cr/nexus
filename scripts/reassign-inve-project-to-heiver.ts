/**
 * scripts/reassign-inve-project-to-heiver.ts
 *
 * Grupo Inve: de los 5 proyectos reales en HubSpot (todos en el pipeline
 * "Implementación de HubSpot", 826270797 — Elías: «los de desarrollo no»,
 * y este cliente no tiene ninguno de Desarrollo), 4 ya están a nombre de
 * Heiver Gómez. UNO sigue a nombre de Lorena Osorio, verificado en vivo:
 *
 *   "Grupo Inve" (512255205151, inactivo en Nexus, etapa "Finalizado")
 *   csl_encargado VIVO = 49081628 (Lorena) → se mueve a Heiver (87810520)
 *
 * ⚠ SOBRE LOS ActionItem: hay 47 pendientes de Lorena en este cliente, pero
 * 46 de esos 47 cuelgan de proyectos que YA SON de Heiver (o no tienen
 * proyecto) — probablemente porque Lorena, como CSL, sigue apareciendo en
 * sesiones aunque la propiedad formal ya se movió hace tiempo. Reasignar
 * los 47 en bloque sería una limpieza mucho más grande que "mover el
 * proyecto que quedó atrás", y no es lo que se pidió. Este script SOLO
 * mueve el ÚNICO ActionItem que cuelga del proyecto que de verdad cambia
 * de dueño acá. Los otros 46 quedan intactos.
 *
 * Dry-run por default. Aplicar con:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/reassign-inve-project-to-heiver.ts --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

const APPLY = resolverApply();

const CLIENT_ID = "cmpc0e2pf009txgij0zcp6ytq"; // Grupo Inve
const PROJECT_ID = "cmpxa00cx003f00ijlwdwiu5f"; // "Grupo Inve" (inactivo, Finalizado)
const HUBSPOT_SERVICE_ID = "512255205151";
const LORENA_HS_OWNER_ID = "49081628";
const HEIVER_HS_OWNER_ID = "87810520";

async function main() {
  console.log(
    APPLY
      ? "APLICANDO reasignación Grupo Inve (1 proyecto) → Heiver…\n"
      : "DRY-RUN (usá --apply para escribir)\n",
  );

  const hs = await getSystemHubspotClient();
  const res = await hs.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/projects/${HUBSPOT_SERVICE_ID}?properties=csl_encargado`,
  });
  const data = await res.json();
  const live = data.properties?.csl_encargado ?? null;

  if (live !== LORENA_HS_OWNER_ID) {
    console.log(`⚠ csl_encargado vivo = ${live ?? "(vacío)"} (≠ Lorena) → NADA que hacer, se omite`);
  } else {
    console.log(`✓ "Grupo Inve" — csl_encargado vivo = Lorena → reasignar`);
    if (APPLY) {
      await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/objects/projects/${HUBSPOT_SERVICE_ID}`,
        body: { properties: { csl_encargado: HEIVER_HS_OWNER_ID } },
      });
      console.log(`  → escrito: csl_encargado = ${HEIVER_HS_OWNER_ID} (Heiver)`);
    }
  }

  // El único ActionItem PENDING que cuelga de ESTE proyecto puntual.
  const items = await prisma.actionItem.findMany({
    where: { clientId: CLIENT_ID, projectId: PROJECT_ID, ownerEmail: "losorio@smarteamcr.com", done: false },
    select: { id: true, text: true },
  });
  console.log(`\n${items.length} ActionItem PENDING de Lorena en este proyecto → reasignar a Heiver`);
  for (const it of items) console.log(`  · ${it.text.slice(0, 90)}…`);
  if (APPLY && items.length > 0) {
    const r = await prisma.actionItem.updateMany({
      where: { clientId: CLIENT_ID, projectId: PROJECT_ID, ownerEmail: "losorio@smarteamcr.com", done: false },
      data: { ownerEmail: "hgomez@smarteamcr.com" },
    });
    console.log(`  → ${r.count} ActionItem reasignados`);
  }

  console.log(`\nRe-sincronizando Grupo Inve…`);
  if (APPLY) {
    try {
      const result = await syncProjectsForClient(CLIENT_ID);
      console.log(`  → sync OK: ${JSON.stringify(result).slice(0, 200)}…`);
    } catch (e) {
      console.log(`  ⚠ sync falló: ${(e as Error).message}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
