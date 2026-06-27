/**
 * scripts/inspect-handoff-timelines.ts  (READ-ONLY)
 *
 * Diagnóstico: lista las fases de los ProjectTimeline generados por el handoff, para ver
 * si el agente "atina" o si echa el template-default del prompt (Kick-off 1 / Arquitectura 2 /
 * Set up 6 / Onboarding 6). No escribe nada.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Firma del ejemplo-default del systemPrompt del handoff.
const DEFAULT_SIG = "kick-off:1|arquitectura:2|set up:6|onboarding:6";
const sig = (phases: { name: string; durationWeeks: number }[]) =>
  phases.map((p) => `${p.name.trim().toLowerCase()}:${p.durationWeeks}`).join("|");

async function main() {
  const timelines = await prisma.projectTimeline.findMany({
    where: { project: { serviceType: { not: "__strategy__" } } },
    select: {
      anchorStartDate: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      phases: {
        orderBy: { order: "asc" },
        select: { name: true, durationWeeks: true, sessionCount: true, activityType: true, _count: { select: { tasks: true } } },
      },
    },
  });

  console.log(`ProjectTimelines (proyectos reales): ${timelines.length}\n`);

  let defaultEcho = 0;
  const sigCount = new Map<string, number>();

  for (const tl of timelines) {
    const s = sig(tl.phases);
    sigCount.set(s, (sigCount.get(s) ?? 0) + 1);
    if (s === DEFAULT_SIG) defaultEcho++;
  }

  console.log(`Timelines que son EXACTAMENTE el template-default (${DEFAULT_SIG}): ${defaultEcho}/${timelines.length}\n`);
  console.log("Firmas más comunes (name:durationWeeks | …):");
  [...sigCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([s, n]) => console.log(`  ${n}×  ${s}`));

  console.log("\nDetalle (primeros 12):");
  for (const tl of timelines.slice(0, 12)) {
    const totalW = tl.phases.reduce((a, p) => a + p.durationWeeks, 0);
    const tasks = tl.phases.reduce((a, p) => a + p._count.tasks, 0);
    console.log(`\n• ${tl.project.name} [${tl.project.client?.name ?? "—"}]  ${tl.phases.length} fases · ${totalW} sem · ${tasks} tareas · anchor ${tl.anchorStartDate ? "sí" : "no"}`);
    for (const p of tl.phases) console.log(`    - ${p.name} (${p.durationWeeks}sem, ${p.sessionCount ?? "—"}ses${p.activityType ? `, ${p.activityType}` : ""})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
