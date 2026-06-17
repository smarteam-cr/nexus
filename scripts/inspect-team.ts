/**
 * scripts/inspect-team.ts — SOLO LECTURA
 * Lista todos los TeamMembers con su roleEnum (permiso), role/area (análisis),
 * canViewAllClients y deactivatedAt. Sirve para diseñar la migración de roles.
 *
 * Uso: npx tsx scripts/inspect-team.ts
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
  const members = await prisma.teamMember.findMany({
    orderBy: { name: "asc" },
  });

  console.log(`\nTeamMembers: ${members.length}\n`);
  for (const m of members) {
    const anyM = m as Record<string, unknown>;
    console.log(
      [
        (m.name ?? "").padEnd(26),
        (m.email ?? "").padEnd(34),
        `roleEnum=${String(m.roleEnum).padEnd(12)}`,
        `role=${String(anyM.role ?? anyM.area ?? "").padEnd(14)}`,
        `canViewAll=${m.canViewAllClients}`,
      ].join("  "),
    );
  }

  // Distribución de roleEnum (para saber si SALES/PM/ADMIN están en uso)
  const dist: Record<string, number> = {};
  for (const m of members) dist[String(m.roleEnum)] = (dist[String(m.roleEnum)] ?? 0) + 1;
  console.log("\nDistribución roleEnum:", dist);
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
