/**
 * scripts/clear-kickoff-blocks.ts
 *
 * Borra los CanvasBlock (CUALQUIER estado) del canvas "Kickoff" de un proyecto,
 * para re-generar el kickoff desde cero sin duplicados viejos. One-off; filtra
 * por un término que matchea nombre de proyecto o de cliente.
 *
 * NO toca el ProjectCanvas ni las CanvasSection — solo los bloques.
 *
 * Uso:
 *   npx tsx scripts/clear-kickoff-blocks.ts almotec           # dry-run
 *   npx tsx scripts/clear-kickoff-blocks.ts almotec --apply   # borra
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const term = args.find((a) => !a.startsWith("--")) ?? "almotec";
  console.log(`Filtro: "${term}"  |  Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para borrar)"}\n`);

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { client: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    select: { id: true, name: true, client: { select: { name: true } } },
  });

  if (projects.length === 0) {
    console.log(`No hay proyectos que matcheen "${term}".`);
    return;
  }

  let totalToDelete = 0;
  for (const p of projects) {
    const canvas = await prisma.projectCanvas.findFirst({
      where: { projectId: p.id, name: "Kickoff" },
      select: { id: true },
    });
    if (!canvas) {
      console.log(`• ${p.name} (cliente ${p.client?.name ?? "—"}) → sin canvas Kickoff, skip`);
      continue;
    }
    const sections = await prisma.canvasSection.findMany({
      where: { canvasId: canvas.id },
      select: { id: true },
    });
    const sectionIds = sections.map((s) => s.id);
    const grouped = await prisma.canvasBlock.groupBy({
      by: ["status", "source"],
      where: { sectionId: { in: sectionIds } },
      _count: { _all: true },
    });
    const total = grouped.reduce((n, g) => n + g._count._all, 0);
    totalToDelete += total;

    console.log(`• ${p.name}  (cliente ${p.client?.name ?? "—"})  proyecto=${p.id}`);
    console.log(`    canvas Kickoff: ${sectionIds.length} secciones, ${total} bloques`);
    for (const g of grouped) console.log(`      - ${g.status}/${g.source}: ${g._count._all}`);

    if (apply && total > 0) {
      const res = await prisma.canvasBlock.deleteMany({ where: { sectionId: { in: sectionIds } } });
      console.log(`    ✓ borrados: ${res.count}`);
    }
  }

  console.log(`\nTotal bloques ${apply ? "borrados" : "a borrar"}: ${totalToDelete}`);
  if (!apply) console.log("⚠ Dry-run. Re-corré con --apply para borrar.");
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
