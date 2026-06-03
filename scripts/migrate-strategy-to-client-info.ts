/**
 * scripts/migrate-strategy-to-client-info.ts
 *
 * Migra el ex "canvas de estrategia" a "Información del cliente":
 *   1. Rename Project.name "Estrategia" → "Información del cliente"
 *   2. Rename ProjectCanvas.name "Estrategia del Cliente" → "Información del cliente"
 *   3. Borra CanvasSection con key in ("handoff_ventas", "perfil_cliente")
 *      → cascade borra CanvasBlocks asociados.
 *   4. Borra ClientContextCard con canvasSection in ("handoff_ventas", "perfil_cliente")
 *      (cards que fueron enviadas al canvas estrategia con esas secciones).
 *
 * Idempotente. Dry-run por default.
 *
 * Uso:
 *   npx tsx scripts/migrate-strategy-to-client-info.ts          # dry-run
 *   npx tsx scripts/migrate-strategy-to-client-info.ts --apply  # ejecuta
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

const REMOVED_SECTION_KEYS = ["handoff_ventas", "perfil_cliente"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  // 1. Projects con serviceType=__strategy__
  const strategyProjects = await prisma.project.findMany({
    where: { serviceType: "__strategy__" },
    select: { id: true, name: true, clientId: true },
  });
  console.log(`Projects __strategy__ encontrados: ${strategyProjects.length}`);

  const projectsToRename = strategyProjects.filter((p) => p.name !== "Información del cliente");
  console.log(`  Para renombrar: ${projectsToRename.length}`);

  if (apply && projectsToRename.length > 0) {
    await prisma.project.updateMany({
      where: { id: { in: projectsToRename.map((p) => p.id) } },
      data: { name: "Información del cliente" },
    });
  }

  // 2. ProjectCanvas vinculados — rename si el name aún es "Estrategia del Cliente"
  const canvasesToRename = await prisma.projectCanvas.findMany({
    where: {
      projectId: { in: strategyProjects.map((p) => p.id) },
      name: { not: "Información del cliente" },
    },
    select: { id: true, name: true, projectId: true },
  });
  console.log(`Canvases para renombrar: ${canvasesToRename.length}`);

  if (apply && canvasesToRename.length > 0) {
    await prisma.projectCanvas.updateMany({
      where: { id: { in: canvasesToRename.map((c) => c.id) } },
      data: { name: "Información del cliente" },
    });
  }

  // 3. CanvasSection a borrar
  const sectionsToDelete = await prisma.canvasSection.findMany({
    where: {
      canvasId: { in: canvasesToRename.map((c) => c.id).concat(
        // También incluir canvases ya renombrados pero que aún tengan las
        // secciones viejas (caso re-corrida después de canvases ya migrados)
        await prisma.projectCanvas.findMany({
          where: { projectId: { in: strategyProjects.map((p) => p.id) } },
          select: { id: true },
        }).then((cs) => cs.map((c) => c.id)),
      ) },
      key: { in: REMOVED_SECTION_KEYS },
    },
    select: { id: true, key: true, label: true, canvasId: true },
  });
  console.log(`CanvasSection a borrar (handoff_ventas + perfil_cliente): ${sectionsToDelete.length}`);
  for (const s of sectionsToDelete.slice(0, 10)) {
    console.log(`  - "${s.label}" (key=${s.key})`);
  }

  if (apply && sectionsToDelete.length > 0) {
    // CanvasBlock cascade-borra cuando borramos CanvasSection (onDelete: Cascade)
    await prisma.canvasSection.deleteMany({
      where: { id: { in: sectionsToDelete.map((s) => s.id) } },
    });
  }

  // 4. ClientContextCard con canvasSection in REMOVED_SECTION_KEYS
  //    (cards que se enviaron al canvas estrategia con esas secciones específicas)
  const cardsToDelete = await prisma.clientContextCard.findMany({
    where: {
      projectId: { in: strategyProjects.map((p) => p.id) },
      canvasSection: { in: REMOVED_SECTION_KEYS },
    },
    select: { id: true, title: true, canvasSection: true },
  });
  console.log(`ClientContextCard a borrar: ${cardsToDelete.length}`);
  for (const c of cardsToDelete.slice(0, 10)) {
    console.log(`  - "${c.title.slice(0, 50)}" (section=${c.canvasSection})`);
  }

  if (apply && cardsToDelete.length > 0) {
    await prisma.clientContextCard.deleteMany({
      where: { id: { in: cardsToDelete.map((c) => c.id) } },
    });
  }

  console.log("\n─── Resumen ───");
  console.log(`Projects renombrados:      ${projectsToRename.length}`);
  console.log(`Canvases renombrados:      ${canvasesToRename.length}`);
  console.log(`Secciones eliminadas:      ${sectionsToDelete.length}`);
  console.log(`Cards eliminadas:          ${cardsToDelete.length}`);

  if (!apply) console.log("\n⚠ Dry-run. Ejecuta con --apply para persistir cambios.");
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
