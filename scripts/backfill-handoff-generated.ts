/**
 * scripts/backfill-handoff-generated.ts
 *
 * Sella `Project.handoffGeneratedAt` en los proyectos cuyo canvas "Handoff" YA tiene
 * bloques (= el agente de handoff corrió antes de este cambio). Es la compuerta del
 * ciclo de vida: sin este sello, el portal CS muestra "handoff sin generar".
 *
 * La fecha del sello = createdAt del bloque más reciente del canvas Handoff (proxy de
 * "cuándo se generó el contenido"); fallback al updatedAt del canvas. NUNCA pisa un
 * sello existente (filtra handoffGeneratedAt: null). Aditivo y seguro.
 *
 * Dry-run (default):  npx tsx scripts/backfill-handoff-generated.ts
 * Aplicar:            npx tsx scripts/backfill-handoff-generated.ts --apply
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

const APPLY = process.argv.includes("--apply");
const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log(APPLY ? "── MODO APPLY (escribe en PROD) ──\n" : "── DRY-RUN (no escribe; usá --apply) ──\n");

  // Proyectos sin sello, con un canvas "Handoff" que tenga al menos un bloque.
  const projects = await prisma.project.findMany({
    where: {
      handoffGeneratedAt: null,
      canvases: { some: { name: "Handoff", canvasSections: { some: { blocks: { some: {} } } } } },
    },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
      canvases: {
        where: { name: "Handoff" },
        select: {
          updatedAt: true,
          canvasSections: {
            select: { blocks: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
          },
        },
      },
    },
    orderBy: [{ client: { name: "asc" } }, { createdAt: "asc" }],
  });

  console.log(`Proyectos con handoff generado y SIN sellar: ${projects.length}\n`);

  let sealed = 0;
  for (const p of projects) {
    const canvas = p.canvases[0];
    if (!canvas) continue;
    // Bloque más reciente entre todas las secciones del canvas Handoff.
    const blockDates = canvas.canvasSections.flatMap((s) => s.blocks.map((b) => b.createdAt));
    const stamp = blockDates.length
      ? blockDates.reduce((max, d) => (d > max ? d : max), blockDates[0])
      : canvas.updatedAt;

    console.log(`  ${APPLY ? "✓" : "→"}  ${p.client?.name ?? "?"} / ${p.name} — handoffGeneratedAt = ${day(stamp)}`);
    if (APPLY) {
      await prisma.project.update({ where: { id: p.id }, data: { handoffGeneratedAt: stamp } });
    }
    sealed++;
  }

  console.log(`\nResumen: ${sealed} proyectos ${APPLY ? "sellados" : "a sellar"}.`);
  if (!APPLY && sealed > 0) console.log("Re-corré con --apply para escribir.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
