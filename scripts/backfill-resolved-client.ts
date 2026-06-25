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

  console.log(`total sesiones:       ${r.total}`);
  console.log(`resueltas a cliente:  ${matched} (en ${distinctClients} clientes distintos)`);
  console.log(`sin cliente (null):   ${r.nullCount}`);
  console.log(`filas a cambiar:      ${r.changed} ${APPLY ? "(APLICADAS)" : "(se aplicarían)"}`);
  console.log("--- delta por cliente (before → after, solo los que cambian) ---");
  for (const d of r.deltas) {
    const diff = d.after - d.before;
    console.log(`   ${diff > 0 ? "+" : ""}${diff}\t(${d.before}→${d.after})\t${d.name}${d.after === 0 && d.before > 0 ? "  <<< QUEDA EN 0" : ""}`);
  }
  // Gate de seguridad: ningún cliente REAL (no de prueba) debe quedar en 0.
  const realToZero = r.deltas.filter((d) => d.after === 0 && d.before > 0 && !/empresa para pruebas|test/i.test(d.name));
  if (realToZero.length > 0) {
    console.log(`\n⚠ ATENCIÓN: ${realToZero.length} cliente(s) REAL(es) quedarían en 0 — REVISAR antes de --apply:`);
    for (const d of realToZero) console.log(`   - ${d.name} (${d.before}→0)`);
  } else {
    console.log("\n✓ Ningún cliente real queda en 0.");
  }

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
