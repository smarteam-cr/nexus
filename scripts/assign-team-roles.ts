/**
 * scripts/assign-team-roles.ts
 *
 * Asigna el roleEnum (PERMISO) y el area (ANÁLISIS) del equipo activo según la
 * matriz aprobada. Reemplaza al viejo migrate-team-member-roles.ts.
 *
 *   roleEnum (permiso): CSE | VENTAS | CSL | MARKETING | SUPER_ADMIN
 *   area (análisis):    Ventas | CSE | CSL | Marketing | Development | RevOps | Admin
 *
 * Caso Marco Salas: roleEnum=SUPER_ADMIN pero area=Ventas (para que el análisis
 * de sesiones lo siga entendiendo como Ventas).
 *
 * Dry-run por default. Aplicar con: npx tsx scripts/assign-team-roles.ts --apply
 */
import { PrismaClient, type TeamRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

const ASSIGNMENTS: Record<string, { roleEnum: TeamRole; area: string }> = {
  "egonzalez@smarteamcr.com": { roleEnum: "SUPER_ADMIN", area: "RevOps" },
  "msalas@smarteamcr.com":    { roleEnum: "SUPER_ADMIN", area: "Ventas" },
  "aarrieta@smarteamcr.com":  { roleEnum: "SUPER_ADMIN", area: "Admin" },
  "losorio@smarteamcr.com":   { roleEnum: "CSL",         area: "CSE" },
  "apinzon@smarteamcr.com":   { roleEnum: "VENTAS",      area: "Ventas" },
  "fsepulveda@smarteamcr.com":{ roleEnum: "CSE",         area: "CSE" },
  "hgomez@smarteamcr.com":    { roleEnum: "CSE",         area: "CSE" },
  "jarmijos@smarteamcr.com":  { roleEnum: "CSE",         area: "CSE" },
  "aortega@smarteamcr.com":   { roleEnum: "MARKETING",   area: "Marketing" },
  "lflores@smarteamcr.com":   { roleEnum: "MARKETING",   area: "Marketing" },
  "arodriguez@smarteamcr.com":{ roleEnum: "CSE",         area: "Development" },
  "asalas@smarteamcr.com":    { roleEnum: "CSE",         area: "Development" },
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO asignaciones de rol…\n" : "DRY-RUN (usá --apply para escribir)\n");

  const members = await prisma.teamMember.findMany({
    select: { id: true, name: true, email: true, roleEnum: true, area: true },
    orderBy: { name: "asc" },
  });

  let changed = 0;
  for (const m of members) {
    const target = ASSIGNMENTS[m.email];
    if (!target) {
      console.log(`  (sin mapeo) ${m.name.padEnd(24)} <${m.email}>  roleEnum=${m.roleEnum} area=${m.area ?? "—"}`);
      continue;
    }
    const willChange = m.roleEnum !== target.roleEnum || m.area !== target.area;
    const mark = willChange ? "✗" : "•";
    console.log(
      `${mark} ${m.name.padEnd(24)} <${m.email}>  roleEnum: ${String(m.roleEnum).padEnd(11)} → ${target.roleEnum.padEnd(11)}  area: ${String(m.area ?? "—").padEnd(12)} → ${target.area}`,
    );
    if (willChange && APPLY) {
      await prisma.teamMember.update({
        where: { id: m.id },
        data: { roleEnum: target.roleEnum, area: target.area },
      });
      changed++;
    } else if (willChange) {
      changed++;
    }
  }

  console.log(`\n${changed} cambio(s) ${APPLY ? "aplicados" : "pendientes"}.`);

  // Distribución final de roleEnum
  const all = await prisma.teamMember.findMany({ select: { roleEnum: true, deactivatedAt: true } });
  const dist: Record<string, number> = {};
  for (const m of all) if (!m.deactivatedAt) dist[m.roleEnum] = (dist[m.roleEnum] ?? 0) + 1;
  console.log("Distribución roleEnum (activos):", dist);
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
