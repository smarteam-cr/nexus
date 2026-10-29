/**
 * scripts/run-partner-sync.ts — corrida manual del sync de Partner Clients.
 *
 *   npx tsx scripts/run-partner-sync.ts            → DRY-RUN de creación: sincroniza
 *     snapshots y matching, pero NO crea Clients (imprime el plan de creación).
 *   npx tsx scripts/run-partner-sync.ts --apply    → crea también los Clients
 *     de los records sin match (revisar el plan del dry-run ANTES).
 *
 * ⚠ Los dos modos ESCRIBEN snapshots. Solo `--apply` pasa a un cliente de su registro inactivo al
 *   activo (lib/cs/partner-cambio-de-registro.ts); sin `--apply` imprime cuáles pasaría. Para hacer
 *   SOLO ese cambio, sin crear fichas: `scripts/partner-cambios-de-registro.ts --apply`.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "../lib/db/prisma";
import { syncPartnerClients } from "../lib/cs/partner-sync";

async function main() {
  const apply = resolverApply();
  console.log(
    apply
      ? "MODO APPLY (crea Clients y pasa clientes a su registro activo)"
      : "MODO DRY-RUN de creación (snapshots sí; Clients y cambios de registro, no)",
  );

  const r = await syncPartnerClients({ createClients: apply, cambiarRegistros: apply });
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
  if (r.cambiosDeRegistro.length > 0) {
    console.log(`\n— Pasaron a su registro activo (${r.cambiosDeRegistro.length}) —`);
    for (const c of r.cambiosDeRegistro) {
      console.log(`  ${c.cliente ?? c.clientId}: ${c.desde} → ${c.hacia} (por ${c.via}) · ${c.semanasDeHistorial} semana(s) de historial`);
    }
  }
  if (r.cambiosPendientes.length > 0) {
    console.log(`\n— Pasarían a su registro activo con --apply (${r.cambiosPendientes.length}) —`);
    for (const c of r.cambiosPendientes) console.log(`  ${c.cliente ?? c.clientId}: ${c.desde} → ${c.hacia} (por ${c.via})`);
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
