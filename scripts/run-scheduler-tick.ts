/**
 * scripts/run-scheduler-tick.ts
 *
 * Prueba manual del scheduler de jobs (lib/jobs) sin esperar las ventanas
 * reales. Evalúa `shouldRun` de cada job para una fecha simulada y (opcional)
 * ejecuta los que matcheen. Uso:
 *
 *   npx tsx scripts/run-scheduler-tick.ts                       → dry-run con "ahora"
 *   npx tsx scripts/run-scheduler-tick.ts --at 2026-07-10T13:00:00Z  → dry-run fecha simulada
 *   npx tsx scripts/run-scheduler-tick.ts --exec                → EJECUTA los que matcheen
 *
 * Nota: los jobs de CS exigen CS_WATCHDOG_ENABLED=1 en el env — para probarlos:
 *   CS_WATCHDOG_ENABLED=1 npx tsx scripts/run-scheduler-tick.ts --exec
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { crDateParts } from "../lib/jobs/time";
import { allJobs } from "../lib/jobs/defs";

async function main() {
  const args = process.argv.slice(2);
  const atIdx = args.indexOf("--at");
  const now = atIdx >= 0 ? new Date(args[atIdx + 1]) : new Date();
  const exec = args.includes("--exec");

  const parts = crDateParts(now);
  console.log(`tick simulado: ${now.toISOString()} → CR ${parts.weekday} ${parts.hour}:xx (${parts.dateKey})`);
  console.log(`CS_WATCHDOG_ENABLED=${process.env.CS_WATCHDOG_ENABLED ?? "(sin setear)"}\n`);

  for (const job of allJobs()) {
    const matches = await job.shouldRun(now, parts);
    console.log(`${matches ? "▶" : "·"} ${job.key}: ventana ${matches ? "MATCHEA" : "no matchea"}`);
    if (matches && exec) {
      try {
        await job.run(now);
        console.log(`  ✓ ejecutado`);
      } catch (e) {
        console.log(`  ✗ falló: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  const states = await prisma.cronJobState.findMany();
  console.log("\nCronJobState:", states.length ? states : "(vacío)");
}

main().finally(() => prisma.$disconnect());
