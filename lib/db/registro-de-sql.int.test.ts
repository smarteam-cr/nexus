/**
 * lib/db/registro-de-sql.int.test.ts — el registro de los `scripts/sql/` aplicados, contra Postgres REAL (nexus_test).
 *
 * Lo que la parte pura no puede probar: que aplicar y anotar van en la MISMA transacción (si el `.sql` falla no queda
 * ni el cambio ni la fila), que `--sin-transaccion` es el camino de un `ADD VALUE` que se usa en el mismo archivo, que el
 * setup global de estas pruebas anotó todo lo que aplicó, y que el backfill, contra una base donde todo corrió, no ve
 * faltas. Correr con la base local: `npm run test:int`. Toca solo objetos `zz_registro_*` y filas `2099-*`, y los borra.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  clasificarConElCatalogo,
  esPosteriorAlBaseline,
  huellaDeSql,
  pruebasDeLosArchivos,
  type ArchivoSql,
} from "./registro-de-sql";
import { ErrorAlAplicar, aplicarYAnotar, leerCatalogoParaPruebas, leerRegistro } from "./registro-de-sql-base";

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RAIZ = process.cwd();
const posteriores: ArchivoSql[] = readdirSync(join(RAIZ, "scripts", "sql"))
  .filter(esPosteriorAlBaseline)
  .sort()
  .map((nombre) => ({ nombre, texto: readFileSync(join(RAIZ, "scripts", "sql", nombre), "utf8") }));

async function limpiar(): Promise<void> {
  await db.query(`DROP TABLE IF EXISTS "zz_registro_tabla", "zz_registro_roto", "zz_registro_con_enum", "zz_registro_propio"`);
  await db.query(`DROP TYPE IF EXISTS "zz_registro_enum"`);
  await db.query(`DELETE FROM "SqlAplicado" WHERE "archivo" LIKE '2099-%'`);
}

beforeAll(async () => {
  await db.connect();
  await limpiar();
});

afterAll(async () => {
  await limpiar();
  await db.end();
});

const fila = async (archivo: string) =>
  (await leerRegistro(db)).find((f) => f.archivo === archivo);
const existe = async (relacion: string) =>
  (await db.query(`SELECT to_regclass($1) IS NOT NULL AS hay`, [`public."${relacion}"`])).rows[0].hay as boolean;

describe("el setup global anota lo que aplica (test/global-setup.integration.ts)", () => {
  it("cada scripts/sql posterior al baseline está en el registro de nexus_test, con la huella de este checkout", async () => {
    const registro = new Map((await leerRegistro(db)).map((f) => [f.archivo, f]));
    const sinAnotar = posteriores.filter((a) => !registro.has(a.nombre)).map((a) => a.nombre);
    expect(sinAnotar, "el setup global aplicó estos y no los anotó").toEqual([]);
    const otraHuella = posteriores.filter((a) => registro.get(a.nombre)?.huella !== huellaDeSql(a.texto)).map((a) => a.nombre);
    expect(otraHuella).toEqual([]);
    // Anotados por ESTA corrida, no por una anterior: la base persiste entre corridas. El setup global dice cuándo
    // arrancó; el segundo de margen es el redondeo de la columna. Si la hora se leyera corrida (como hora local), falla.
    const desde = inject("registroDesde");
    const viejos = posteriores
      .filter((a) => {
        const f = registro.get(a.nombre);
        const en = f ? new Date(f.aplicadoEn).getTime() : 0;
        return !f || !f.desde.endsWith("· test:int") || en < desde - 1_000 || en > Date.now() + 1_000;
      })
      .map((a) => a.nombre);
    expect(viejos, "el setup global de esta corrida no los anotó (o la hora se lee corrida)").toEqual([]);
    expect(registro.get("2026-11-23-registro-de-sql.sql")).toMatchObject({ como: "aplicado" });
  });
});

describe("aplicarYAnotar", () => {
  it("aplica y anota en la misma transacción; reaplicar pisa la fila y no la duplica", async () => {
    const archivo = { nombre: "2099-01-01-registro-tabla.sql", texto: `CREATE TABLE IF NOT EXISTS "zz_registro_tabla" (id int);` };
    const { modo } = await aplicarYAnotar(db, archivo, { desde: "prueba · int" });
    expect(modo).toBe("transaccion");
    expect(await existe("zz_registro_tabla")).toBe(true);
    const primera = await fila(archivo.nombre);
    expect(primera).toMatchObject({ huella: huellaDeSql(archivo.texto), desde: "prueba · int", como: "aplicado" });

    const cambiado = { ...archivo, texto: archivo.texto + "\n-- un comentario nuevo" };
    await aplicarYAnotar(db, cambiado, { desde: "prueba · int (otra vez)" });
    const filas = (await leerRegistro(db)).filter((f) => f.archivo === archivo.nombre);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ huella: huellaDeSql(cambiado.texto), desde: "prueba · int (otra vez)" });
  });

  it("si el .sql falla, no queda ni el cambio ni la fila (ROLLBACK)", async () => {
    const archivo = {
      nombre: "2099-01-02-registro-roto.sql",
      texto: `CREATE TABLE "zz_registro_roto" (id int);\nSELECT * FROM "zz_registro_no_existe";`,
    };
    const error = await aplicarYAnotar(db, archivo, { desde: "prueba · int" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorAlAplicar);
    expect((error as ErrorAlAplicar).detalle).toContain("zz_registro_no_existe");
    expect(await existe("zz_registro_roto")).toBe(false);
    expect(await fila(archivo.nombre)).toBeUndefined();
    // La conexión no quedó en una transacción abortada.
    expect((await db.query("SELECT 1 AS uno")).rows[0].uno).toBe(1);
  });

  it("un archivo con su propio BEGIN/COMMIT que falla: no queda la tabla ni la fila, y la conexión sigue sana", async () => {
    const archivo = {
      nombre: "2099-01-04-registro-propio.sql",
      texto: ["BEGIN;", 'CREATE TABLE "zz_registro_propio" (id int);', 'SELECT * FROM "zz_registro_no_existe";', "COMMIT;"].join("\n"),
    };
    const error = await aplicarYAnotar(db, archivo, { desde: "prueba · int" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorAlAplicar);
    expect((error as ErrorAlAplicar).modo).toBe("propia");
    expect(await existe("zz_registro_propio")).toBe(false);
    expect(await fila(archivo.nombre)).toBeUndefined();
    expect((await db.query("SELECT 1 AS uno")).rows[0].uno).toBe(1);

    const sano = { ...archivo, texto: ["BEGIN;", 'CREATE TABLE IF NOT EXISTS "zz_registro_propio" (id int);', "COMMIT;"].join("\n") };
    expect((await aplicarYAnotar(db, sano, { desde: "prueba · int" })).modo).toBe("propia");
    expect(await existe("zz_registro_propio")).toBe(true);
    expect(await fila(archivo.nombre)).toMatchObject({ huella: huellaDeSql(sano.texto), como: "aplicado" });
  });

  it("un ADD VALUE que se usa en el mismo archivo: en transacción falla entero; con --sin-transaccion corre y se anota", async () => {
    await db.query(`CREATE TYPE "zz_registro_enum" AS ENUM ('A')`);
    const archivo = {
      nombre: "2099-01-03-registro-enum.sql",
      texto: [
        `ALTER TYPE "zz_registro_enum" ADD VALUE IF NOT EXISTS 'B';`,
        `CREATE TABLE IF NOT EXISTS "zz_registro_con_enum" (e "zz_registro_enum" NOT NULL DEFAULT 'B');`,
        `INSERT INTO "zz_registro_con_enum" DEFAULT VALUES;`,
      ].join("\n"),
    };
    const error = await aplicarYAnotar(db, archivo, { desde: "prueba · int" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorAlAplicar);
    expect((error as ErrorAlAplicar).detalle).toMatch(/unsafe use of new value/);
    const valores = async () => (await db.query(`SELECT unnest(enum_range(NULL::"zz_registro_enum"))::text AS v`)).rows.map((r) => r.v);
    expect(await valores()).toEqual(["A"]);
    expect(await fila(archivo.nombre)).toBeUndefined();

    const { modo } = await aplicarYAnotar(db, archivo, { desde: "prueba · int", sinTransaccion: true });
    expect(modo).toBe("sentencias");
    expect(await valores()).toEqual(["A", "B"]);
    expect(await fila(archivo.nombre)).toMatchObject({ como: "aplicado" });
  });
});

describe("el backfill contra una base donde todo corrió", () => {
  it("ningún scripts/sql posterior al baseline queda con faltas (las pruebas leen bien el esquema)", async () => {
    const catalogo = await leerCatalogoParaPruebas(db);
    const fondo = [
      { nombre: "0_init/migration.sql", texto: readFileSync(join(RAIZ, "prisma", "migrations", "0_init", "migration.sql"), "utf8") },
      { nombre: "policies.sql", texto: readFileSync(join(RAIZ, "prisma", "policies.sql"), "utf8") },
    ];
    const pruebas = pruebasDeLosArchivos(posteriores, fondo);
    const conFaltas = posteriores
      .map((a) => ({ archivo: a.nombre, v: clasificarConElCatalogo(pruebas.get(a.nombre) ?? [], catalogo) }))
      .filter(({ v }) => v.estado === "falta")
      .map(({ archivo, v }) => `${archivo}: ${v.estado === "falta" ? v.faltan.join(", ") : ""}`);
    expect(conFaltas).toEqual([]);
    const demostrados = posteriores.filter((a) => clasificarConElCatalogo(pruebas.get(a.nombre) ?? [], catalogo).estado === "demostrado");
    expect(demostrados.length).toBeGreaterThan(posteriores.length * 0.9);
  });
});
