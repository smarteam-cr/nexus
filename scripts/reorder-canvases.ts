/**
 * scripts/reorder-canvases.ts
 *
 * Reordena el `order` de los ProjectCanvas EXISTENTES al nuevo orden pedido:
 *   Cronograma(0) → Kickoff(1) → Diagnóstico(2) → Planificación(3)
 *
 * El cambio en lib/canvas/canvas-defs.ts solo afecta proyectos NUEVOS; este
 * script alinea los proyectos que ya existen en la DB. El canvas "Handoff" y
 * cualquier canvas custom no entran al dropdown → se dejan como están.
 *
 * Dry-run por default. Aplicar con: npx tsx scripts/reorder-canvases.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

// Orden destino por NOMBRE de canvas (los 4 estándar del dropdown).
const ORDER_BY_NAME: Record<string, number> = {
  "Cronograma": 0,
  "Kickoff": 1,
  "Diagnóstico": 2,
  "Planificación": 3,
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO reorden de canvases…\n" : "DRY-RUN (usá --apply para escribir)\n");

  const canvases = await prisma.projectCanvas.findMany({
    select: { id: true, name: true, order: true },
  });

  let changed = 0;
  for (const c of canvases) {
    const target = ORDER_BY_NAME[c.name];
    if (target === undefined) continue; // Handoff / custom → no se tocan
    if (c.order === target) continue;
    console.log(`✗ ${c.name.padEnd(16)} order ${c.order} → ${target}  (${c.id})`);
    if (APPLY) {
      await prisma.projectCanvas.update({ where: { id: c.id }, data: { order: target } });
    }
    changed++;
  }

  console.log(`\n${changed} canvas(es) ${APPLY ? "reordenados" : "por reordenar"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
