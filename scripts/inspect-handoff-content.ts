/**
 * scripts/inspect-handoff-content.ts  (READ-ONLY)
 *
 * Aclara la diferencia entre CANVAS Handoff (estructura/cascarón) y CONTENIDO
 * (CanvasBlock). Lista cuántos canvases "Handoff" tienen bloques (handoff realmente
 * generado) vs están vacíos (cascarón legacy, p.ej. tras un reset). No escribe nada.
 *
 *   npx tsx scripts/inspect-handoff-content.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const canvases = await prisma.projectCanvas.findMany({
    where: { name: "Handoff" },
    select: {
      id: true,
      project: { select: { name: true, serviceType: true, client: { select: { name: true } } } },
    },
  });

  const withContent: { project: string; client: string; serviceType: string | null; blocks: number }[] = [];
  let empty = 0;
  let sentinels = 0;

  for (const c of canvases) {
    const blocks = await prisma.canvasBlock.count({ where: { section: { canvasId: c.id } } });
    if (c.project.serviceType === "__strategy__") sentinels++;
    if (blocks > 0) {
      withContent.push({
        project: c.project.name,
        client: c.project.client?.name ?? "—",
        serviceType: c.project.serviceType,
        blocks,
      });
    } else {
      empty++;
    }
  }

  console.log(`Canvases "Handoff" (estructura): ${canvases.length}`);
  console.log(`  Sobre proyectos sentinel (__strategy__): ${sentinels}`);
  console.log(`\n  CON contenido (bloques > 0) — handoff REALMENTE generado: ${withContent.length}`);
  console.log(`  VACÍOS (0 bloques) — cascarón legacy / reseteado: ${empty}\n`);

  withContent.sort((a, b) => b.blocks - a.blocks);
  for (const w of withContent) {
    console.log(`  • ${w.blocks} bloques · ${w.project}  [cliente: ${w.client}${w.serviceType === "__strategy__" ? " · SENTINEL" : ""}]`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
