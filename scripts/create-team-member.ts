/**
 * scripts/create-team-member.ts
 *
 * Alta de un miembro interno: crea (idempotente) el TeamMember (perfil + rol de permiso)
 * y su AppUser INTERNAL (vincula el login al primer Google por email; authUserId queda null
 * hasta ese primer login — ver app/auth/callback/route.ts). Sin AppUser INTERNAL el login
 * es rechazado aunque el email sea @smarteamcr.com.
 *
 * Editá NUEVO abajo y corré: npx tsx scripts/create-team-member.ts
 */
import { PrismaClient, type TeamRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const NUEVO: { name: string; email: string; area: string; roleEnum: TeamRole } = {
  name: "Jerson Escudero",
  email: "jescudero@smarteamcr.com",
  area: "CSE", // eje de análisis
  roleEnum: "CSE", // rol de permiso
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = NUEVO.email.toLowerCase();

  const member = await prisma.teamMember.upsert({
    where: { email },
    update: { name: NUEVO.name, area: NUEVO.area, roleEnum: NUEVO.roleEnum, deactivatedAt: null, deactivatedReason: null },
    create: { name: NUEVO.name, email, area: NUEVO.area, roleEnum: NUEVO.roleEnum },
    select: { id: true, name: true, email: true, area: true, roleEnum: true },
  });
  console.log(`✓ TeamMember: ${member.name} <${member.email}> · area=${member.area} · rol=${member.roleEnum}`);

  const appUser = await prisma.appUser.upsert({
    where: { email },
    update: { kind: "INTERNAL", teamMemberId: member.id },
    create: { email, kind: "INTERNAL", teamMemberId: member.id, authUserId: null, clientId: null },
    select: { id: true, kind: true, authUserId: true },
  });
  console.log(`✓ AppUser: kind=${appUser.kind} · authUserId=${appUser.authUserId ?? "(null, se vincula al primer login)"}`);

  console.log(`\nListo. ${member.name} puede entrar con Google (${member.email}).`);
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
