/**
 * scripts/inspect-timeline-candidates.ts  (READ-ONLY)
 *
 * Lista proyectos candidatos para verificar D.2 (cronograma vivo): los que tienen
 * timeline CON tareas (detalle). Muestra etapa de HubSpot materializada, conteo de
 * fases/tareas, status actual, sesiones pasadas y si tiene hubspotServiceId.
 *
 * Uso: npx tsx scripts/inspect-timeline-candidates.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const now = new Date();
  const timelines = await prisma.projectTimeline.findMany({
    select: {
      projectId: true,
      pendingProgress: true,
      project: {
        select: { name: true, hubspotServiceId: true, hubspotPipelineStageLabel: true, hubspotStageSyncedAt: true },
      },
      phases: { select: { id: true, name: true, status: true, tasks: { select: { id: true, status: true } } } },
    },
  });

  let candidates = 0;
  for (const tl of timelines) {
    const taskCount = tl.phases.reduce((n, p) => n + p.tasks.length, 0);
    if (taskCount === 0) continue; // solo los que tienen detalle (el guard de D.2)
    candidates++;
    const pastSessions = await prisma.sessionProject.count({
      where: { projectId: tl.projectId, session: { date: { lte: now } } },
    });
    const phasesDone = tl.phases.filter((p) => p.status === "DONE").length;
    const tasksDone = tl.phases.reduce((n, p) => n + p.tasks.filter((t) => t.status === "DONE").length, 0);
    console.log(
      `\n• ${tl.project.name}  (projectId=${tl.projectId})\n` +
        `    fases=${tl.phases.length} (DONE=${phasesDone})  tareas=${taskCount} (DONE=${tasksDone})  sesiones pasadas=${pastSessions}\n` +
        `    hubspotServiceId=${tl.project.hubspotServiceId ?? "—"}  etapaHS=${tl.project.hubspotPipelineStageLabel ?? "(sin materializar)"}\n` +
        `    pendingProgress=${tl.pendingProgress ? "SÍ" : "no"}`,
    );
  }
  console.log(`\n${candidates}/${timelines.length} timelines con detalle (candidatos para D.2).`);
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end(); });
