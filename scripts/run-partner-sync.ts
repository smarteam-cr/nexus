/**
 * scripts/run-partner-sync.ts — corrida manual del sync de Partner Clients.
 *
 *   npx tsx scripts/run-partner-sync.ts            → DRY-RUN de creación: sincroniza
 *     snapshots y matching, pero NO crea Clients (imprime el plan de creación).
 *   npx tsx scripts/run-partner-sync.ts --apply    → crea también los Clients
 *     de los records sin match (revisar el plan del dry-run ANTES).
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { syncPartnerClients } from "../lib/cs/partner-sync";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO APPLY (crea Clients)" : "MODO DRY-RUN de creación (snapshots sí, Clients no)");

  const r = await syncPartnerClients({ createClients: apply });
  if (!r.supported) {
    console.log("⛔ Scope de partner clients NO autorizado (403).");
    console.log("   Paso manual: agregar el scope de partner clients a la app OAuth de HubSpot");
    console.log("   y re-autorizar la cuenta del sistema. Después re-correr este script.");
    return;
  }
  console.log(`records: ${r.total}`);
  console.log(`match por company ID: ${r.matchedByCompany} · por dominio: ${r.matchedByDomain} · sin match: ${r.unmatched}`);
  console.log(`briefs marcados stale: ${r.briefsMarkedStale}`);
  if (r.wouldCreateClients.length > 0) {
    console.log(`\n— Clients que se CREARÍAN con --apply (${r.wouldCreateClients.length}) —`);
    for (const c of r.wouldCreateClients) {
      console.log(`  ${c.name}  dominio=${c.domain ?? "—"}  companyId=${c.hubspotCompanyId ?? "—"}`);
    }
  }
  if (r.createdClients.length > 0) {
    console.log(`\n— Clients CREADOS (${r.createdClients.length}) —`);
    for (const c of r.createdClients) {
      console.log(`  ${c.name}  dominio=${c.domain ?? "—"}  companyId=${c.hubspotCompanyId ?? "—"}`);
    }
  }
  if (r.errors.length > 0) {
    console.log(`\n— Errores (${r.errors.length}) —`);
    r.errors.forEach((e) => console.log(`  ${e}`));
  }

  const count = await prisma.clientPartnerSnapshot.count();
  const linked = await prisma.clientPartnerSnapshot.count({ where: { clientId: { not: null } } });
  console.log(`\nsnapshots en DB: ${count} (${linked} vinculados a Client)`);
}

main().finally(() => prisma.$disconnect());
