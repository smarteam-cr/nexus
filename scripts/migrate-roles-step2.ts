/**
 * scripts/migrate-roles-step2.ts — migración de DB (paso 2, raw SQL)
 *
 * `prisma db push` falla al recrear el enum (dropear PM/SALES/ADMIN) porque su
 * orden de pasos referencia la columna nueva ClientAssignment.targetRole antes
 * de crearla. Acá hacemos la transición en el orden correcto y de forma idempotente:
 *  1. Columnas nuevas de TeamMember (deactivatedAt/Reason).
 *  2. ClientAssignment: teamMemberId nullable + targetRole (con el enum aún viejo) +
 *     ajustar unique/index.
 *  3. Recrear el enum TeamRole con los 5 valores finales, casteando roleEnum y
 *     targetRole (guarded: solo si todavía tiene PM/SALES/ADMIN).
 *
 * Tras esto, `prisma db push` debe reportar "already in sync".
 * Uso: npx tsx scripts/migrate-roles-step2.ts
 */
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. Columnas nuevas de TeamMember
  await pool.query(`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamp(3)`);
  await pool.query(`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "deactivatedReason" text`);
  console.log("✓ TeamMember.deactivatedAt / deactivatedReason");

  // 2. ClientAssignment: target del compartir (tabla vacía → seguro)
  await pool.query(`ALTER TABLE "ClientAssignment" ALTER COLUMN "teamMemberId" DROP NOT NULL`);
  await pool.query(`ALTER TABLE "ClientAssignment" ADD COLUMN IF NOT EXISTS "targetRole" "TeamRole"`);
  await pool.query(`ALTER TABLE "ClientAssignment" DROP CONSTRAINT IF EXISTS "ClientAssignment_clientId_teamMemberId_key"`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ClientAssignment_clientId_teamMemberId_targetRole_key" ON "ClientAssignment" ("clientId","teamMemberId","targetRole")`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS "ClientAssignment_clientId_idx" ON "ClientAssignment" ("clientId")`);
  console.log("✓ ClientAssignment: teamMemberId nullable + targetRole + unique/index");

  // 3. Recrear enum con 5 valores finales (solo si todavía tiene los viejos)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'TeamRole' AND e.enumlabel IN ('PM','SALES','ADMIN')
      ) THEN
        ALTER TYPE "TeamRole" RENAME TO "TeamRole_old";
        CREATE TYPE "TeamRole" AS ENUM ('CSE','VENTAS','CSL','MARKETING','SUPER_ADMIN');
        ALTER TABLE "TeamMember" ALTER COLUMN "roleEnum" DROP DEFAULT;
        ALTER TABLE "TeamMember" ALTER COLUMN "roleEnum" TYPE "TeamRole" USING ("roleEnum"::text::"TeamRole");
        ALTER TABLE "TeamMember" ALTER COLUMN "roleEnum" SET DEFAULT 'CSE';
        ALTER TABLE "ClientAssignment" ALTER COLUMN "targetRole" TYPE "TeamRole" USING ("targetRole"::text::"TeamRole");
        DROP TYPE "TeamRole_old";
      END IF;
    END $$;
  `);
  console.log("✓ Enum TeamRole recreado con 5 valores (CSE, VENTAS, CSL, MARKETING, SUPER_ADMIN)");

  const { rows } = await pool.query(
    `SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='TeamRole' ORDER BY e.enumsortorder`,
  );
  console.log("\nValores finales del enum:", rows.map((r) => r.value).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
