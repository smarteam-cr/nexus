/**
 * scripts/run-cs-signals.ts
 *
 * Prueba manual del refresh de señales HubSpot de Éxito del cliente (EC-A2)
 * sin pasar por la app. Uso:
 *
 *   npx tsx scripts/run-cs-signals.ts                  → refresca todos (respeta frescura)
 *   npx tsx scripts/run-cs-signals.ts --force          → ignora frescura
 *   npx tsx scripts/run-cs-signals.ts --client <id>    → un solo cliente
 *   npx tsx scripts/run-cs-signals.ts --limit 3        → corta tras N clientes (smoke)
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { computeClientSignals, refreshAllCsSignals } from "../lib/hubspot/cs-signals";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const clientIdx = args.indexOf("--client");
  const clientId = clientIdx >= 0 ? args[clientIdx + 1] : null;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

  if (clientId) {
    const summary = await computeClientSignals(clientId);
    console.log("resumen:", summary);
    const snap = await prisma.clientCsSignals.findUnique({ where: { clientId } });
    console.log(JSON.stringify(snap, null, 2));
    return;
  }

  if (limit) {
    // Smoke acotado: refresca solo los primeros N clientes elegibles.
    const clients = await prisma.client.findMany({
      where: { isProspect: false, hubspotCompanyId: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    for (const c of clients) {
      try {
        const s = await computeClientSignals(c.id);
        console.log(`✓ ${c.name}: ${s.fetchStatus}${s.errors.length ? ` (${s.errors.join("; ")})` : ""}`);
      } catch (e) {
        console.log(`✗ ${c.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return;
  }

  const result = await refreshAllCsSignals({ force });
  console.log(`refrescados: ${result.refreshed.length} · frescos salteados: ${result.skippedFresh} · fallidos: ${result.failed.length}`);
  for (const r of result.refreshed) console.log(`  ✓ ${r.clientId}: ${r.fetchStatus}${r.errors.length ? ` (${r.errors.join("; ")})` : ""}`);
  for (const f of result.failed) console.log(`  ✗ ${f.clientId}: ${f.error}`);
}

main().finally(() => prisma.$disconnect());
