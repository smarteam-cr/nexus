/**
 * scripts/migrate-add-handoff-canvas.ts
 *
 * Aplica el canvas "Handoff" (Fase 2 del módulo externo) retroactivamente a
 * todos los proyectos que aún no lo tienen. Para proyectos nuevos no es
 * necesario — createDefaultCanvases ya lo incluye desde DEFAULT_PROJECT_CANVASES.
 *
 * Comportamiento:
 *   1. Lista todos los Project del sistema.
 *   2. Para cada uno: verifica si ya existe ProjectCanvas con name="Handoff".
 *   3. Si NO existe: crea ProjectCanvas + las 8 CanvasSection.
 *   4. Si YA existe: skip (idempotente — se puede correr múltiples veces).
 *
 * Uso:
 *   npx tsx scripts/migrate-add-handoff-canvas.ts          # dry-run
 *   npx tsx scripts/migrate-add-handoff-canvas.ts --apply  # ejecuta
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

const CANVAS_NAME = "Handoff";

// Espejo de la definición en lib/canvas/default-canvases.ts.
// Si cambia ahí, hay que reflejarlo acá (ambas listas son la fuente de verdad
// para canvases NUEVOS vs proyectos EXISTENTES — deben coincidir).
const HANDOFF_SECTIONS = [
  { key: "acuerdos_promesas",    label: "Acuerdos clave y promesas especiales" },
  { key: "alcance_contratado",   label: "¿Qué vendimos?" },
  { key: "motivacion_decision",  label: "¿Por qué vendimos? (por qué nos eligieron)" },
  { key: "dolor_principal",      label: "Dolor principal" },
  { key: "expectativas",         label: "Expectativas del cliente" },
  { key: "stakeholders_handoff", label: "Stakeholders clave" },
  { key: "estado_en_flight",     label: "Proyectos y avances en curso" },
  { key: "riesgos_banderas",     label: "Riesgos y banderas rojas" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, clientId: true },
  });
  console.log(`Proyectos totales: ${projects.length}`);

  // Para cada proyecto, ver si ya tiene canvas "Handoff"
  const projectsNeedingHandoff: typeof projects = [];
  const projectsAlreadyHaving: typeof projects = [];

  for (const p of projects) {
    const existing = await prisma.projectCanvas.findFirst({
      where: { projectId: p.id, name: CANVAS_NAME },
      select: { id: true },
    });
    if (existing) {
      projectsAlreadyHaving.push(p);
    } else {
      projectsNeedingHandoff.push(p);
    }
  }

  console.log(`  Ya tienen canvas Handoff: ${projectsAlreadyHaving.length}`);
  console.log(`  Necesitan canvas Handoff: ${projectsNeedingHandoff.length}`);

  if (projectsNeedingHandoff.length === 0) {
    console.log("\nNada que hacer — todos los proyectos ya tienen el canvas Handoff.");
    return;
  }

  // Preview de los proyectos a procesar
  console.log("\nProyectos a procesar (primeros 10):");
  for (const p of projectsNeedingHandoff.slice(0, 10)) {
    console.log(`  - ${p.name} (${p.id})`);
  }
  if (projectsNeedingHandoff.length > 10) {
    console.log(`  ... y ${projectsNeedingHandoff.length - 10} más`);
  }

  if (!apply) {
    console.log("\n⚠ Dry-run. Ejecuta con --apply para persistir cambios.");
    return;
  }

  // Aplicar — crear canvas + 8 secciones por proyecto
  let canvasesCreated = 0;
  let sectionsCreated = 0;

  for (const p of projectsNeedingHandoff) {
    const canvas = await prisma.projectCanvas.create({
      data: {
        projectId: p.id,
        name: CANVAS_NAME,
        isDefault: false,
        sections: HANDOFF_SECTIONS, // backward compat: JSON con array de {key, label}
      },
      select: { id: true },
    });
    canvasesCreated++;

    await prisma.canvasSection.createMany({
      data: HANDOFF_SECTIONS.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
    sectionsCreated += HANDOFF_SECTIONS.length;
  }

  console.log("\n─── Resumen ───");
  console.log(`Canvases creados:   ${canvasesCreated}`);
  console.log(`Secciones creadas:  ${sectionsCreated}`);
  console.log(`Proyectos saltados: ${projectsAlreadyHaving.length}`);
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
