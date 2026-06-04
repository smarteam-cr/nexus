/**
 * scripts/migrate-canvas-reorg.ts
 *
 * Alinea los canvases de cada proyecto al nuevo set/orden:
 *   Handoff(0, default) · Kickoff(1) · Diagnóstico(2) · Planificación(3) · Cronograma(4)
 *
 * - Setea `order` + `isDefault` (solo Handoff) en los canvases que quedan.
 * - CREA "Cronograma" (order 4, sin secciones) si falta.
 * - BORRA los canvases "Ejecución", "Adopción" y "Resumen".
 * - Limpia las cards legacy del Resumen que NO son "procesos" (objetivo_alcance,
 *   hipotesis_recomendaciones, plan_implementacion) — el usuario decidió descartarlas.
 *
 * ⚠ ORDEN: correr `migrate-procesos-to-blocks.ts` ANTES, para preservar la sección
 * "procesos" del Resumen (esto solo descarta las otras 3 secciones).
 *
 * Idempotente. Uso:
 *   npx tsx scripts/migrate-canvas-reorg.ts           # dry-run
 *   npx tsx scripts/migrate-canvas-reorg.ts --apply   # aplica
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

// name → order. isDefault = solo Kickoff (ancla estable; Handoff migra a nivel cliente).
const TARGET_ORDER: Record<string, number> = {
  Handoff: 0,
  Kickoff: 1,
  Diagnóstico: 2,
  Planificación: 3,
  Cronograma: 4,
};
const CANVASES_TO_DELETE = ["Ejecución", "Adopción", "Resumen"];
// Secciones de cards del Resumen que se descartan (procesos se migra aparte).
const DISCARD_CARD_SECTIONS = ["objetivo_alcance", "hipotesis_recomendaciones", "plan_implementacion"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (--apply para ejecutar)"}\n`);

  const allProjects = await prisma.project.findMany({ select: { id: true, name: true, serviceType: true } });
  // Excluir los proyectos sentinel "Información del cliente" (__strategy__): no son
  // de onboarding, no llevan Cronograma ni el set de canvases de proyecto.
  const projects = allProjects.filter((p) => p.serviceType !== "__strategy__");
  console.log(`Proyectos de onboarding: ${projects.length} (de ${allProjects.length} totales)\n`);

  let deletedCanvases = 0;
  let reordered = 0;
  let createdCronograma = 0;

  for (const p of projects) {
    const canvases = await prisma.projectCanvas.findMany({
      where: { projectId: p.id },
      select: { id: true, name: true, order: true, isDefault: true },
    });

    // 1) Borrar Ejecución / Adopción / Resumen (sus CanvasSection/CanvasBlock van por cascade).
    for (const c of canvases.filter((c) => CANVASES_TO_DELETE.includes(c.name))) {
      console.log(`  [${p.name}] borrar canvas "${c.name}"`);
      if (apply) {
        // Desvincular cards que apunten directo a este canvas (evita FK), por las dudas.
        await prisma.clientContextCard.updateMany({ where: { canvasId: c.id }, data: { canvasId: null } });
        await prisma.projectCanvas.delete({ where: { id: c.id } });
      }
      deletedCanvases++;
    }

    // 2) Reordenar + isDefault los que quedan en el set objetivo.
    for (const c of canvases.filter((c) => c.name in TARGET_ORDER)) {
      const order = TARGET_ORDER[c.name];
      const isDefault = c.name === "Kickoff";
      if (c.order !== order || c.isDefault !== isDefault) {
        if (apply) await prisma.projectCanvas.update({ where: { id: c.id }, data: { order, isDefault } });
        reordered++;
      }
    }

    // 3) Crear Cronograma si falta.
    if (!canvases.some((c) => c.name === "Cronograma")) {
      console.log(`  [${p.name}] crear canvas "Cronograma"`);
      if (apply) {
        await prisma.projectCanvas.create({
          data: { projectId: p.id, name: "Cronograma", isDefault: false, order: 4, sections: [] },
        });
      }
      createdCronograma++;
    }
  }

  // 4) Descartar las cards legacy del Resumen que no son "procesos" (canvasId queda null tras borrar el canvas).
  const discardWhere = { canvasSection: { in: DISCARD_CARD_SECTIONS } };
  const grouped = await prisma.clientContextCard.groupBy({
    by: ["canvasSection", "canvasStatus"],
    where: discardWhere,
    _count: { _all: true },
  });
  const toDiscard = grouped.reduce((n, g) => n + g._count._all, 0);
  console.log(`\nCards legacy a descartar (por sección · estado):`);
  for (const g of [...grouped].sort((a, b) => (a.canvasSection ?? "").localeCompare(b.canvasSection ?? ""))) {
    console.log(`  - ${g.canvasSection} / ${g.canvasStatus}: ${g._count._all}`);
  }
  console.log(`  TOTAL a descartar: ${toDiscard}`);
  if (apply && toDiscard > 0) {
    const res = await prisma.clientContextCard.deleteMany({ where: discardWhere });
    console.log(`  ✓ borradas: ${res.count}`);
  }

  console.log(
    `\n${apply ? "Aplicado" : "Se aplicaría"}: ${deletedCanvases} canvases borrados, ${reordered} reordenados, ${createdCronograma} Cronograma creados, ${toDiscard} cards descartadas.`,
  );
  if (!apply) console.log("⚠ Dry-run. Re-correr con --apply (y correr migrate-procesos-to-blocks ANTES).");
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
