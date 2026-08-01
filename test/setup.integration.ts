/**
 * test/setup.integration.ts — el setup del project `integration` de vitest.
 *
 * Declarado en vitest.config.ts desde julio 2026 y VACÍO hasta el 2026-08-01 (F4):
 * `npm run test:int` no corría nada. Ahora:
 *
 *   1. Carga `.env.test` con OVERRIDE (pisa el DATABASE_URL de `.env`, que es PRODUCCIÓN).
 *   2. FAIL-CLOSED: si el host resultante es Supabase o la URL falta → ABORTA. Estos tests
 *      TRUNCAN todas las tablas antes de cada caso; correr eso contra prod sería el
 *      incidente terminal. La verificación usa el mismo `esHostProduccion` del guard.
 *   3. `beforeEach`: TRUNCATE de todas las tablas de `public` (menos `_prisma_migrations`),
 *      RESTART IDENTITY CASCADE → cada test arranca con la base VACÍA y siembra lo suyo.
 *      Por eso `fileParallelism: false`: los archivos comparten la base.
 *
 * La base la provee `npm run db:local` (bootstrap crea `nexus_test` con el schema completo).
 * Si no está levantada, el primer connect falla con ECONNREFUSED y el mensaje de abajo.
 */
import { config } from "dotenv";
import { afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { esHostProduccion, describirDestino } from "../scripts/lib/guard";

config({ path: ".env.test", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("[integration] .env.test no cargó DATABASE_URL — no corro nada.");
}
if (esHostProduccion(url)) {
  throw new Error(
    `[integration] DATABASE_URL apunta a ${describirDestino(url)} — eso es PRODUCCIÓN y estos ` +
      "tests TRUNCAN tablas. Revisá .env.test (debe ser el Postgres local de npm run db:local).",
  );
}

let tablas: string[] | null = null;
const cliente = new Client({ connectionString: url });
const conectado = cliente
  .connect()
  .then(() => {})
  .catch((e: Error) => {
    throw new Error(
      `[integration] no pude conectar a ${describirDestino(url)}: ${e.message}\n` +
        "¿Está levantada la base local? → npm run db:local -- up (y bootstrap si es nueva)",
    );
  });

beforeEach(async () => {
  await conectado;
  if (!tablas) {
    const { rows } = await cliente.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    tablas = rows.map((r) => `"${r.tablename}"`);
  }
  if (tablas.length > 0) {
    await cliente.query(`TRUNCATE TABLE ${tablas.join(", ")} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await cliente.end().catch(() => {});
});
