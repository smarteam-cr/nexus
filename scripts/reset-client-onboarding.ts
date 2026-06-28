/**
 * scripts/reset-client-onboarding.ts
 *
 * RESET de onboarding de un cliente: borra de la DB el contenido GENERADO de
 * handoff, kickoff, cronograma y procesos — para re-testear la generación desde cero.
 * NO toca: el cliente, los proyectos, las sesiones, ni las HandoffSource (insumos
 * manuales que se reutilizan al regenerar).
 *
 *   - Handoff/Kickoff → CanvasBlock de los canvas "Handoff"/"Kickoff" (proyectos reales).
 *   - Cronograma      → ProjectTimeline (cascada: fases, tareas, baselines, changes).
 *   - Procesos        → CanvasBlock de la sección "procesos" del canvas "Información del
 *                       cliente" del proyecto sentinel (__strategy__) del cliente.
 *
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/reset-client-onboarding.ts sfera --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const SENTINEL = "__strategy__";
const INFO_CANVAS = "Información del cliente";

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const CLIENT_TERM = args[0] ?? "";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  if (!CLIENT_TERM) {
    console.log("Falta el término del cliente. Uso: npx tsx scripts/reset-client-onboarding.ts <cliente> [--apply]");
    return;
  }
  console.log(APPLY ? "APLICANDO reset…\n" : "DRY-RUN (usá --apply para borrar)\n");
  console.log(`Cliente ~ "${CLIENT_TERM}"\n`);

  const clients = await prisma.client.findMany({
    where: { name: { contains: CLIENT_TERM, mode: "insensitive" } },
    select: { id: true, name: true, projects: { select: { id: true, name: true, serviceType: true } } },
  });

  if (clients.length === 0) { console.log("No se encontró ningún cliente con ese término. Nada que hacer."); return; }
  if (clients.length > 1) {
    console.log(`⚠ ${clients.length} clientes coinciden: ${clients.map((c) => c.name).join(", ")}. Aborto — acotá el término.`);
    return;
  }

  const client = clients[0];
  const realProjectIds = client.projects.filter((p) => p.serviceType !== SENTINEL).map((p) => p.id);
  const sentinel = client.projects.find((p) => p.serviceType === SENTINEL) ?? null;
  console.log(`Cliente: ${client.name} (${client.id})`);
  console.log(`  Proyectos reales: ${realProjectIds.length} [${client.projects.filter((p) => p.serviceType !== SENTINEL).map((p) => p.name).join(", ") || "—"}]`);
  console.log(`  Sentinel (__strategy__): ${sentinel ? sentinel.id : "—"}\n`);

  // ── Conteos ──
  const handoffWhere = { section: { canvas: { projectId: { in: realProjectIds }, name: "Handoff" } } } as const;
  const kickoffWhere = { section: { canvas: { projectId: { in: realProjectIds }, name: "Kickoff" } } } as const;
  const procesosWhere = {
    section: { key: "procesos", canvas: { name: INFO_CANVAS, project: { clientId: client.id, serviceType: SENTINEL } } },
  } as const;

  const [handoffN, kickoffN, timelines, procesosBlocks] = await Promise.all([
    prisma.canvasBlock.count({ where: handoffWhere }),
    prisma.canvasBlock.count({ where: kickoffWhere }),
    prisma.projectTimeline.findMany({
      where: { projectId: { in: realProjectIds } },
      select: { id: true, projectId: true, _count: { select: { phases: true } } },
    }),
    prisma.canvasBlock.findMany({ where: procesosWhere, select: { id: true, blockType: true } }),
  ]);
  const phasesTotal = timelines.reduce((n, t) => n + t._count.phases, 0);
  const procesosByType = procesosBlocks.reduce<Record<string, number>>((m, b) => { m[b.blockType] = (m[b.blockType] ?? 0) + 1; return m; }, {});

  console.log("A borrar:");
  console.log(`  • Handoff:   ${handoffN} bloques`);
  console.log(`  • Kickoff:   ${kickoffN} bloques`);
  console.log(`  • Cronograma: ${timelines.length} timeline(s), ${phasesTotal} fases (cascada: tareas/baselines/changes)`);
  console.log(`  • Procesos:  ${procesosBlocks.length} bloques ${JSON.stringify(procesosByType)}`);
  console.log(`  • Publicación: se limpia timelinePublishedAt/kickoffPublishedAt + snapshots de canvas Handoff/Kickoff (vuelve a "nunca publicado")\n`);

  if (!APPLY) { console.log("(DRY-RUN) Nada borrado. Re-corré con --apply."); return; }

  const delHandoff = await prisma.canvasBlock.deleteMany({ where: handoffWhere });
  const delKickoff = await prisma.canvasBlock.deleteMany({ where: kickoffWhere });
  const delTimeline = await prisma.projectTimeline.deleteMany({ where: { projectId: { in: realProjectIds } } });
  const delProcesos = await prisma.canvasBlock.deleteMany({ where: procesosWhere });
  // Estado de publicación: sin esto el proyecto queda "publicado" stale tras el reset (el timeline
  // se borra pero el flag vive en Project) y el cliente externo seguiría viendo el snapshot viejo.
  await prisma.project.updateMany({
    where: { id: { in: realProjectIds } },
    data: { timelinePublishedAt: null, kickoffPublishedAt: null },
  });
  await prisma.projectCanvas.updateMany({
    where: { projectId: { in: realProjectIds }, name: { in: ["Handoff", "Kickoff"] } },
    data: { publishedSnapshot: Prisma.DbNull, publishedSnapshotAt: null, contentUpdatedAt: null },
  });

  console.log("✓ Borrado:");
  console.log(`  • Handoff:    ${delHandoff.count} bloques`);
  console.log(`  • Kickoff:    ${delKickoff.count} bloques`);
  console.log(`  • Cronograma: ${delTimeline.count} timeline(s) (+ cascada)`);
  console.log(`  • Procesos:   ${delProcesos.count} bloques`);
  console.log(`  • Publicación: limpiada (proyecto vuelve a "nunca publicado")`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
