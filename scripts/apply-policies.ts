/**
 * scripts/apply-policies.ts
 *
 * Aplica prisma/policies.sql (RLS en todas las tablas de `public` + extensión
 * pgvector + columna embedding + policy RESTRICTIVE de HubspotAccount) contra la
 * base apuntada por DATABASE_URL. Idempotente.
 *
 * Correr DESPUÉS de aplicar el schema (bootstrap de un proyecto Supabase nuevo:
 * prisma/migrations/0_init + su after.sql), o como hardening del actual. Versiona lo
 * que vivía como SQL ad-hoc en la consola + ARCHITECTURE.md §4.5.
 *
 * Uso:
 *   npx tsx scripts/apply-policies.ts                     # dry-run: imprime el SQL, no ejecuta
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/apply-policies.ts --apply   # ejecuta contra DATABASE_URL
 *   ALLOW_PROD_WRITE=1 npm run db:policies                # = --apply (el guard exige la variable)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptPool } from "./lib/db";
import { resolverApply } from "./lib/guard";

async function main() {
  const apply = resolverApply();
  const sqlPath = join(process.cwd(), "prisma", "policies.sql");
  const sql = readFileSync(sqlPath, "utf8");

  if (!apply) {
    console.log("DRY-RUN — no se ejecuta nada. Pasá --apply para aplicar.\n");
    console.log(`Archivo: ${sqlPath}`);
    console.log("─".repeat(72));
    console.log(sql);
    return;
  }

  // Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
  const { pool } = createScriptPool();
  const url = process.env.DATABASE_URL!;

  try {
    console.log(`Aplicando prisma/policies.sql a ${new URL(url).host} ...`);
    await pool.query(sql);
    console.log("✓ Policies aplicadas (idempotente).");

    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
          AND NOT rowsecurity
        ORDER BY tablename`,
    );
    if (rows.length === 0) {
      console.log("✓ Verificación: todas las tablas de public tienen RLS habilitado.");
    } else {
      console.warn(
        `⚠ ${rows.length} tabla(s) SIN RLS: ${rows.map((r) => r.tablename).join(", ")}`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
