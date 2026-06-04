/**
 * scripts/inspect-kickoff-blocks.ts
 *
 * READ-ONLY. Lista, por sección del canvas "Kickoff" de un proyecto, los bloques
 * con su tipo/estado/source. Para los TABLE imprime los headers — sirve para
 * confirmar si el agente emitió una tabla de DATOS (p. ej. alcance) vs una de
 * COMPARACIÓN (Hoy/Con HubSpot, que el landing pinta como par contrastado).
 *
 * Uso: npx tsx scripts/inspect-kickoff-blocks.ts almotec
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
  const term = process.argv[2] ?? "almotec";
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { client: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (projects.length === 0) {
    console.log(`No hay proyecto que matchee "${term}".`);
    return;
  }

  for (const project of projects) {
    const canvas = await prisma.projectCanvas.findFirst({
      where: { projectId: project.id, name: "Kickoff" },
      select: { id: true },
    });
    const sections = canvas
      ? await prisma.canvasSection.findMany({
          where: { canvasId: canvas.id },
          orderBy: { order: "asc" },
          select: { id: true, key: true, label: true },
        })
      : [];

    let total = 0;
    let tables = 0;
    const lines: string[] = [];
    for (const s of sections) {
      const blocks = await prisma.canvasBlock.findMany({
        where: { sectionId: s.id },
        orderBy: { order: "asc" },
        select: { blockType: true, status: true, source: true, data: true },
      });
      total += blocks.length;
      lines.push(`   ## ${s.key} — ${blocks.length} bloque(s)`);
      for (const b of blocks) {
        let extra = "";
        if (b.blockType === "TABLE") {
          tables++;
          const d = (b.data ?? {}) as { headers?: unknown };
          extra = `  headers=${JSON.stringify(d?.headers ?? [])}`;
        }
        lines.push(`      - ${b.blockType} [${b.status}/${b.source}]${extra}`);
      }
    }

    console.log(`\n=== ${project.name} (cliente ${project.client?.name ?? "—"})  id=${project.id}`);
    console.log(`    canvas Kickoff: ${canvas ? "sí" : "NO"} · ${total} bloques · ${tables} TABLE`);
    if (total > 0) lines.forEach((l) => console.log(l));

    // Corridas del agente kickoff en este proyecto (cuándo se generó).
    const runs = await prisma.agentRun.findMany({
      where: { agentId: "agent-kickoff-canvas", projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, createdAt: true },
    });
    if (runs.length > 0) {
      console.log(`    corridas kickoff (${runs.length}):`);
      for (const r of runs) console.log(`      - ${r.createdAt.toISOString()}  [${r.status}]  id=${r.id}`);
    } else {
      console.log("    corridas kickoff: (ninguna)");
    }
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
