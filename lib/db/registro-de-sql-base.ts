/**
 * lib/db/registro-de-sql-base.ts — el registro de los `scripts/sql/` aplicados: lo que habla con la base.
 *
 * Lo puro (la huella, cómo se corre un archivo, las pruebas del backfill) vive en `registro-de-sql.ts`. Acá:
 *   · leer el registro y anotar en él (`SqlAplicado`, scripts/sql/2026-11-23-registro-de-sql.sql);
 *   · `aplicarYAnotar`: corre un `.sql` y lo anota — en la MISMA transacción cuando se puede;
 *   · `leerCatalogoParaPruebas`: lo que el backfill necesita del catálogo de Postgres.
 *
 * Por SQL crudo y no por el cliente de Prisma: lo usan el bootstrap local y el setup de las pruebas, que hablan con
 * una base que no es la del `.env` y no levantan Prisma, y el que aplica necesita UNA conexión para la transacción.
 *
 * ⛔ Acá NO vive el permiso para escribir. Quien llama decide contra qué base: `scripts/aplicar-sql.ts` y
 * `scripts/registro-de-sql.ts` llaman a `assertProdWriteAllowed` antes (ALLOW_PROD_WRITE=1 en producción), y
 * `scripts/lib/sql-posteriores.ts` solo acepta una base local (`esBaseLocal`).
 */
import { hostname } from "node:os";
import {
  SQL_DEL_REGISTRO,
  TABLA_DEL_REGISTRO,
  clavesDelCatalogo,
  huellaDeSql,
  planDeAplicacion,
  type ComoSeAnoto,
  type FilaDelCatalogoDePruebas,
  type FilaDelRegistro,
  type ModoDeAplicacion,
} from "./registro-de-sql";

/** Lo mínimo de una conexión de `pg` (Client, PoolClient o Pool). Para `aplicarYAnotar`, UNA conexión, no un Pool. */
export interface Consultor {
  query(texto: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** «PC-ELIAS · npm run db:sql»: la máquina y el comando, para la columna `desde`. */
export function desdeEstaMaquina(comando: string): string {
  return `${hostname()} · ${comando}`;
}

/** ¿La base ya tiene la tabla del registro? */
export async function existeElRegistro(db: Consultor): Promise<boolean> {
  const { rows } = await db.query(`SELECT to_regclass('public."${TABLA_DEL_REGISTRO}"') IS NOT NULL AS existe`);
  return (rows[0] as { existe: boolean } | undefined)?.existe === true;
}

/**
 * Todo el registro, en orden de archivo. Lanza si la tabla no existe (mirar antes con `existeElRegistro`). La hora se
 * lee como UTC: `pg` toma un `timestamp` sin zona como hora LOCAL de la PC y la correría unas horas.
 */
export async function leerRegistro(db: Consultor): Promise<FilaDelRegistro[]> {
  const { rows } = await db.query(
    `SELECT "archivo", "huella", ("aplicadoEn" AT TIME ZONE 'UTC') AS "aplicadoEn", "desde", "como"
       FROM "${TABLA_DEL_REGISTRO}" ORDER BY "archivo"`,
  );
  return rows as FilaDelRegistro[];
}

export interface Anotacion {
  archivo: string;
  huella: string;
}

/**
 * Anota varios archivos en un viaje. `pisar`:
 *   · true (aplicar): la fila queda con la huella, la hora y el `desde` de ESTA aplicación.
 *   · false (backfill, `--marcar`): solo agrega los que faltan; nunca toca una fila que ya está.
 * Devuelve cuántas filas escribió. La hora va en UTC explícito: la columna es `timestamp` sin zona (como todas las de
 * Prisma) y la base local corre con la zona de la PC.
 */
export async function anotar(
  db: Consultor,
  anotaciones: ReadonlyArray<Anotacion>,
  opciones: { desde: string; como: ComoSeAnoto; pisar: boolean },
): Promise<number> {
  if (anotaciones.length === 0) return 0;
  const alChocar = opciones.pisar
    ? `DO UPDATE SET "huella" = EXCLUDED."huella", "aplicadoEn" = EXCLUDED."aplicadoEn", "desde" = EXCLUDED."desde", "como" = EXCLUDED."como"`
    : "DO NOTHING";
  const { rows } = await db.query(
    `INSERT INTO "${TABLA_DEL_REGISTRO}" ("archivo", "huella", "aplicadoEn", "desde", "como")
     SELECT a, h, (now() AT TIME ZONE 'UTC'), $3::text, $4::text FROM unnest($1::text[], $2::text[]) AS t(a, h)
     ON CONFLICT ("archivo") ${alChocar}
     RETURNING "archivo"`,
    [anotaciones.map((a) => a.archivo), anotaciones.map((a) => a.huella), opciones.desde, opciones.como],
  );
  return rows.length;
}

/** El archivo se aplicó (o no) y quedó (o no) anotado. */
export class ErrorAlAplicar extends Error {
  constructor(
    readonly archivo: string,
    readonly modo: ModoDeAplicacion,
    readonly detalle: string,
    /** En el modo `sentencias`: la que falló (1-based). Las anteriores YA quedaron aplicadas. */
    readonly sentencia?: number,
  ) {
    super(`${archivo}: ${detalle}`);
    this.name = "ErrorAlAplicar";
  }
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Corre el `.sql` y lo anota (`como: "aplicado"`). Según `planDeAplicacion`:
 *   · `transaccion`: BEGIN, el archivo, la fila del registro, COMMIT. Si algo falla, ROLLBACK: ni el cambio ni la fila.
 *   · `propia` (el archivo trae BEGIN/COMMIT): corre tal cual y se anota después; si falla, ROLLBACK y no se anota.
 *   · `sentencias` (`--sin-transaccion`, `CONCURRENTLY`): una por una, cada una por su cuenta, y se anota al final. Si
 *     una falla, las anteriores YA quedaron: el error dice cuál falló, y el archivo, idempotente, se vuelve a correr.
 *
 * Exige el registro: en una base sin la tabla solo se aplica `SQL_DEL_REGISTRO`, que la crea (y se anota a sí mismo).
 * `db` tiene que ser UNA conexión (Client o PoolClient), no un Pool: la transacción vive en la conexión.
 */
export async function aplicarYAnotar(
  db: Consultor,
  archivo: { nombre: string; texto: string },
  opciones: { desde: string; sinTransaccion?: boolean },
): Promise<{ modo: ModoDeAplicacion }> {
  const { modo, sentencias, sinCerrar } = planDeAplicacion(archivo.texto, opciones.sinTransaccion);
  if (sinCerrar) {
    throw new ErrorAlAplicar(
      archivo.nombre,
      modo,
      "abre una transacción (BEGIN) y no la cierra (COMMIT): lo que hiciera se desharía al cerrar la conexión. Arregla el archivo. No se aplicó nada.",
    );
  }
  if (archivo.nombre !== SQL_DEL_REGISTRO && !(await existeElRegistro(db))) {
    throw new ErrorAlAplicar(
      archivo.nombre,
      modo,
      `la base no tiene el registro (${TABLA_DEL_REGISTRO}): aplica primero scripts/sql/${SQL_DEL_REGISTRO}. No se aplicó nada.`,
    );
  }
  const anotacion = [{ archivo: archivo.nombre, huella: huellaDeSql(archivo.texto) }];
  const anotarla = () => anotar(db, anotacion, { desde: opciones.desde, como: "aplicado", pisar: true });

  if (modo === "sentencias") {
    for (const [i, sentencia] of sentencias.entries()) {
      try {
        await db.query(sentencia);
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw new ErrorAlAplicar(archivo.nombre, modo, mensajeDe(e), i + 1);
      }
    }
    await anotarla();
    return { modo };
  }

  if (modo === "propia") {
    try {
      await db.query(archivo.texto);
    } catch (e) {
      // Un BEGIN propio que falla deja la conexión en una transacción abortada (ver sql-posteriores.ts).
      await db.query("ROLLBACK").catch(() => {});
      throw new ErrorAlAplicar(archivo.nombre, modo, mensajeDe(e));
    }
    await anotarla();
    return { modo };
  }

  try {
    await db.query("BEGIN");
    await db.query(archivo.texto);
    await anotarla();
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw new ErrorAlAplicar(archivo.nombre, modo, mensajeDe(e));
  }
  return { modo };
}

/**
 * Lo que el backfill compara, en UNA consulta: tablas (y vistas), columnas, enums y sus valores, índices,
 * restricciones, RLS, políticas, funciones y disparadores de `public`. `pg_catalog` y no `information_schema`: esa
 * vista solo muestra lo que el rol puede tocar (ver salud-del-esquema.ts).
 */
export async function leerCatalogoParaPruebas(db: Consultor): Promise<Set<string>> {
  const { rows } = await db.query(`
    WITH rel AS (
      SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
    )
    SELECT 't'::text AS clase, relname::text AS objeto, NULL::text AS miembro FROM rel WHERE relkind IN ('r', 'p', 'v', 'm', 'f')
    UNION ALL
    SELECT 'c', rel.relname::text, a.attname::text
      FROM pg_catalog.pg_attribute a JOIN rel ON rel.oid = a.attrelid
     WHERE rel.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'i', relname::text, NULL FROM rel WHERE relkind IN ('i', 'I')
    UNION ALL
    SELECT 'r', relname::text, NULL FROM rel WHERE relkind IN ('r', 'p') AND relrowsecurity
    UNION ALL
    SELECT 'k', rel.relname::text, k.conname::text
      FROM pg_catalog.pg_constraint k JOIN rel ON rel.oid = k.conrelid
    UNION ALL
    SELECT 'p', rel.relname::text, p.polname::text
      FROM pg_catalog.pg_policy p JOIN rel ON rel.oid = p.polrelid
    UNION ALL
    SELECT 'g', rel.relname::text, g.tgname::text
      FROM pg_catalog.pg_trigger g JOIN rel ON rel.oid = g.tgrelid
     WHERE NOT g.tgisinternal
    UNION ALL
    SELECT 'y', t.typname::text, NULL
      FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'
    UNION ALL
    SELECT 'e', t.typname::text, e.enumlabel::text
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'f', p.proname::text, NULL
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'`);
  return clavesDelCatalogo(rows as FilaDelCatalogoDePruebas[]);
}
