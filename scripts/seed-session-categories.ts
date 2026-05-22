/**
 * scripts/seed-session-categories.ts
 *
 * Crea las SessionCategory default. Idempotente — se puede correr múltiples veces.
 *
 * Default semilla:
 *   - "Interna" (smarteamcr.com) — categoría que NO se puede eliminar
 *
 * El resto de categorías (Partner HubSpot, Partner AtomChat, etc.) se crean
 * desde la UI admin en /sessions/categories.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/seed-session-categories.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULTS = [
  {
    name: "Interna",
    slug: "interna",
    domains: ["smarteamcr.com"],
    kind: "internal",
    color: "#94A3B8",
    order: 100, // alto para que aparezca después de Clientes/Empresas
    isDefault: true,
  },
];

async function main() {
  console.log("🌱 Seeding SessionCategory defaults...\n");

  for (const cat of DEFAULTS) {
    const existing = await prisma.sessionCategory.findUnique({
      where: { slug: cat.slug },
    });

    if (existing) {
      // Update controlado: solo refresh de campos seguros, NO sobreescribir domains
      // (el user podría haberlos editado desde la UI)
      await prisma.sessionCategory.update({
        where: { slug: cat.slug },
        data: {
          name: cat.name,
          kind: cat.kind,
          isDefault: cat.isDefault,
        },
      });
      console.log(`  ↻ "${cat.name}" ya existe (slug: ${cat.slug}) — refrescado.`);
    } else {
      const created = await prisma.sessionCategory.create({ data: cat });
      console.log(`  ✓ "${cat.name}" creada (id: ${created.id})`);
      console.log(`    Dominios: ${cat.domains.join(", ")}`);
    }
  }

  const total = await prisma.sessionCategory.count();
  console.log(`\nTotal SessionCategory en BD: ${total}`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
