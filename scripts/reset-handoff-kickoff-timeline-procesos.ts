/**
 * scripts/reset-handoff-kickoff-timeline-procesos.ts
 *
 * Reset ACOTADO (subconjunto de reset-clients-content.ts) a SOLO lo que pidió el usuario:
 * HANDOFFS, KICKOFFS, CRONOGRAMAS y PROCESOS. NO toca Diagnóstico, Planificación,
 * Business Cases, cards de análisis, sugerencias ni participant snapshots.
 *
 * NO TOCA (se conserva): clientes, proyectos, sesiones+transcripts+SessionProject,
 *   HandoffSource/ClientDocument/StageNote (insumos manuales), los SHELLS de canvas/sección
 *   (solo se borra el CONTENIDO = CanvasBlock), el entity Handoff (1:1, se reutiliza vacío),
 *   AgentRun, Agent, equipo, KB, HubspotAccount, SessionMinute, ActionItem, Business Cases,
 *   Diagnóstico, Planificación.
 *
 * BORRA (global, todos los proyectos reales):
 *   A) CanvasBlock de los canvas "Handoff" y "Kickoff" → resetea handoff y kickoff
 *      (hasHandoff = bloques>0, así que vaciar los bloques los deja "no generados").
 *   B) CanvasBlock "procesos" del canvas "Información del cliente" del sentinel (__strategy__).
 *   C) ProjectTimeline (cascada: fases, tareas, baselines, changes, snapshot) → resetea cronograma.
 *   + limpia el estado de PUBLICADO: Project.kickoffPublishedAt/timelinePublishedAt y los
 *     snapshots de los canvas Handoff/Kickoff (publishedSnapshot/At, contentUpdatedAt).
 *
 * Dry-run por default. Aplicar con --apply (PROD == local):
 *   cd /d/proyectos/nexus && npx tsx scripts/reset-handoff-kickoff-timeline-procesos.ts          # dry-run
 *   cd /d/proyectos/nexus && npx tsx scripts/reset-handoff-kickoff-timeline-procesos.ts --apply  # BORRA
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const SENTINEL = "__strategy__";
const INFO_CANVAS = "Información del cliente";
const RESET_CANVASES = ["Handoff", "Kickoff"];
const APPLY = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(
    APPLY
      ? "⚠ APLICANDO reset de handoffs + kickoffs + cronogramas + procesos (PROD)…\n"
      : "DRY-RUN — reset de handoffs + kickoffs + cronogramas + procesos (usá --apply)\n",
  );

  const projects = await prisma.project.findMany({ select: { id: true, serviceType: true } });
  const realProjectIds = projects.filter((p) => p.serviceType !== SENTINEL).map((p) => p.id);
  const clientCount = await prisma.client.count();

  // where-clauses (mismo para conteo y borrado)
  const handoffKickoffWhere = {
    section: { canvas: { projectId: { in: realProjectIds }, name: { in: RESET_CANVASES } } },
  } as const;
  const procesosWhere = {
    section: { key: "procesos", canvas: { name: INFO_CANVAS, project: { serviceType: SENTINEL } } },
  } as const;

  const [hkBlocks, procesosBlocks, timelines, kPub, tPub, snapsToClear] = await Promise.all([
    prisma.canvasBlock.count({ where: handoffKickoffWhere }),
    prisma.canvasBlock.count({ where: procesosWhere }),
    prisma.projectTimeline.findMany({ where: { projectId: { in: realProjectIds } }, select: { _count: { select: { phases: true } } } }),
    prisma.project.count({ where: { id: { in: realProjectIds }, kickoffPublishedAt: { not: null } } }),
    prisma.project.count({ where: { id: { in: realProjectIds }, timelinePublishedAt: { not: null } } }),
    prisma.projectCanvas.count({ where: { projectId: { in: realProjectIds }, name: { in: RESET_CANVASES }, publishedSnapshotAt: { not: null } } }),
  ]);
  const phasesTotal = timelines.reduce((n, t) => n + t._count.phases, 0);

  console.log(`Base: ${clientCount} clientes · ${projects.length} proyectos (${realProjectIds.length} reales) — NO se tocan.\n`);
  console.log("A BORRAR:");
  console.log(`  A) Bloques de Handoff + Kickoff: ${hkBlocks}`);
  console.log(`  B) Bloques "procesos" (Información del cliente / sentinel): ${procesosBlocks}`);
  console.log(`  C) Cronogramas (ProjectTimeline): ${timelines.length} (${phasesTotal} fases) [cascada: tareas/baselines/changes/snapshot]`);
  console.log(`  + Limpiar publicado: kickoff ${kPub} · cronograma ${tPub} proyectos; ${snapsToClear} snapshot(s) de canvas`);
  console.log("\n  CONSERVA: Diagnóstico, Planificación, Business Cases, cards, sugerencias, minutas, pendientes, sesiones, fuentes manuales.\n");

  if (!APPLY) {
    console.log("(DRY-RUN) Nada borrado. Re-corré con --apply para aplicar.");
    return;
  }

  console.log("Aplicando…");
  const delHK = await prisma.canvasBlock.deleteMany({ where: handoffKickoffWhere });
  const delProcesos = await prisma.canvasBlock.deleteMany({ where: procesosWhere });
  const delTimeline = await prisma.projectTimeline.deleteMany({ where: { projectId: { in: realProjectIds } } });
  await prisma.project.updateMany({
    where: { id: { in: realProjectIds } },
    data: { kickoffPublishedAt: null, timelinePublishedAt: null },
  });
  const clearedSnaps = await prisma.projectCanvas.updateMany({
    where: { projectId: { in: realProjectIds }, name: { in: RESET_CANVASES } },
    data: { publishedSnapshot: Prisma.DbNull, publishedSnapshotAt: null, contentUpdatedAt: null },
  });

  console.log("\n✓ Borrado:");
  console.log(`  A) Bloques Handoff/Kickoff: ${delHK.count}`);
  console.log(`  B) Bloques procesos: ${delProcesos.count}`);
  console.log(`  C) Cronogramas: ${delTimeline.count} (+ cascada)`);
  console.log(`  + Snapshots de canvas limpiados: ${clearedSnaps.count} · publicado reseteado`);
  console.log("\nListo. Clientes/proyectos/business cases intactos; handoff/kickoff/cronograma/procesos vacíos para regenerar.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
