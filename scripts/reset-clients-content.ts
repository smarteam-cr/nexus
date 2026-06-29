/**
 * scripts/reset-clients-content.ts
 *
 * RESET GLOBAL del CONTENIDO GENERADO por agentes/canvas — para re-testear la app
 * desde cero. Superset de reset-all-onboarding.ts: agrega Diagnóstico + Planificación,
 * los Business Cases, y (extras) las cards de análisis, sugerencias y participant snapshot.
 *
 * NO TOCA (se conserva SIEMPRE):
 *   - Clientes (incl. prospectos) y Proyectos.
 *   - Sesiones (FirefliesSession) + sus transcripts + SessionProject.
 *   - HandoffSource, ClientDocument, StageNote (insumos manuales que se reutilizan al regenerar).
 *   - Los SHELLS de canvas y sección (solo se borran los CanvasBlock = contenido).
 *   - El entity Handoff (1:1; se reutiliza vacío — hasHandoff = bloques>0).
 *   - Historial de AgentRun, definiciones de Agent, equipo, KB, HubspotAccount.
 *   - SessionMinute (minutas) y ActionItem (pendientes) — salvo flags explícitos abajo.
 *
 * BORRA (alcance acordado con el usuario):
 *   A) CanvasBlock de los canvas de contenido (Handoff/Kickoff/Diagnóstico/Planificación)
 *      bajo proyectos REALES + los bloques "procesos" del canvas "Información del cliente"
 *      del proyecto sentinel (__strategy__).
 *   B) ProjectTimeline (cascada: fases, tareas, baselines, changes, snapshot).
 *   C) BusinessCase (cascada: canvases versionados + sus secciones/bloques, BC blocks v1,
 *      sessions, transcripts, external access). Los AgentRun del BC se PRESERVAN: se
 *      desvincula businessCaseId antes de borrar (la FK es Cascade), para no perder historial.
 *   D) ClientContextCard generadas por agente (source AGENT/MODIFIED — conserva HUMAN).
 *   E) CanvasSuggestion (bandeja de sugerencias del company-canvas).
 *   F) ProjectParticipantSnapshot.
 *   + limpia el estado de "publicado": Project.kickoffPublishedAt/timelinePublishedAt y
 *     los snapshots de los canvas de contenido (publishedSnapshot/At, contentUpdatedAt).
 *
 * Flags opcionales (OFF por default, NO incluidos en el alcance acordado):
 *   --minutes   también borra SessionMinute (161)
 *   --actions   también borra ActionItem (¡incluye los manuales!)
 *
 * Dry-run por default. Aplicar con --apply:
 *   cd /d/Proyectos/nexus && npx tsx scripts/reset-clients-content.ts            # dry-run
 *   cd /d/Proyectos/nexus && npx tsx scripts/reset-clients-content.ts --apply    # BORRA (PROD)
 */
import { PrismaClient, Prisma, CardSource } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const SENTINEL = "__strategy__";
const INFO_CANVAS = "Información del cliente";
const CONTENT_CANVASES = ["Handoff", "Kickoff", "Diagnóstico", "Planificación"];

const APPLY = process.argv.includes("--apply");
const DO_MINUTES = process.argv.includes("--minutes");
const DO_ACTIONS = process.argv.includes("--actions");

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(
    APPLY
      ? "⚠ APLICANDO reset GLOBAL de contenido generado (PROD)…\n"
      : "DRY-RUN — reset GLOBAL de contenido generado (usá --apply para borrar)\n",
  );

  // Proyectos reales (no-sentinel) de toda la base. Los clientes/proyectos NO se tocan.
  const projects = await prisma.project.findMany({ select: { id: true, serviceType: true } });
  const realProjectIds = projects.filter((p) => p.serviceType !== SENTINEL).map((p) => p.id);

  const clientCount = await prisma.client.count();
  const projCount = projects.length;

  // ── where-clauses reutilizados (conteo y borrado usan el MISMO) ──
  const contentBlocksWhere = {
    section: { canvas: { projectId: { in: realProjectIds }, name: { in: CONTENT_CANVASES } } },
  } as const;
  const procesosWhere = {
    section: { key: "procesos", canvas: { name: INFO_CANVAS, project: { serviceType: SENTINEL } } },
  } as const;
  const cardsWhere = { source: { in: [CardSource.AGENT, CardSource.MODIFIED] } };

  // ── Conteos (inventario) ──
  const [
    contentBlocks,
    procesosBlocks,
    timelines,
    bcs,
    bcCanvasBlocks,
    bcRuns,
    cards,
    suggestions,
    snapshots,
    minutes,
    actionsLive,
    kPub,
    tPub,
    snapsToClear,
  ] = await Promise.all([
    prisma.canvasBlock.count({ where: contentBlocksWhere }),
    prisma.canvasBlock.count({ where: procesosWhere }),
    prisma.projectTimeline.findMany({ where: { projectId: { in: realProjectIds } }, select: { _count: { select: { phases: true } } } }),
    prisma.businessCase.count(),
    prisma.canvasBlock.count({ where: { section: { canvas: { businessCaseId: { not: null } } } } }),
    prisma.agentRun.count({ where: { businessCaseId: { not: null } } }),
    prisma.clientContextCard.count({ where: cardsWhere }),
    prisma.canvasSuggestion.count(),
    prisma.projectParticipantSnapshot.count(),
    prisma.sessionMinute.count(),
    prisma.actionItem.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { id: { in: realProjectIds }, kickoffPublishedAt: { not: null } } }),
    prisma.project.count({ where: { id: { in: realProjectIds }, timelinePublishedAt: { not: null } } }),
    prisma.projectCanvas.count({ where: { projectId: { in: realProjectIds }, name: { in: CONTENT_CANVASES }, publishedSnapshotAt: { not: null } } }),
  ]);
  const phasesTotal = timelines.reduce((n, t) => n + t._count.phases, 0);

  console.log(`Base: ${clientCount} clientes · ${projCount} proyectos (${realProjectIds.length} reales) — NO se tocan.\n`);
  console.log("A BORRAR:");
  console.log(`  A) Bloques de canvas de contenido (${CONTENT_CANVASES.join("/")}): ${contentBlocks}`);
  console.log(`     + bloques "procesos" (Información del cliente / sentinel): ${procesosBlocks}`);
  console.log(`  B) Cronogramas (ProjectTimeline): ${timelines.length} (${phasesTotal} fases) [cascada: tareas/baselines/changes]`);
  console.log(`  C) Business Cases: ${bcs} [cascada: ${bcCanvasBlocks} bloques de BC-canvas + blocks v1/sessions/transcripts/access]`);
  console.log(`     · sus ${bcRuns} AgentRun se PRESERVAN (se desvincula businessCaseId antes de borrar el BC)`);
  console.log(`  D) Cards de análisis (ClientContextCard AGENT/MODIFIED): ${cards}`);
  console.log(`  E) Sugerencias (CanvasSuggestion): ${suggestions}`);
  console.log(`  F) Participant snapshot: ${snapshots}`);
  console.log(`  + Limpiar publicado: kickoff ${kPub} · cronograma ${tPub} proyectos; ${snapsToClear} snapshot(s) de canvas`);
  console.log(`  ${DO_MINUTES ? "✓" : "✗"} Minutas (SessionMinute): ${minutes} ${DO_MINUTES ? "(SE BORRAN: --minutes)" : "(se conservan)"}`);
  console.log(`  ${DO_ACTIONS ? "✓" : "✗"} Pendientes (ActionItem vivos): ${actionsLive} ${DO_ACTIONS ? "(SE BORRAN: --actions, ¡incluye manuales!)" : "(se conservan)"}`);
  console.log("");

  if (!APPLY) {
    console.log("(DRY-RUN) Nada borrado. Re-corré con --apply para aplicar.");
    return;
  }

  // ── Borrado (secuencial; cada deleteMany es idempotente y re-ejecutable) ──
  console.log("Aplicando…");
  const delContent = await prisma.canvasBlock.deleteMany({ where: contentBlocksWhere });
  const delProcesos = await prisma.canvasBlock.deleteMany({ where: procesosWhere });
  const delTimeline = await prisma.projectTimeline.deleteMany({ where: { projectId: { in: realProjectIds } } });
  // Preservar el historial de AgentRun del BC: desvincular ANTES de borrar (si no, la FK
  // AgentRun.businessCase onDelete:Cascade los borraría — y de rebote sus eventuales cards).
  const unlinkRuns = await prisma.agentRun.updateMany({ where: { businessCaseId: { not: null } }, data: { businessCaseId: null } });
  const delBC = await prisma.businessCase.deleteMany({});
  const delCards = await prisma.clientContextCard.deleteMany({ where: cardsWhere });
  const delSugg = await prisma.canvasSuggestion.deleteMany({});
  const delSnap = await prisma.projectParticipantSnapshot.deleteMany({});

  // Limpiar estado de publicación (vive en Project/ProjectCanvas, que NO se borran).
  await prisma.project.updateMany({
    where: { id: { in: realProjectIds } },
    data: { kickoffPublishedAt: null, timelinePublishedAt: null },
  });
  const clearedSnaps = await prisma.projectCanvas.updateMany({
    where: { projectId: { in: realProjectIds }, name: { in: CONTENT_CANVASES } },
    data: { publishedSnapshot: Prisma.DbNull, publishedSnapshotAt: null, contentUpdatedAt: null },
  });

  const delMinutes = DO_MINUTES ? (await prisma.sessionMinute.deleteMany({})).count : 0;
  const delActions = DO_ACTIONS ? (await prisma.actionItem.deleteMany({})).count : 0;

  console.log("\n✓ Borrado:");
  console.log(`  A) Bloques de contenido: ${delContent.count} (+ procesos ${delProcesos.count})`);
  console.log(`  B) Cronogramas: ${delTimeline.count} (+ cascada)`);
  console.log(`  C) Business Cases: ${delBC.count} (+ cascada; ${unlinkRuns.count} AgentRun preservados/desvinculados)`);
  console.log(`  D) Cards: ${delCards.count}`);
  console.log(`  E) Sugerencias: ${delSugg.count}`);
  console.log(`  F) Participant snapshot: ${delSnap.count}`);
  console.log(`  + Snapshots de canvas limpiados: ${clearedSnaps.count} · publicado reseteado`);
  if (DO_MINUTES) console.log(`  Minutas: ${delMinutes}`);
  if (DO_ACTIONS) console.log(`  Pendientes: ${delActions}`);
  console.log("\nListo. Clientes/proyectos intactos; los flujos se pueden regenerar desde cero.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
