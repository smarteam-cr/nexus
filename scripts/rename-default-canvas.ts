/**
 * Renombra el canvas default de "Resumen del servicio" → "Resumen" para todos
 * los ProjectCanvas existentes.
 *
 * Uso: npx tsx scripts/rename-default-canvas.ts [--apply]
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
  const result = apply
    ? await prisma.projectCanvas.updateMany({
        where: { name: "Resumen del servicio", isDefault: true },
        data: { name: "Resumen" },
      })
    : await prisma.projectCanvas.findMany({
        where: { name: "Resumen del servicio", isDefault: true },
        select: { id: true, projectId: true },
      });

  if (apply) {
    console.log(`✓ Renombrados ${(result as { count: number }).count} ProjectCanvas.`);
  } else {
    const arr = result as Array<{ id: string; projectId: string }>;
    console.log(`Dry-run: ${arr.length} ProjectCanvas serían renombrados.`);
    console.log("Ejecutá con --apply para persistir.");
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
