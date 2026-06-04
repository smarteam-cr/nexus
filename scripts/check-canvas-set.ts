/**
 * scripts/check-canvas-set.ts  (READ-ONLY)
 * Lista los canvases (orden + isDefault) de los proyectos que matchean un término.
 * Uso: npx tsx scripts/check-canvas-set.ts almotec
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
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
    select: {
      id: true,
      name: true,
      serviceType: true,
      canvases: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { name: true, order: true, isDefault: true },
      },
    },
  });
  for (const p of projects) {
    const tag = p.serviceType === "__strategy__" ? " (Información del cliente)" : "";
    console.log(`\n${p.name}${tag}:`);
    for (const c of p.canvases) {
      console.log(`  ${c.order}  ${c.name}${c.isDefault ? "  [default]" : ""}`);
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
