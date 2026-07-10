/**
 * scripts/run-account-brief.ts — corrida manual del resumen citado de una cuenta
 * (calibración del prompt).
 *
 *   npx tsx scripts/run-account-brief.ts <clientId>            → genera y muestra
 *   npx tsx scripts/run-account-brief.ts <clientId> --context  → SOLO imprime el
 *     contexto serializado + fuentes (sin llamar a Claude)
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { buildAccountBriefContext, runAccountBrief } from "../lib/cs/account-brief";

async function main() {
  const clientId = process.argv[2];
  if (!clientId || clientId.startsWith("--")) {
    console.log("uso: npx tsx scripts/run-account-brief.ts <clientId> [--context]");
    return;
  }
  if (process.argv.includes("--context")) {
    const ctx = await buildAccountBriefContext(clientId);
    if (!ctx) { console.log("cliente no encontrado"); return; }
    console.log(ctx.serialized);
    console.log(`\n— FUENTES (${ctx.sources.size}) —`);
    for (const [key, s] of ctx.sources) console.log(`  [${key}] ${s.label} (${s.date ?? "sin fecha"})`);
    return;
  }
  const r = await runAccountBrief(clientId);
  if (r.status === "skipped") { console.log(`skipped: ${r.reason}`); return; }
  console.log(`\nHEADLINE: ${r.headline ?? "(sin headline)"}\n`);
  for (const s of r.statements ?? []) {
    console.log(`• ${s.text}`);
    console.log(`  ↳ ${s.source.label}${s.source.date ? ` · ${s.source.date.slice(0, 10)}` : ""} [${s.source.kind}:${s.source.id}]`);
  }
  if (r.discarded) console.log(`\n(${r.discarded} statements descartados por cita inválida)`);
}

main().finally(() => prisma.$disconnect());
