/** Inspecciona (read-only) los tipos de nodo/edge de los procesos de un cliente. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const NAME = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "wherex";
const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: NAME, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Sin cliente "${NAME}"`); return; }
  const blocks = await prisma.canvasBlock.findMany({
    where: { section: { key: "procesos", canvas: { name: "Información del cliente", project: { serviceType: "__strategy__", clientId: client.id } } } },
    select: { content: true, data: true }, orderBy: { order: "asc" },
  });
  console.log(`${client.name}: ${blocks.length} procesos\n`);
  for (const b of blocks) {
    const d = b.data as { nodes?: Array<{ type?: string }>; edges?: unknown[] } | null;
    const types = (d?.nodes ?? []).map((n) => n.type ?? "?");
    const counts: Record<string, number> = {};
    types.forEach((t) => (counts[t] = (counts[t] ?? 0) + 1));
    const hasSystem = types.includes("system");
    console.log(`• "${b.content}"`);
    console.log(`    nodos=${types.length} edges=${(d?.edges ?? []).length} · tipos: ${JSON.stringify(counts)} · ${hasSystem ? "SYSTEM ✓ (renderer integración)" : "clásico/pipeline"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
