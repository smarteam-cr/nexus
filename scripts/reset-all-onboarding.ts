/**
 * scripts/reset-all-onboarding.ts
 *
 * RESET MASIVO de onboarding de TODOS los clientes: borra el contenido GENERADO de
 * handoff, kickoff, cronograma y procesos para re-bakearlos desde cero con la lógica
 * actual. NO toca: clientes, proyectos, sesiones, ni las HandoffSource (insumos manuales
 * que se reutilizan al regenerar).
 *
 * Re-bake COMPLETO: además de borrar bloques/timelines, limpia el publishedSnapshot de
 * los canvas dedicados Handoff/Kickoff (si no, la vista del cliente externo seguiría
 * mostrando lo viejo hasta regenerar+republicar). El snapshot del cronograma se va con la
 * fila del ProjectTimeline. NO se toca el snapshot del canvas "Información del cliente"
 * (de los procesos) porque comparte foto con otras secciones — ahí solo se borran bloques.
 *
 * Borra:
 *   - Handoff    → CanvasBlock de los canvas "Handoff" (proyectos reales) + limpia snapshot del canvas.
 *   - Kickoff    → CanvasBlock de los canvas "Kickoff" (proyectos reales) + limpia snapshot del canvas.
 *   - Cronograma → ProjectTimeline (cascada: fases, tareas, baselines, changes, snapshot).
 *   - Procesos   → CanvasBlock "procesos" del canvas "Información del cliente" del proyecto __strategy__.
 *
 * NO borra el entity Handoff (1:1 con el proyecto): se reutiliza vacío al regenerar
 * (hasHandoff = bloques>0, no existencia del entity).
 *
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/reset-all-onboarding.ts            # dry-run (inventario, no borra)
 *   npx tsx scripts/reset-all-onboarding.ts --apply    # borra de verdad (PROD)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const SENTINEL = "__strategy__";
const INFO_CANVAS = "Información del cliente";

const APPLY = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(
    APPLY
      ? "⚠ APLICANDO reset MASIVO de TODOS los clientes…\n"
      : "DRY-RUN — reset MASIVO de TODOS los clientes (usá --apply para borrar)\n",
  );

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, projects: { select: { id: true, serviceType: true } } },
    orderBy: { name: "asc" },
  });
  if (clients.length === 0) {
    console.log("No hay clientes. Nada que hacer.");
    return;
  }

  // Todos los proyectos reales (no-sentinel) de toda la base.
  const allRealProjectIds: string[] = [];
  for (const c of clients) for (const p of c.projects) if (p.serviceType !== SENTINEL) allRealProjectIds.push(p.id);

  // ── Inventario por cliente (mismos where-clauses que el reset de 1 cliente) ──
  let tH = 0,
    tK = 0,
    tT = 0,
    tPh = 0,
    tP = 0,
    afectados = 0;

  for (const client of clients) {
    const realIds = client.projects.filter((p) => p.serviceType !== SENTINEL).map((p) => p.id);

    const [h, k, timelines, p] = await Promise.all([
      prisma.canvasBlock.count({ where: { section: { canvas: { projectId: { in: realIds }, name: "Handoff" } } } }),
      prisma.canvasBlock.count({ where: { section: { canvas: { projectId: { in: realIds }, name: "Kickoff" } } } }),
      prisma.projectTimeline.findMany({
        where: { projectId: { in: realIds } },
        select: { _count: { select: { phases: true } } },
      }),
      prisma.canvasBlock.count({
        where: {
          section: { key: "procesos", canvas: { name: INFO_CANVAS, project: { clientId: client.id, serviceType: SENTINEL } } },
        },
      }),
    ]);
    const phases = timelines.reduce((n, t) => n + t._count.phases, 0);
    tH += h;
    tK += k;
    tT += timelines.length;
    tPh += phases;
    tP += p;

    if (h || k || timelines.length || p) {
      afectados++;
      const parts: string[] = [];
      if (h) parts.push(`handoff ${h}`);
      if (k) parts.push(`kickoff ${k}`);
      if (timelines.length) parts.push(`cronograma ${timelines.length} (${phases} fases)`);
      if (p) parts.push(`procesos ${p}`);
      console.log(`• ${client.name}\n    ${parts.join(" · ")}`);
    }
  }

  // Canvas Handoff/Kickoff con snapshot publicado (lo que verá vacío el cliente externo tras el reset).
  const snapsPublicados = await prisma.projectCanvas.count({
    where: { projectId: { in: allRealProjectIds }, name: { in: ["Handoff", "Kickoff"] }, publishedSnapshotAt: { not: null } },
  });

  console.log(`\nTOTALES — ${afectados}/${clients.length} clientes con contenido:`);
  console.log(`  • Handoff:    ${tH} bloques`);
  console.log(`  • Kickoff:    ${tK} bloques`);
  console.log(`  • Cronograma: ${tT} timeline(s), ${tPh} fases (cascada: tareas/baselines/changes/snapshot)`);
  console.log(`  • Procesos:   ${tP} bloques`);
  console.log(`  • Snapshots publicados a limpiar: ${snapsPublicados} canvas Handoff/Kickoff`);

  if (!APPLY) {
    console.log("\n(DRY-RUN) Nada borrado. Re-corré con --apply para aplicar.");
    return;
  }

  console.log("\nAplicando borrado global…");
  const delHandoff = await prisma.canvasBlock.deleteMany({
    where: { section: { canvas: { projectId: { in: allRealProjectIds }, name: "Handoff" } } },
  });
  const delKickoff = await prisma.canvasBlock.deleteMany({
    where: { section: { canvas: { projectId: { in: allRealProjectIds }, name: "Kickoff" } } },
  });
  const delTimeline = await prisma.projectTimeline.deleteMany({ where: { projectId: { in: allRealProjectIds } } });
  const delProcesos = await prisma.canvasBlock.deleteMany({
    where: { section: { key: "procesos", canvas: { name: INFO_CANVAS, project: { serviceType: SENTINEL } } } },
  });
  // Re-bake: dejar los canvas Handoff/Kickoff en estado prístino (sin foto publicada ni "cambios sin subir").
  const clearedSnaps = await prisma.projectCanvas.updateMany({
    where: { projectId: { in: allRealProjectIds }, name: { in: ["Handoff", "Kickoff"] } },
    data: { publishedSnapshot: Prisma.DbNull, publishedSnapshotAt: null, contentUpdatedAt: null },
  });

  console.log("\n✓ Borrado:");
  console.log(`  • Handoff:    ${delHandoff.count} bloques`);
  console.log(`  • Kickoff:    ${delKickoff.count} bloques`);
  console.log(`  • Cronograma: ${delTimeline.count} timeline(s) (+ cascada)`);
  console.log(`  • Procesos:   ${delProcesos.count} bloques`);
  console.log(`  • Snapshots limpiados: ${clearedSnaps.count} canvas Handoff/Kickoff`);
  console.log("\nListo. Los clientes pueden regenerar handoff/kickoff/cronograma/procesos desde cero.");
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
