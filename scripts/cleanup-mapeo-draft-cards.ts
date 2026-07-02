/**
 * scripts/cleanup-mapeo-draft-cards.ts
 *
 * Limpieza one-off: borra las ClientContextCard en DRAFT que dejó el agente de MAPEO
 * (agent-mapeo-inicial) en corridas históricas. Desde el cambio "born-confirmed", el mapeo
 * ya NO crea ClientContextCards (su card va como bloque TEXT CONFIRMED a la sección
 * Procesos), pero las viejas siguen disparando el banner "Aceptar todos" en el canvas
 * del proyecto. Las de OTROS agentes (diagnóstico, etc.) NO se tocan.
 *
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/cleanup-mapeo-draft-cards.ts           # dry-run
 *   npx tsx scripts/cleanup-mapeo-draft-cards.ts --apply   # BORRA
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "⚠ APLICANDO — borrar cards DRAFT del mapeo (PROD)\n" : "DRY-RUN — cards DRAFT del mapeo (usá --apply para borrar)\n");

  const where = {
    canvasStatus: "draft",
    agentRun: { agentId: "agent-mapeo-inicial" },
  } as const;

  const cards = await prisma.clientContextCard.findMany({
    where,
    select: { id: true, title: true, client: { select: { name: true } }, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Cards DRAFT del mapeo a borrar: ${cards.length}`);
  for (const c of cards) {
    console.log(`   - [${c.client?.name ?? "?"}] "${c.title}" (${c.createdAt.toISOString().slice(0, 10)})`);
  }

  if (!APPLY) { console.log("\n(DRY-RUN) Nada borrado. Re-corré con --apply."); return; }
  if (cards.length === 0) { console.log("\nNada que borrar."); return; }

  const del = await prisma.clientContextCard.deleteMany({ where });
  console.log(`\n✓ Borradas ${del.count} card(s) DRAFT del mapeo. Los banners de aceptar desaparecen.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
