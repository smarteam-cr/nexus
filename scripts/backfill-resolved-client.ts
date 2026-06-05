import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

/**
 * Backfill de FirefliesSession.resolvedClientId (PERF #1).
 * Dry-run por defecto; escribe solo con --apply.
 *   npx tsx scripts/backfill-resolved-client.ts            (dry-run)
 *   npx tsx scripts/backfill-resolved-client.ts --apply    (escribe)
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== DRY-RUN (no escribe) ===");
  const r = await resolveAllSessions({ dryRun: !APPLY });
  const matched = Object.values(r.byClient).reduce((a, b) => a + b, 0);
  const distinctClients = Object.keys(r.byClient).length;
  const top = Object.entries(r.byClient).sort((a, b) => b[1] - a[1]).slice(0, 15);

  console.log(`total sesiones:       ${r.total}`);
  console.log(`resueltas a cliente:  ${matched} (en ${distinctClients} clientes distintos)`);
  console.log(`sin cliente (null):   ${r.nullCount}`);
  console.log(`filas a cambiar:      ${r.changed} ${APPLY ? "(APLICADAS)" : "(se aplicarían)"}`);
  console.log("--- top 15 clientes por nº de sesiones resueltas ---");
  for (const [cid, n] of top) console.log(`   ${cid}: ${n}`);

  if (APPLY) {
    const verify = await resolveAllSessions({ dryRun: true });
    console.log(
      `\n[FIDELIDAD] re-dry-run tras apply → changed=${verify.changed} ${verify.changed === 0 ? "OK (materializado == categorize en vivo)" : "FALLO: quedaron diffs"}`,
    );
  } else {
    console.log("\nPara aplicar: npx tsx scripts/backfill-resolved-client.ts --apply");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("backfill error:", e);
  process.exit(1);
});
