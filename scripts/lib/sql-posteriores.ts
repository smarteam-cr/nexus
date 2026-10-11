/**
 * scripts/lib/sql-posteriores.ts — los `scripts/sql/` posteriores al baseline, aplicados a una base LOCAL.
 *
 * `migrate deploy` aplica el baseline `prisma/migrations/0_init` (regenerado el 2026-08-01 y congelado ahí).
 * Todo el DDL posterior vive suelto en `scripts/sql/` y a producción se aplica a mano (ARCHITECTURE Parte 0 ·
 * cap. D). Una base local que no los tiene queda vieja en silencio, y el síntoma no señala la causa: un test
 * de integración que falla con «la columna X no existe» parece un bug del código y es una base atrasada.
 *
 * Lo usan dos caminos, con la MISMA regla de qué archivo corre:
 *   · `npm run db:local -- bootstrap` (scripts/local-db.ts), sobre nexus_local y nexus_test.
 *   · el setup global de los tests de integración (test/global-setup.integration.ts), sobre nexus_test, antes
 *     de cada `npm run test:int`: así un `.sql` nuevo no rompe las pruebas hasta que alguien se acuerde de
 *     volver a correr el bootstrap.
 *
 * Corren los `.sql` cuyo nombre empieza con una fecha POSTERIOR a la del baseline, en orden de nombre, y TIENEN
 * que ser idempotentes (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`…): se reaplican en cada corrida. Si uno
 * falla, se aborta en vez de seguir: una base a medio migrar produce fallos que parecen bugs del código. El
 * arreglo es hacer idempotente el `.sql`, no saltearlo.
 *
 * ⛔ Solo bases LOCALES (`esBaseLocal`): contra cualquier otro host lanza antes de conectar. Producción sigue
 * siendo a mano, con `ALLOW_PROD_WRITE`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describirDestino, esBaseLocal } from "./guard";

/** La fecha de `prisma/migrations/0_init`: lo de esa fecha o antes ya está en el baseline. */
export const FECHA_DEL_BASELINE = "2026-08-01";

/** Rutas relativas a la raíz (`scripts/sql/…`), en el orden en que se aplican. */
export function sqlPosterioresAlBaseline(raiz: string): string[] {
  const dir = join(raiz, "scripts", "sql");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && /^\d{4}-\d{2}-\d{2}/.test(f) && f.slice(0, 10) > FECHA_DEL_BASELINE)
    .sort()
    .map((f) => `scripts/sql/${f}`);
}

/** Aplica los `.sql` posteriores al baseline a la base LOCAL de `url`. Devuelve los que corrió. */
export async function aplicarSqlPosteriores(url: string, raiz: string): Promise<string[]> {
  if (!esBaseLocal(url)) {
    throw new Error(`Los scripts/sql solo se aplican solos a una base LOCAL; el destino es ${describirDestino(url)}.`);
  }
  const archivos = sqlPosterioresAlBaseline(raiz);
  if (archivos.length === 0) return [];
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    for (const f of archivos) {
      try {
        await c.query(readFileSync(join(raiz, f), "utf8"));
      } catch (e) {
        throw new Error(
          `${f} falló sobre ${describirDestino(url)}: ${e instanceof Error ? e.message : e}\n` +
            `Se reaplica en cada corrida, así que tiene que ser idempotente ` +
            `(ADD COLUMN IF NOT EXISTS / ADD VALUE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).`,
        );
      }
    }
  } finally {
    await c.end();
  }
  return archivos;
}
