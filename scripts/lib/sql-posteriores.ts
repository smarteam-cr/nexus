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
 * Corren los `.sql` cuyo nombre empieza con una fecha POSTERIOR a la del baseline, en orden de nombre y en pasadas
 * (lo que falla porque su tabla todavía no existe se reintenta después: `lib/db/sql-en-pasadas.ts`), y TIENEN que
 * ser idempotentes (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`…): se reaplican en cada corrida. Si una pasada no
 * aplica ninguno de los que quedan, se aborta: una base a medio migrar produce fallos que parecen bugs del código.
 * El arreglo es hacer idempotente el `.sql`, no saltearlo.
 *
 * Cada archivo que corre queda ANOTADO en el registro de esa base (`SqlAplicado`, lib/db/registro-de-sql.ts), con su
 * huella y `desde` = la máquina y el comando (`db:local bootstrap`, `test:int`): la base local también dice qué tiene.
 * En una base que todavía no tiene la tabla, los que corren antes de `2026-11-23-registro-de-sql.sql` se anotan al
 * final, cuando ya existe. Con un `.sql` que falla, se anotan los que sí corrieron.
 *
 * ⛔ Solo bases LOCALES (`esBaseLocal`): contra cualquier otro host lanza antes de conectar. Producción va por
 * `npm run db:sql` (scripts/aplicar-sql.ts), con `ALLOW_PROD_WRITE`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describirDestino, esBaseLocal } from "./guard";
import { aplicarEnPasadas, ErrorDeSqlEnPasadas } from "../../lib/db/sql-en-pasadas";
import { FECHA_DEL_BASELINE, esPosteriorAlBaseline, huellaDeSql } from "../../lib/db/registro-de-sql";
import { anotar, desdeEstaMaquina, existeElRegistro } from "../../lib/db/registro-de-sql-base";

/** La fecha de `prisma/migrations/0_init` (vive en lib/db/registro-de-sql.ts, con la regla de qué es posterior). */
export { FECHA_DEL_BASELINE };

/** Rutas relativas a la raíz (`scripts/sql/…`), en el orden en que se aplican. */
export function sqlPosterioresAlBaseline(raiz: string): string[] {
  const dir = join(raiz, "scripts", "sql");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(esPosteriorAlBaseline)
    .sort()
    .map((f) => `scripts/sql/${f}`);
}

/**
 * Aplica los `.sql` posteriores al baseline a la base LOCAL de `url` y los anota en su registro. Devuelve los que
 * corrió. `comando` va a la columna `desde` (con el nombre de la máquina).
 */
export async function aplicarSqlPosteriores(url: string, raiz: string, comando = "scripts/sql posteriores"): Promise<string[]> {
  if (!esBaseLocal(url)) {
    throw new Error(`Los scripts/sql solo se aplican solos a una base LOCAL; el destino es ${describirDestino(url)}.`);
  }
  const archivos = sqlPosterioresAlBaseline(raiz);
  if (archivos.length === 0) return [];
  const c = new Client({ connectionString: url });
  await c.connect();
  /** Lo que corrió, con el texto que corrió: se anota al final, haya fallado otro o no. */
  const corridos: Array<{ archivo: string; huella: string }> = [];
  /** Si la base no tiene la tabla (el `.sql` del registro no corrió o falló), no hay dónde anotar: es una base vieja. */
  const anotarLoCorrido = async () => {
    if (corridos.length > 0 && (await existeElRegistro(c))) {
      await anotar(c, corridos, { desde: desdeEstaMaquina(comando), como: "aplicado", pisar: true });
    }
  };
  try {
    // En pasadas: el orden de nombre no siempre respeta las dependencias (lib/db/sql-en-pasadas.ts).
    const { aplicados } = await aplicarEnPasadas(archivos, async (f) => {
      const texto = readFileSync(join(raiz, f), "utf8");
      try {
        await c.query(texto);
        corridos.push({ archivo: f.replace(/^scripts\/sql\//, ""), huella: huellaDeSql(texto) });
      } catch (e) {
        // Un archivo con su propio BEGIN que falla deja la conexión en una transacción abortada, y todo lo que sigue
        // fallaría con «current transaction is aborted» en vez de su error real. Sin transacción abierta, el ROLLBACK
        // solo avisa: no falla.
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
    await anotarLoCorrido();
    return aplicados;
  } catch (e) {
    // Con un `.sql` que falló igual se anota lo que sí corrió. Si anotar también falla, manda el error de antes.
    await anotarLoCorrido().catch(() => {});
    if (!(e instanceof ErrorDeSqlEnPasadas)) throw e;
    throw new Error(
      `Los scripts/sql posteriores no se pudieron aplicar sobre ${describirDestino(url)}. Cada uno con su error:\n` +
        e.fallas.map((f) => `  · ${f.archivo}: ${f.detalle}`).join("\n") +
        `\nSe reaplican en cada corrida, así que tienen que ser idempotentes ` +
        `(ADD COLUMN IF NOT EXISTS / ADD VALUE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).`,
    );
  } finally {
    await c.end();
  }
}
