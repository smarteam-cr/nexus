/**
 * scripts/run-marketing-cron-tick.ts
 *
 * Prueba el tick del cron de Contenido sin esperar al viernes.
 *
 *   npx tsx scripts/run-marketing-cron-tick.ts                       # dry-run con AHORA
 *   npx tsx scripts/run-marketing-cron-tick.ts --at "2026-07-03T12:30:00Z"  # dry-run con fecha simulada
 *   npx tsx scripts/run-marketing-cron-tick.ts --apply               # tick REAL con AHORA (puede disparar la cadena)
 *
 * El dry-run evalúa ventana (viernes >= 6:00 CR) + lock (lastCronDateKey) + run
 * activo, e imprime la decisión SIN escribir.
 */
import "dotenv/config";

async function main() {
  const apply = process.argv.includes("--apply");
  const atIdx = process.argv.indexOf("--at");
  const now = atIdx !== -1 && process.argv[atIdx + 1] ? new Date(process.argv[atIdx + 1]) : new Date();
  if (isNaN(now.getTime())) {
    console.error("Fecha inválida en --at (usá ISO, ej. 2026-07-03T12:30:00Z)");
    process.exit(1);
  }

  // Import dinámico DESPUÉS de dotenv (prisma necesita DATABASE_URL).
  const { tickMarketingCron, crDateParts } = await import("../lib/marketing/cron");

  const parts = crDateParts(now);
  console.log(`Evaluando tick con now=${now.toISOString()} → CR: ${parts.weekday} ${parts.dateKey} hora ${parts.hour}`);
  console.log(apply ? "MODO APPLY (puede disparar la cadena)\n" : "DRY-RUN (no escribe)\n");

  const decision = await tickMarketingCron(now, { dryRun: !apply });
  if (decision.fired) {
    console.log(`🔥 Disparó la cadena — run ${decision.runId} (seguí el progreso en /contenido)`);
  } else {
    console.log(`— No disparó: ${decision.reason}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
