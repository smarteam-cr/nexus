/**
 * scripts/verify-rls-anon.ts — READ-ONLY.
 *
 * Verifica el aislamiento anon: con la publishable key (la que viaja en el
 * bundle del browser) TODA tabla de `public` debe devolver 0 filas vía
 * PostgREST. Materializa la verificación de ARCHITECTURE.md §4.5 que hasta
 * ahora era prosa — correlo después de tocar policies o de crear una tabla
 * (Cobranza fase 4 lo exige ANTES de insertar el primer salario en
 * CostoRecurrente: RLS es la única capa que ve el anon externo).
 *
 * Uso: npx tsx scripts/verify-rls-anon.ts
 * Exit 0 = todas en 0 filas · exit 1 = alguna tabla filtra o falta config.
 */
import { createClient } from "@supabase/supabase-js";
import { createScriptPool } from "./lib/db";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!url || !anonKey || !dbUrl) {
    console.error(
      "ERROR: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / DATABASE_URL en .env",
    );
    process.exit(1);
  }

  // Lista real de tablas (rol privilegiado, solo lectura de catálogo).
  // Pool acotado (max:2) — no comerse los slots compartidos (ver scripts/lib/db.ts).
  const { pool } = createScriptPool();
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename`,
  );
  await pool.end();

  // Lectura con la publishable key: lo que vería cualquier persona con el bundle.
  const supabase = createClient(url, anonKey);
  const filtradas: string[] = [];
  for (const { tablename } of rows) {
    const { count, error } = await supabase
      .from(tablename)
      .select("*", { count: "exact", head: true });
    if (error) {
      // Denegado por RLS/permiso = el resultado esperado para el anon.
      console.log(`  ✓ ${tablename} — bloqueada (${error.code ?? "denegado"})`);
      continue;
    }
    if ((count ?? 0) > 0) {
      filtradas.push(`${tablename} (${count})`);
      console.log(`  ✗ ${tablename} — ${count} FILAS LEGIBLES POR ANON`);
    } else {
      console.log(`  ✓ ${tablename} — 0 filas`);
    }
  }

  console.log("─".repeat(60));
  if (filtradas.length > 0) {
    console.error(
      `✗ ${filtradas.length} tabla(s) filtran datos al anon: ${filtradas.join(", ")}\n` +
        "  Corré: npx tsx scripts/apply-policies.ts --apply",
    );
    process.exit(1);
  }
  console.log(`✓ Aislamiento anon OK: ${rows.length} tablas, 0 filas legibles con la publishable key.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
