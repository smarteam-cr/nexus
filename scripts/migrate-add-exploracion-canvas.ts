/**
 * scripts/migrate-add-exploracion-canvas.ts
 *
 * Aplica el canvas "Exploración" retroactivamente a los proyectos que aún no lo tienen.
 * Exploración pasó de ser un canvas ON-DEMAND (que nacía desde una CTA propia) a ser un
 * canvas DEFAULT de primera clase (modelo Kickoff): vive en el dropdown del proyecto y su
 * agente se corre desde el header del canvas. Los proyectos NUEVOS ya lo reciben por
 * `createDefaultCanvases` (está en DEFAULT_PROJECT_CANVASES); este script cubre los viejos.
 *
 * Comportamiento:
 *   1. Lista los Project reales (EXCLUYE los sentinel `__strategy__`, que no son proyectos
 *      de servicio y no llevan el set de canvases del proyecto).
 *   2. Para cada uno: si ya existe un ProjectCanvas name="Exploración" → skip (idempotente).
 *   3. Si no existe: crea el canvas + sus CanvasSection + siembra el bloque de las secciones
 *      CURADAS (`cierre`), igual que `createOnDemandCanvas` — sin bloque, el editor no
 *      persiste y el agente no la genera, así que quedaría muerta.
 *
 * La lista de secciones NO se duplica acá: sale de `EXPLORACION_CANVAS` (canvas-defs.ts es
 * PURO, sin Prisma → importable desde un script). Si cambia la def, este script la sigue.
 *
 * Uso:
 *   npx tsx scripts/migrate-add-exploracion-canvas.ts          # dry-run (default)
 *   npx tsx scripts/migrate-add-exploracion-canvas.ts --apply  # ejecuta
 */
import { createScriptDb } from "./lib/db";
import { EXPLORACION_CANVAS } from "../lib/canvas/canvas-defs";
import type { Prisma } from "@prisma/client";

const { prisma, pool } = createScriptDb();

const CANVAS_NAME = EXPLORACION_CANVAS.name;
/** Sentinel de estrategia por cliente — no es un proyecto de servicio. */
const STRATEGY_SENTINEL = "__strategy__";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Canvas: "${CANVAS_NAME}" (${EXPLORACION_CANVAS.sections.length} secciones)`);
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const projects = await prisma.project.findMany({
    where: { name: { not: STRATEGY_SENTINEL } },
    select: { id: true, name: true, client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Proyectos reales (sin sentinels): ${projects.length}`);

  const existing = await prisma.projectCanvas.findMany({
    where: { name: CANVAS_NAME, projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true },
  });
  const yaTienen = new Set(existing.map((c) => c.projectId));
  const faltan = projects.filter((p) => !yaTienen.has(p.id));

  console.log(`  · Ya tienen el canvas: ${yaTienen.size}`);
  console.log(`  · Les falta:           ${faltan.length}\n`);

  if (faltan.length === 0) {
    console.log("Nada que hacer — todos los proyectos ya tienen el canvas.");
    return;
  }

  for (const p of faltan.slice(0, 15)) {
    console.log(`  + ${p.client?.name ?? "(sin cliente)"} · ${p.name}`);
  }
  if (faltan.length > 15) console.log(`  … y ${faltan.length - 15} más`);

  if (!apply) {
    console.log(`\nDRY-RUN: se crearían ${faltan.length} canvases. Corré con --apply para ejecutar.`);
    return;
  }

  console.log("");
  let creados = 0;
  for (const p of faltan) {
    // Una transacción por proyecto: si algo falla, ese proyecto no queda a medias
    // (canvas sin secciones) y los ya creados se conservan — re-correr completa el resto.
    await prisma.$transaction(async (tx) => {
      const canvas = await tx.projectCanvas.create({
        data: {
          projectId: p.id,
          name: EXPLORACION_CANVAS.name,
          isDefault: EXPLORACION_CANVAS.isDefault,
          order: EXPLORACION_CANVAS.order,
          sections: EXPLORACION_CANVAS.sections as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      await tx.canvasSection.createMany({
        data: EXPLORACION_CANVAS.sections.map((s, i) => ({
          canvasId: canvas.id,
          key: s.key,
          label: s.label,
          order: i,
        })),
      });

      // Secciones CURADAS (`cierre`): sembrar su bloque con la data default.
      const curated = EXPLORACION_CANVAS.sections.filter((s) => s.defaultData);
      if (curated.length) {
        const rows = await tx.canvasSection.findMany({
          where: { canvasId: canvas.id, key: { in: curated.map((s) => s.key) } },
          select: { id: true, key: true },
        });
        const dataByKey = new Map(curated.map((s) => [s.key, s.defaultData]));
        await tx.canvasBlock.createMany({
          data: rows.map((s) => ({
            sectionId: s.id,
            blockType: "CARD" as const,
            content: null,
            data: (dataByKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
            order: 0,
            source: "HUMAN" as const,
            status: "CONFIRMED" as const,
          })),
        });
      }
    });
    creados++;
    if (creados % 20 === 0) console.log(`  … ${creados}/${faltan.length}`);
  }

  console.log(`\n✓ Listo — ${creados} canvases "${CANVAS_NAME}" creados.`);
}

main()
  .catch((e) => {
    console.error("✗ Falló la migración:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
