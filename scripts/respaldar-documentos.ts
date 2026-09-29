/**
 * scripts/respaldar-documentos.ts — la PRIMERA versión de cada documento que ya existe (2026-09-28).
 *
 * Las versiones (lib/canvas/versiones.ts) se toman antes de cada regeneración de acá en adelante. Los
 * documentos que ya existían no tienen ninguna: si alguien regenera uno mañana, la foto se toma igual
 * —con lo de ese momento—, pero conviene dejar YA a salvo el contenido de hoy, sobre todo el de los
 * diagnósticos viejos (su Escala es el punto de partida de la Entrega).
 *
 * Idempotente: una foto idéntica a la última no se guarda dos veces. Solo documentos de PROYECTO con
 * contenido (los de Business Case ya versionan: cada «Generar» crea un canvas nuevo).
 *
 * DRY-RUN por defecto (cuenta). Con --apply guarda.
 *   PowerShell:  npx tsx scripts/respaldar-documentos.ts
 *                $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/respaldar-documentos.ts --apply
 *
 * ⛔ Va DESPUÉS de scripts/sql/2026-09-28-versiones-de-documento.sql.
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (APPLY) assertProdWriteAllowed("scripts/respaldar-documentos.ts");
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId: { not: null }, canvasSections: { some: { blocks: { some: {} } } } },
    select: { id: true, slug: true, name: true, project: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const porPieza = new Map<string, number>();
  for (const c of canvases) porPieza.set(c.slug ?? "(custom)", (porPieza.get(c.slug ?? "(custom)") ?? 0) + 1);
  console.log(`Documentos de proyecto con contenido: ${canvases.length}`);
  for (const [p, n] of [...porPieza].sort((a, b) => b[1] - a[1])) console.log(`  ${p}: ${n}`);
  if (!APPLY) {
    console.log("\nDRY-RUN. Con --apply se guarda una versión «Respaldo inicial» de cada uno.");
    return;
  }
  let guardadas = 0;
  let iguales = 0;
  for (const c of canvases) {
    const r = await guardarVersionDelDocumento(c.id, { origen: "Respaldo inicial" });
    if (r.guardada) guardadas++;
    else if (r.motivo === "igual a la última") iguales++;
    else if (r.motivo !== "vacío") console.warn(`  ⚠ ${c.project?.name} / ${c.slug ?? c.name}: ${r.motivo}`);
  }
  console.log(`\nListo: ${guardadas} versiones guardadas, ${iguales} ya estaban respaldadas.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
