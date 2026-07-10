/**
 * scripts/cleanup-partner-created-clients.ts — saneo del batch del 2026-07-10.
 *
 *   npx tsx scripts/cleanup-partner-created-clients.ts            → DRY-RUN (no escribe)
 *   npx tsx scripts/cleanup-partner-created-clients.ts --apply    → escribe
 *
 * El primer `run-partner-sync --apply` creó 111 Clients; entre ellos:
 *   · 4 INTERNOS/BASURA (Smarteam, Smarteam_Dev_Acc, Smarteam_devs, "Hub ID: …")
 *     que rompieron el resolver de sesiones (dos "Smarteam" = token ambiguo →
 *     el cliente Smarteam cayó de 1313 sesiones resueltas a 1; INV1/INV2 rojos).
 *   · 4 DUPLICADOS de clientes preexistentes que no matchearon por diferencias
 *     de forma (mayúsculas, "+", acentos) porque el viejo no tenía companyId
 *     o dominios cargados.
 *
 * Qué hace:
 *   MERGE (dupes): mueve el snapshot de partner al cliente VIEJO, le copia
 *     hubspotCompanyId si no tenía y une los dominios → el sync futuro matchea
 *     por vínculo existente (fuente #0) y no lo recrea. Borra el duplicado.
 *   DELETE (internos): desvincula el snapshot (clientId=null) y borra el Client.
 *     `PARTNER_CREATE_SKIP` en partner-sync evita que el sync los recree.
 *
 * Guardas: solo toca clientes SIN proyectos; si el viejo ya tiene otro snapshot
 * vinculado, reporta y no fuerza (clientId es @unique en el snapshot).
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { PARTNER_CREATE_SKIP } from "../lib/cs/partner-sync";

/** [nombre del duplicado creado por el sync, nombre del cliente preexistente] */
const MERGES: Array<[string, string]> = [
  ["MTS Multiservicios", "MTS MULTISERVICIOS"],
  ["Club de Amantes del Vino", "Club de Amantes del Vino"],
  ["EcoQuintas", "ECOQUINTAS"],
  ["RC+Inmobiliaria", "RC Inmobiliaria"],
];

/** El batch corrió 2026-07-10 ~16:07–16:13 UTC — solo se tocan clientes de esa tanda. */
const BATCH_CUTOFF = new Date("2026-07-10T15:30:00Z");

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO APPLY" : "MODO DRY-RUN (nada se escribe)");

  const batch = await prisma.client.findMany({
    where: { createdAt: { gte: BATCH_CUTOFF } },
    select: {
      id: true, name: true, hubspotCompanyId: true, emailDomains: true,
      partnerSnapshot: { select: { id: true, hubspotPartnerClientId: true } },
      _count: { select: { projects: true } },
    },
  });
  console.log(`clientes del batch: ${batch.length}`);

  // ── 1) MERGE de duplicados ────────────────────────────────────────────────
  for (const [newName, oldName] of MERGES) {
    // El "nuevo" siempre sale del batch (createdAt >= cutoff) — así el caso de
    // nombre idéntico viejo/nuevo (Club de Amantes del Vino) no se confunde.
    const target = batch.find((c) => c.name === newName);
    if (!target) { console.log(`  ⚠ merge "${newName}": no está en el batch — ya saneado?`); continue; }
    if (target._count.projects > 0) { console.log(`  ✖ merge "${newName}": tiene proyectos — NO se toca`); continue; }
    const viejo = await prisma.client.findFirst({
      where: { name: oldName, createdAt: { lt: BATCH_CUTOFF } },
      select: { id: true, name: true, hubspotCompanyId: true, emailDomains: true, partnerSnapshot: { select: { id: true } } },
    });
    if (!viejo) { console.log(`  ⚠ merge "${newName}": preexistente "${oldName}" no encontrado`); continue; }
    if (viejo.partnerSnapshot) { console.log(`  ✖ merge "${newName}": "${oldName}" YA tiene snapshot vinculado — revisar a mano`); continue; }

    const domains = [...new Set([...viejo.emailDomains, ...target.emailDomains].map((d) => d.toLowerCase()))];
    console.log(`  MERGE "${newName}" (${target.id}) → "${viejo.name}" (${viejo.id})`);
    console.log(`    snapshot ${target.partnerSnapshot?.hubspotPartnerClientId ?? "—"} → viejo · companyId viejo: ${viejo.hubspotCompanyId ?? "null→" + (target.hubspotCompanyId ?? "null")} · dominios: [${domains.join(",")}]`);
    if (apply) {
      if (target.partnerSnapshot) {
        await prisma.clientPartnerSnapshot.update({ where: { id: target.partnerSnapshot.id }, data: { clientId: viejo.id } });
      }
      await prisma.client.update({
        where: { id: viejo.id },
        data: { hubspotCompanyId: viejo.hubspotCompanyId ?? target.hubspotCompanyId, emailDomains: domains },
      });
      await prisma.client.delete({ where: { id: target.id } });
    }
  }

  // ── 2) DELETE de internos/basura + inmatcheables ──────────────────────────
  // Inmatcheables = sin dominio NI companyId: un Client solo-nombre roba sesiones
  // por el fallback débil de título (caso real: "Alejandro Rodríguez", 57 robadas).
  const internos = batch.filter(
    (c) => PARTNER_CREATE_SKIP.test(c.name) || (c.emailDomains.length === 0 && !c.hubspotCompanyId),
  );
  for (const c of internos) {
    if (c._count.projects > 0) { console.log(`  ✖ interno "${c.name}": tiene proyectos — NO se toca`); continue; }
    console.log(`  DELETE interno "${c.name}" (${c.id})${c.partnerSnapshot ? " — snapshot queda sin vincular" : ""}`);
    if (apply) {
      if (c.partnerSnapshot) {
        await prisma.clientPartnerSnapshot.update({ where: { id: c.partnerSnapshot.id }, data: { clientId: null } });
      }
      await prisma.client.delete({ where: { id: c.id } });
    }
  }

  const after = await prisma.client.count();
  console.log(`\nclientes totales ${apply ? "tras el saneo" : "(sin cambios, dry-run)"}: ${after}`);
  if (!apply) console.log("Revisá y corré con --apply. Después: re-resolver sesiones (backfill-resolved-client).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
