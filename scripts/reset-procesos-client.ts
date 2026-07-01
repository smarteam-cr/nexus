/**
 * scripts/reset-procesos-client.ts
 *
 * Borra SOLO los bloques "procesos" (CanvasBlock del canvas "Información del cliente",
 * proyecto __strategy__) de UN cliente — para volver a probar la generación del mapa.
 * NO toca handoff/kickoff/cronograma/diagnóstico/business cases ni ningún otro cliente.
 *
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/reset-procesos-client.ts wherex           # dry-run
 *   npx tsx scripts/reset-procesos-client.ts wherex --apply   # BORRA
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const SENTINEL = "__strategy__";
const CANVAS_NAME = "Información del cliente";
const APPLY = process.argv.includes("--apply");
const NAME = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "wherex";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? `⚠ APLICANDO — borrar procesos de "${NAME}" (PROD)\n` : `DRY-RUN — procesos de "${NAME}" (usá --apply para borrar)\n`);

  const clients = await prisma.client.findMany({
    where: { name: { contains: NAME, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (clients.length === 0) { console.log(`✗ Ningún cliente coincide con "${NAME}".`); return; }
  if (clients.length > 1) {
    console.log(`✗ ${clients.length} clientes coinciden — acotá el nombre:`);
    clients.forEach((c) => console.log(`   - ${c.name} (${c.id})`));
    return;
  }
  const client = clients[0];
  console.log(`Cliente: ${client.name} (${client.id})\n`);

  const where = {
    section: {
      key: "procesos",
      canvas: { name: CANVAS_NAME, project: { serviceType: SENTINEL, clientId: client.id } },
    },
  } as const;

  const blocks = await prisma.canvasBlock.findMany({
    where,
    select: { id: true, content: true, source: true, status: true, agentRunId: true },
    orderBy: { order: "asc" },
  });

  console.log(`Bloques "procesos" a borrar: ${blocks.length}`);
  blocks.forEach((b) => console.log(`   - "${b.content}" [${b.source}/${b.status}${b.agentRunId ? "" : " · sin agentRun"}]`));

  if (!APPLY) { console.log("\n(DRY-RUN) Nada borrado. Re-corré con --apply."); return; }
  if (blocks.length === 0) { console.log("\nNada que borrar."); return; }

  const del = await prisma.canvasBlock.deleteMany({ where });
  console.log(`\n✓ Borrados ${del.count} bloque(s) de procesos de ${client.name}. Regenerá desde la pestaña Procesos.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
