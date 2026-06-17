/**
 * scripts/migrate-roles-step1.ts — migración de DB (paso 1, raw SQL)
 *
 * Prepara la DB para el `prisma db push` del modelo nuevo de roles SIN perder data:
 *  1. Renombra TeamMember.role → area (preserva el eje de análisis).
 *  2. Agrega los valores nuevos al enum TeamRole (aditivo, seguro): VENTAS, CSL, MARKETING.
 *  3. Mueve las filas de los valores que se van a eliminar a valores válidos del set final
 *     (SALES→VENTAS, ADMIN→SUPER_ADMIN, PM→MARKETING) para que el push pueda dropear
 *     SALES/PM/ADMIN sin romper el cast.
 *
 * El refinamiento por persona (Marco→SUPER_ADMIN, Lorena→CSL, etc.) + el `area`
 * canónico los hace después `scripts/assign-team-roles.ts` (vía Prisma).
 *
 * Idempotente. Uso: npx tsx scripts/migrate-roles-step1.ts
 */
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. Rename role → area (solo si todavía existe `role`)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'TeamMember' AND column_name = 'role'
      ) THEN
        ALTER TABLE "TeamMember" RENAME COLUMN "role" TO "area";
      END IF;
    END $$;
  `);
  console.log("✓ Columna role → area (o ya estaba)");

  // 2. Agregar valores nuevos al enum (aditivo). Cada uno en su propia transacción.
  for (const v of ["VENTAS", "CSL", "MARKETING"]) {
    await pool.query(`ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS '${v}'`);
  }
  console.log("✓ Enum TeamRole: + VENTAS, CSL, MARKETING");

  // 3. Mover filas de los valores a eliminar (coarse; el script de roles refina luego)
  const moves: [string, string][] = [
    ["SALES", "VENTAS"],
    ["ADMIN", "SUPER_ADMIN"],
    ["PM", "MARKETING"],
  ];
  for (const [from, to] of moves) {
    const r = await pool.query(
      `UPDATE "TeamMember" SET "roleEnum" = '${to}' WHERE "roleEnum" = '${from}'`,
    );
    console.log(`✓ roleEnum ${from} → ${to}: ${r.rowCount} fila(s)`);
  }

  // 4. Distribución final
  const { rows } = await pool.query(
    `SELECT "roleEnum", count(*)::int AS n FROM "TeamMember" GROUP BY "roleEnum" ORDER BY "roleEnum"`,
  );
  console.log("\nDistribución roleEnum tras paso 1:", rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
