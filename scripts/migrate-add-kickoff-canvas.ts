/**
 * scripts/migrate-add-kickoff-canvas.ts
 *
 * Aplica el canvas "Kickoff" (Fase A del kickoff) retroactivamente a todos los
 * proyectos que aún no lo tienen. Para proyectos nuevos no es necesario —
 * createDefaultCanvases ya lo incluye desde DEFAULT_PROJECT_CANVASES.
 *
 * Comportamiento:
 *   1. Lista todos los Project del sistema.
 *   2. Para cada uno: verifica si ya existe ProjectCanvas con name="Kickoff".
 *   3. Si NO existe: crea ProjectCanvas + las 6 CanvasSection.
 *   4. Si YA existe: skip (idempotente — se puede correr múltiples veces).
 *
 * Uso:
 *   npx tsx scripts/migrate-add-kickoff-canvas.ts          # dry-run
 *   npx tsx scripts/migrate-add-kickoff-canvas.ts --apply  # ejecuta
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

const CANVAS_NAME = "Kickoff";

// Espejo de la definición en lib/canvas/default-canvases.ts.
// Si cambia ahí, hay que reflejarlo acá (ambas listas son la fuente de verdad
// para canvases NUEVOS vs proyectos EXISTENTES — deben coincidir).
const KICKOFF_SECTIONS = [
  { key: "bienvenida",     label: "Bienvenida y contexto" },
  { key: "objetivos",      label: "Objetivos del proyecto" },
  { key: "alcance",        label: "Alcance: qué incluye" },
  { key: "tu_rol",         label: "Lo que necesitamos de tu equipo" },
  { key: "metricas_exito", label: "Cómo mediremos el éxito" },
  { key: "proximos_pasos", label: "Próximos pasos" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, clientId: true },
  });
  console.log(`Proyectos totales: ${projects.length}`);

  const projectsNeeding: typeof projects = [];
  const projectsHaving: typeof projects = [];

  for (const p of projects) {
    const existing = await prisma.projectCanvas.findFirst({
      where: { projectId: p.id, name: CANVAS_NAME },
      select: { id: true },
    });
    if (existing) projectsHaving.push(p);
    else projectsNeeding.push(p);
  }

  console.log(`  Ya tienen canvas Kickoff: ${projectsHaving.length}`);
  console.log(`  Necesitan canvas Kickoff: ${projectsNeeding.length}`);

  if (projectsNeeding.length === 0) {
    console.log("\nNada que hacer — todos los proyectos ya tienen el canvas Kickoff.");
    return;
  }

  console.log("\nProyectos a procesar (primeros 10):");
  for (const p of projectsNeeding.slice(0, 10)) {
    console.log(`  - ${p.name} (${p.id})`);
  }
  if (projectsNeeding.length > 10) {
    console.log(`  ... y ${projectsNeeding.length - 10} más`);
  }

  if (!apply) {
    console.log("\n⚠ Dry-run. Ejecuta con --apply para persistir cambios.");
    return;
  }

  let canvasesCreated = 0;
  let sectionsCreated = 0;

  for (const p of projectsNeeding) {
    const canvas = await prisma.projectCanvas.create({
      data: {
        projectId: p.id,
        name: CANVAS_NAME,
        isDefault: false,
        sections: KICKOFF_SECTIONS, // backward compat: JSON con array de {key, label}
      },
      select: { id: true },
    });
    canvasesCreated++;

    await prisma.canvasSection.createMany({
      data: KICKOFF_SECTIONS.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
    sectionsCreated += KICKOFF_SECTIONS.length;
  }

  console.log("\n─── Resumen ───");
  console.log(`Canvases creados:   ${canvasesCreated}`);
  console.log(`Secciones creadas:  ${sectionsCreated}`);
  console.log(`Proyectos saltados: ${projectsHaving.length}`);
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
