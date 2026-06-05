/**
 * scripts/check-handoff-context.ts  (READ-ONLY)
 *
 * Verifica que el canvas "Handoff" de cada proyecto con entidad Handoff sigue
 * existiendo y con bloques — i.e. que el Kickoff lo puede leer (loadCanvasContext
 * lee por (projectId, name="Handoff"), independiente del dropdown filtrado).
 * Reporta bloques totales vs CONFIRMED (el Kickoff usa onlyConfirmed:true).
 *
 * Uso: npx tsx scripts/check-handoff-context.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const handoffs = await prisma.handoff.findMany({
    select: {
      id: true,
      projectId: true,
      hubspotDealId: true,
      hubspotSyncStatus: true,
      client: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  console.log(`Entidades Handoff: ${handoffs.length}\n`);

  for (const h of handoffs) {
    const canvas = await prisma.projectCanvas.findFirst({
      where: { projectId: h.projectId, name: "Handoff" },
      select: { id: true },
    });
    const tag = `[${h.client.name} · ${h.project.name}]`;
    if (!canvas) {
      console.log(`  ${tag}  ⚠ SIN canvas "Handoff" (el Kickoff leería "")`);
      continue;
    }
    const sections = await prisma.canvasSection.findMany({
      where: { canvasId: canvas.id },
      select: { blocks: { select: { status: true } } },
    });
    const all = sections.flatMap((s) => s.blocks);
    const confirmed = all.filter((b) => b.status === "CONFIRMED").length;
    console.log(
      `  ${tag}  canvas OK · ${all.length} bloques (${confirmed} CONFIRMED) · sync=${h.hubspotSyncStatus} · deal=${h.hubspotDealId ?? "-"}`,
    );
  }
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
