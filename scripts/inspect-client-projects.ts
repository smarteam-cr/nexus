/**
 * scripts/inspect-client-projects.ts  (READ-ONLY)
 * Inspecciona los proyectos de un cliente: origen (HubSpot service id), tipo,
 * pipeline, fecha, handoff y contenido. Útil para entender por qué aparecen
 * ciertas pestañas en el workspace.
 * Uso: npx tsx scripts/inspect-client-projects.ts spectrum
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const term = process.argv[2] ?? "spectrum";
  const projects = await prisma.project.findMany({
    where: { client: { name: { contains: term, mode: "insensitive" } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, status: true, serviceType: true,
      hubspotServiceId: true, hubspotPipelineName: true, createdAt: true,
      handoff: { select: { id: true } },
      _count: { select: { canvases: true, agentRuns: true } },
    },
  });
  console.log(`\n══ ${term}: ${projects.length} proyecto(s) (= pestañas de proyecto) ══\n`);
  for (const p of projects) {
    console.log(`▸ ${p.name}  [${p.id}]`);
    console.log(`    origen:  ${p.hubspotServiceId ? `HubSpot service ${p.hubspotServiceId}` : "creado en Nexus (sin sync)"}`);
    console.log(`    tipo:    ${p.serviceType ?? "—"}   pipeline: ${p.hubspotPipelineName ?? "—"}   status: ${p.status}`);
    console.log(`    creado:  ${p.createdAt.toISOString().slice(0, 10)}   handoff: ${p.handoff ? "sí" : "no"}   canvases: ${p._count.canvases}   runs: ${p._count.agentRuns}\n`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
