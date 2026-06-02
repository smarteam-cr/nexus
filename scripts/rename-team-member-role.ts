/**
 * Rename SQL idempotente: garantiza que la columna se llame `role` (no `legacyRole`).
 *
 * Decisión: el plan original quería renombrar `role` → `legacyRole` para marcarlo
 * deprecated, pero eso rompe 25+ archivos que la leen como `role`. Estrategia
 * revisada: el campo se queda como `role`, y `roleEnum` (nuevo) es el que se
 * usará de aquí en adelante. Cuando se cierre la deuda 🟡 (borrar `role`), se
 * eliminan ambos juntos.
 *
 * Uso: npx tsx scripts/rename-team-member-role.ts
 */
import { Pool } from "pg";
import "dotenv/config";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const check = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'TeamMember' AND column_name IN ('role', 'legacyRole')
    `);
    const cols = check.rows.map((r) => r.column_name);

    if (cols.includes("role") && !cols.includes("legacyRole")) {
      console.log("✓ La columna ya se llama 'role'. Nada que hacer.");
      return;
    }
    if (cols.includes("legacyRole") && !cols.includes("role")) {
      console.log("Renombrando TeamMember.legacyRole → TeamMember.role ...");
      await pool.query(`ALTER TABLE "TeamMember" RENAME COLUMN "legacyRole" TO "role"`);
      console.log("✓ Renombrada con éxito.");
      return;
    }
    console.log("⚠ Estado inesperado, columnas:", cols);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
