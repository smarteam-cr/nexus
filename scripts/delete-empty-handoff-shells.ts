/**
 * scripts/delete-empty-handoff-shells.ts
 *
 * Borra los CASCARONES vacíos del canvas "Handoff" — restos del enfoque viejo que pre-creaba
 * un canvas Handoff en TODOS los proyectos (migrate-add-handoff-canvas). El enfoque actual lo
 * crea on-demand al generar (POST /handoff → createHandoffCanvas, con la estructura vigente) y
 * lo reconcilia si ya existe. Un cascarón = canvas "Handoff" con 0 CanvasBlock (nunca generado
 * o reseteado).
 *
 * GUARD DURO: solo borra canvases con 0 bloques. NUNCA toca uno con contenido (Multiquimica,
 * Almotec…). Borrar el ProjectCanvas cascadea a sus CanvasSection (vacías). NO borra la entidad
 * Handoff (1:1 con Project): el POST la reusa idempotente al regenerar.
 *
 * Dry-run por default:
 *   npx tsx scripts/delete-empty-handoff-shells.ts            # plan
 *   npx tsx scripts/delete-empty-handoff-shells.ts --apply    # borra (PROD)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "⚠ APLICANDO borrado de cascarones Handoff vacíos…\n" : "DRY-RUN — plan (usá --apply para borrar)\n");

  const canvases = await prisma.projectCanvas.findMany({
    where: { name: "Handoff" },
    select: { id: true, project: { select: { name: true, serviceType: true, client: { select: { name: true } } } } },
  });

  const toDelete: string[] = [];
  const kept: { project: string; client: string; blocks: number }[] = [];
  let sentinels = 0;

  for (const c of canvases) {
    const blocks = await prisma.canvasBlock.count({ where: { section: { canvasId: c.id } } });
    if (blocks > 0) {
      kept.push({ project: c.project.name, client: c.project.client?.name ?? "—", blocks });
    } else {
      toDelete.push(c.id);
      if (c.project.serviceType === "__strategy__") sentinels++;
    }
  }

  console.log(`Canvases "Handoff": ${canvases.length}`);
  console.log(`  A BORRAR (0 bloques): ${toDelete.length}  (de los cuales sentinels __strategy__: ${sentinels})`);
  console.log(`  A CONSERVAR (con contenido): ${kept.length}`);
  for (const k of kept.sort((a, b) => b.blocks - a.blocks)) console.log(`    ✓ ${k.blocks} bloques · ${k.project} [${k.client}]`);

  if (!APPLY) {
    console.log("\n(DRY-RUN) Nada borrado. Revisá y corré con --apply.");
    return;
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const r = await prisma.projectCanvas.deleteMany({ where: { id: { in: toDelete.slice(i, i + 200) } } });
    deleted += r.count;
  }
  console.log(`\n✓ Borrados ${deleted} cascarones Handoff vacíos. Conservados ${kept.length} con contenido.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
