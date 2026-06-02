/**
 * scripts/migrate-team-member-roles.ts
 *
 * Mapea TeamMember.role (string libre) al nuevo TeamMember.roleEnum.
 * Aplica la excepción para SUPER_ADMIN según ARCHITECTURE.md.
 *
 * Mapping:
 *   "CSE"     → CSE
 *   "PM"      → PM
 *   "Sales"   → SALES
 *   "Admin"   → ADMIN
 *   "RevOps"  → CSE (decisión del usuario — no hay rol RevOps propio)
 *   resto/null → CSE (default conservador)
 *
 * Excepción: egonzalez@smarteamcr.com → SUPER_ADMIN + canViewAllClients=true
 *
 * Idempotente. Dry-run por default.
 *
 * Uso:
 *   npx tsx scripts/migrate-team-member-roles.ts          # dry-run
 *   npx tsx scripts/migrate-team-member-roles.ts --apply  # ejecuta
 */
import { PrismaClient, TeamRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SUPER_ADMIN_EMAILS = ["egonzalez@smarteamcr.com"];

function mapRole(role: string | null): TeamRole {
  switch ((role ?? "").trim().toLowerCase()) {
    case "cse":
      return "CSE";
    case "pm":
      return "PM";
    case "sales":
    case "ventas":
      return "SALES";
    case "admin":
      return "ADMIN";
    case "revops":
      return "CSE"; // sin rol propio aún
    default:
      return "CSE"; // default conservador
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const members = await prisma.teamMember.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roleEnum: true,
      canViewAllClients: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`TeamMembers encontrados: ${members.length}\n`);

  let updated = 0;
  let unchanged = 0;
  let superAdmins = 0;

  for (const m of members) {
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(m.email.toLowerCase());
    const newRole = isSuperAdmin ? "SUPER_ADMIN" : mapRole(m.role);
    const newCanViewAll = isSuperAdmin ? true : m.canViewAllClients;

    const willChange = newRole !== m.roleEnum || newCanViewAll !== m.canViewAllClients;

    const tag = isSuperAdmin ? " 👑" : "";
    console.log(
      `  ${m.email.padEnd(35)} legacy=${(m.role ?? "null").padEnd(10)} → roleEnum=${newRole}${
        newCanViewAll ? " (canViewAllClients=true)" : ""
      }${tag}${willChange ? "" : " [sin cambios]"}`,
    );

    if (!willChange) {
      unchanged++;
      continue;
    }

    if (apply) {
      await prisma.teamMember.update({
        where: { id: m.id },
        data: {
          roleEnum: newRole as TeamRole,
          canViewAllClients: newCanViewAll,
        },
      });
    }
    updated++;
    if (isSuperAdmin) superAdmins++;
  }

  console.log(`\n─── Resumen ───`);
  console.log(`Total:           ${members.length}`);
  console.log(`A actualizar:    ${updated} ${apply ? "✓" : ""}`);
  console.log(`Sin cambios:     ${unchanged}`);
  console.log(`Super Admins:    ${superAdmins}`);

  if (!apply) console.log("\n⚠ Dry-run. Ejecuta con --apply para persistir cambios.");
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
