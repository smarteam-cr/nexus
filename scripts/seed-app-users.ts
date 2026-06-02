/**
 * scripts/seed-app-users.ts
 *
 * Crea 1 AppUser (kind=INTERNAL) por cada TeamMember existente. authUserId
 * queda en null hasta que la persona haga su primer login con Google (la
 * ruta /auth/callback lo vincula leyendo email).
 *
 * Idempotente: si ya existe AppUser con ese email, lo skipea.
 *
 * Uso:
 *   npx tsx scripts/seed-app-users.ts          # dry-run
 *   npx tsx scripts/seed-app-users.ts --apply  # ejecuta
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
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const members = await prisma.teamMember.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { name: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const m of members) {
    const existing = await prisma.appUser.findUnique({
      where: { email: m.email },
      select: { id: true, kind: true, teamMemberId: true },
    });

    if (existing) {
      console.log(
        `  [skip] ${m.email} ya tiene AppUser (kind=${existing.kind}${
          existing.teamMemberId === m.id ? "" : ", teamMemberId difiere ⚠"
        })`,
      );
      skipped++;
      continue;
    }

    console.log(`  [create] ${m.email} → AppUser INTERNAL, teamMemberId=${m.id.slice(0, 8)}…`);
    if (apply) {
      await prisma.appUser.create({
        data: {
          email: m.email,
          kind: "INTERNAL",
          teamMemberId: m.id,
          authUserId: null,
          clientId: null,
        },
      });
    }
    created++;
  }

  console.log(`\n─── Resumen ───`);
  console.log(`TeamMembers:    ${members.length}`);
  console.log(`AppUser ${apply ? "creados" : "a crear"}: ${created}`);
  console.log(`Ya existían:    ${skipped}`);

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
