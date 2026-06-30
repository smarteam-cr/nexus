/**
 * scripts/reset-one-project.ts
 *
 * Reset acotado a UN proyecto: borra Handoff + Kickoff (bloques de canvas) + Cronograma
 * (ProjectTimeline, cascada). NO toca el cliente, el proyecto, sesiones, fuentes manuales,
 * diagnóstico, planificación ni business cases. Deja el proyecto listo para regenerar de cero.
 *
 *   npx tsx scripts/reset-one-project.ts "Visual Branding"           # dry-run
 *   npx tsx scripts/reset-one-project.ts "Visual Branding" --apply   # BORRA (PROD)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const RESET_CANVASES = ["Handoff", "Kickoff"];
const APPLY = process.argv.includes("--apply");
const name = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  if (!name) { console.log('Pasá el nombre del proyecto, ej: "Visual Branding"'); return; }
  const projects = await prisma.project.findMany({
    where: { name: { contains: name, mode: "insensitive" }, serviceType: { not: "__strategy__" } },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (projects.length === 0) { console.log(`Sin proyectos que matcheen "${name}"`); return; }
  if (projects.length > 1) {
    console.log(`⚠ ${projects.length} proyectos matchean — sé más específico:`);
    projects.forEach((p) => console.log(`   · ${p.name} (cliente ${p.client?.name}) id=${p.id}`));
    return;
  }
  const p = projects[0];
  console.log(`${APPLY ? "⚠ APLICANDO reset" : "DRY-RUN"} — proyecto "${p.name}" (cliente ${p.client?.name}) id=${p.id}\n`);

  const hkWhere = { section: { canvas: { projectId: p.id, name: { in: RESET_CANVASES } } } } as const;
  const [hkBlocks, tl] = await Promise.all([
    prisma.canvasBlock.count({ where: hkWhere }),
    prisma.projectTimeline.findUnique({ where: { projectId: p.id }, select: { id: true, _count: { select: { phases: true } } } }),
  ]);
  const phaseCount = tl?._count.phases ?? 0;
  const taskCount = tl ? await prisma.timelineTask.count({ where: { phase: { timelineId: tl.id } } }) : 0;

  console.log("A BORRAR:");
  console.log(`  · Bloques Handoff + Kickoff: ${hkBlocks}`);
  console.log(`  · Cronograma (ProjectTimeline): ${tl ? `1 (${phaseCount} fases, ${taskCount} tareas, cascada)` : "0 (no hay)"}`);
  console.log(`  · + limpiar publicado (kickoffPublishedAt/timelinePublishedAt) y snapshots de los canvas\n`);
  console.log("  CONSERVA: cliente, proyecto, sesiones, fuentes manuales, diagnóstico, planificación, business cases.\n");

  if (!APPLY) { console.log("(DRY-RUN) Nada borrado. Re-corré con --apply."); return; }

  const delHK = await prisma.canvasBlock.deleteMany({ where: hkWhere });
  const delTL = await prisma.projectTimeline.deleteMany({ where: { projectId: p.id } });
  await prisma.project.update({ where: { id: p.id }, data: { kickoffPublishedAt: null, timelinePublishedAt: null } });
  const clearedSnaps = await prisma.projectCanvas.updateMany({
    where: { projectId: p.id, name: { in: RESET_CANVASES } },
    data: { publishedSnapshot: Prisma.DbNull, publishedSnapshotAt: null, contentUpdatedAt: null },
  });

  console.log("✓ Borrado:");
  console.log(`  · Bloques Handoff/Kickoff: ${delHK.count}`);
  console.log(`  · Cronograma: ${delTL.count} (+ cascada: fases, tareas, detailConfirmedAt)`);
  console.log(`  · Snapshots limpiados: ${clearedSnaps.count} · publicado reseteado`);
  console.log(`\nListo. "${p.name}" quedó SIN handoff/kickoff/cronograma — generá de cero para testear.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
