/**
 * scripts/migrate-create-handoff-entities.ts
 *
 * Crea la entidad Handoff (1:N por cliente, 1:1 con Project) para los proyectos que
 * YA tienen un canvas "Handoff" con contenido (bloques). El contenido sigue viviendo
 * en el canvas — la entidad solo lo "registra" a nivel cliente y guarda el deal ancla.
 *
 * Criterio: ProjectCanvas name="Handoff" con >=1 CanvasBlock (vía sus secciones).
 * Excluye proyectos sentinel __strategy__. Idempotente (1 Handoff por projectId @unique).
 * hubspotDealId se hereda de project.hubspotDealId (deal ancla) si está.
 *
 * Uso:
 *   npx tsx scripts/migrate-create-handoff-entities.ts           # dry-run
 *   npx tsx scripts/migrate-create-handoff-entities.ts --apply   # aplica
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

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (--apply para ejecutar)"}\n`);

  const handoffCanvases = await prisma.projectCanvas.findMany({
    where: { name: "Handoff" },
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          id: true,
          name: true,
          clientId: true,
          serviceType: true,
          hubspotDealId: true,
          client: { select: { name: true } },
        },
      },
      canvasSections: { select: { _count: { select: { blocks: true } } } },
    },
  });

  // Solo canvases con bloques y proyectos NO sentinel (__strategy__).
  const withContent = handoffCanvases
    .map((c) => ({
      ...c,
      blockCount: c.canvasSections.reduce((n, s) => n + s._count.blocks, 0),
    }))
    .filter((c) => c.blockCount > 0 && c.project != null && c.project.serviceType !== "__strategy__");

  console.log(
    `Canvases "Handoff": ${handoffCanvases.length} totales; ${withContent.length} con contenido (no-sentinel).\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of withContent) {
    if (!c.project || !c.projectId) continue; // canvas de business case (sin proyecto)
    const tag = `[${c.project.client.name} · ${c.project.name}]`;
    const existing = await prisma.handoff.findUnique({
      where: { projectId: c.projectId },
      select: { id: true },
    });
    if (existing) {
      console.log(`  ${tag} ya tiene Handoff (skip) - ${c.blockCount} bloques`);
      skipped++;
      continue;
    }
    console.log(`  ${tag} crear Handoff - ${c.blockCount} bloques, deal=${c.project.hubspotDealId ?? "-"}`);
    if (apply) {
      try {
        await prisma.handoff.create({
          data: {
            clientId: c.project.clientId,
            projectId: c.projectId,
            hubspotDealId: c.project.hubspotDealId ?? null,
            hubspotSyncStatus: "pending",
          },
        });
      } catch (e) {
        console.error(`    ! fallo creando Handoff para ${tag}:`, e instanceof Error ? e.message : e);
        failed++;
        continue;
      }
    }
    created++;
  }

  console.log(
    `\n${apply ? "Aplicado" : "Se aplicaría"}: ${created} Handoff creados, ${skipped} ya existían${
      failed ? `, ${failed} fallaron` : ""
    }.`,
  );
  if (!apply) console.log("⚠ Dry-run. Re-correr con --apply.");
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
