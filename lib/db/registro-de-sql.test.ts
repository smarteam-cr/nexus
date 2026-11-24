/**
 * lib/db/registro-de-sql.test.ts — el registro de los `scripts/sql/` aplicados, la parte pura.
 *
 * Correr: `npx vitest run lib/db/registro-de-sql.test.ts --project unit`. Lo que habla con la base lo prueba
 * `registro-de-sql.int.test.ts` contra nexus_test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SQL_DEL_REGISTRO,
  clasificarConElCatalogo,
  clavesDelCatalogo,
  compararConElRegistro,
  esPosteriorAlBaseline,
  eventosDelSql,
  huellaDeSql,
  partirEnSentencias,
  pideSinTransaccion,
  planDeAplicacion,
  pruebasDeLosArchivos,
  quitarComentarios,
  type FilaDelRegistro,
  type Prueba,
} from "./registro-de-sql";
import { ErrorAlAplicar, aplicarYAnotar } from "./registro-de-sql-base";

const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);

describe("huellaDeSql", () => {
  it("la misma versión da la misma huella con CRLF, con LF y con BOM", () => {
    const lf = ["CREATE TABLE \"X\" (id int);", "ALTER TABLE \"X\" ENABLE ROW LEVEL SECURITY;", ""].join(NL);
    const crlf = lf.split(NL).join(CRLF);
    expect(huellaDeSql(crlf)).toBe(huellaDeSql(lf));
    expect(huellaDeSql("﻿" + lf)).toBe(huellaDeSql(lf));
    expect(huellaDeSql(lf)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un cambio de contenido cambia la huella", () => {
    expect(huellaDeSql("SELECT 1;")).not.toBe(huellaDeSql("SELECT 2;"));
  });
});

describe("esPosteriorAlBaseline", () => {
  it("solo los .sql con fecha posterior a 0_init (2026-08-01)", () => {
    expect(esPosteriorAlBaseline("2026-08-02-algo.sql")).toBe(true);
    expect(esPosteriorAlBaseline("2026-08-01-algo.sql")).toBe(false);
    expect(esPosteriorAlBaseline("2026-11-23-algo.txt")).toBe(false);
    expect(esPosteriorAlBaseline("algo-sin-fecha.sql")).toBe(false);
  });
});

describe("partirEnSentencias y quitarComentarios", () => {
  it("un ; dentro de un literal, un comentario o un cuerpo $$ no parte", () => {
    const sql = [
      "-- encabezado; con punto y coma",
      "CREATE TABLE \"A\" (x text DEFAULT 'a;b');",
      "/* bloque; /* anidado; */ sigue; */",
      "DO $$ BEGIN ALTER TABLE \"A\" ADD CONSTRAINT \"c\" CHECK (x <> ';'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
      "CREATE FUNCTION f() RETURNS int AS $cuerpo$ SELECT 1; $cuerpo$ LANGUAGE sql;",
      "SELECT E'con \\' barra;', \"raro;nombre\"",
    ].join(NL);
    const s = partirEnSentencias(sql);
    expect(s).toHaveLength(4);
    expect(s[0]).toContain("'a;b'");
    expect(s[1]).toMatch(/^\/\* bloque/);
    expect(s[1]).toContain("END $$");
    expect(s[2]).toContain("$cuerpo$ SELECT 1; $cuerpo$");
    expect(s[3]).toContain("\"raro;nombre\"");
  });

  it("descarta las sentencias vacías y las que son solo comentario", () => {
    const s = partirEnSentencias(";;  -- nada" + NL + "SELECT 1;" + NL + "-- fin");
    expect(s).toHaveLength(1);
    // La sentencia conserva el comentario que la precede: es lo que se manda a la base, tal cual.
    expect(quitarComentarios(s[0]).trim()).toBe("SELECT 1");
  });

  it("quita los comentarios, también los de adentro de un DO, y deja los literales", () => {
    const sql = "DO $$ BEGIN" + NL + "-- ALTER TYPE \"E\" ADD VALUE 'X';" + NL + "RAISE NOTICE '-- no es comentario'; END $$;";
    const limpio = quitarComentarios(sql);
    expect(limpio).not.toContain("ADD VALUE");
    expect(limpio).toContain("'-- no es comentario'");
  });
});

describe("planDeAplicacion", () => {
  it("por defecto, una transacción con la anotación adentro", () => {
    expect(planDeAplicacion("CREATE TABLE \"A\" (id int);").modo).toBe("transaccion");
  });

  it("un archivo con su propio BEGIN/COMMIT corre tal cual", () => {
    expect(planDeAplicacion("BEGIN;" + NL + "CREATE TABLE \"A\" (id int);" + NL + "COMMIT;").modo).toBe("propia");
    // Un BEGIN de un DO no es control de transacción.
    expect(planDeAplicacion("DO $$ BEGIN PERFORM 1; END $$;").modo).toBe("transaccion");
  });

  it("CONCURRENTLY y --sin-transaccion van sentencia por sentencia", () => {
    const concurrente = planDeAplicacion("CREATE INDEX CONCURRENTLY IF NOT EXISTS \"i\" ON \"A\" (x);" + NL + "SELECT 1;");
    expect(concurrente.modo).toBe("sentencias");
    expect(concurrente.sentencias).toHaveLength(2);
    expect(planDeAplicacion("ALTER TYPE \"E\" ADD VALUE IF NOT EXISTS 'X';", true).modo).toBe("sentencias");
  });

  it("sabe qué errores se arreglan corriendo sentencia por sentencia", () => {
    expect(pideSinTransaccion('unsafe use of new value "X" of enum type "E"')).toBe(true);
    expect(pideSinTransaccion("CREATE INDEX CONCURRENTLY cannot run inside a transaction block")).toBe(true);
    expect(pideSinTransaccion('relation "A" does not exist')).toBe(false);
  });
});

describe("eventosDelSql — lo que un .sql crea y borra", () => {
  const claves = (sql: string) => eventosDelSql(sql).map((e) => `${e.efecto} ${JSON.stringify(e.objeto)}`);

  it("tablas, columnas (varias en un ALTER), restricciones, RLS e índices", () => {
    const sql = [
      'CREATE TABLE IF NOT EXISTS "public"."T" (id text);',
      'ALTER TABLE "T" ADD COLUMN IF NOT EXISTS "a" text, ADD COLUMN "b" int, ADD CONSTRAINT "T_ck" CHECK (b > 0);',
      'CREATE UNIQUE INDEX IF NOT EXISTS "T_a_key" ON "T" ("a");',
      'ALTER TABLE "T" ENABLE ROW LEVEL SECURITY;',
    ].join(NL);
    expect(claves(sql)).toEqual([
      'crea {"clase":"tabla","tabla":"T"}',
      'crea {"clase":"columna","tabla":"T","columna":"a"}',
      'crea {"clase":"columna","tabla":"T","columna":"b"}',
      'crea {"clase":"restriccion","tabla":"T","restriccion":"T_ck"}',
      'crea {"clase":"indice","indice":"T_a_key","tabla":"T"}',
      'crea {"clase":"rls","tabla":"T"}',
    ]);
  });

  it("enums y valores; un ADD VALUE comentado no corrió", () => {
    const sql = [
      'CREATE TYPE "E" AS ENUM (\'A\');',
      "ALTER TYPE \"E\" ADD VALUE IF NOT EXISTS 'B';",
      "-- ALTER TYPE \"E\" ADD VALUE IF NOT EXISTS 'C';",
    ].join(NL);
    expect(claves(sql)).toEqual(['crea {"clase":"enum","tipo":"E"}', 'crea {"clase":"valor","tipo":"E","valor":"B"}']);
  });

  it("lo de adentro de un DO, políticas, funciones y disparadores", () => {
    const sql = [
      'DO $$ BEGIN ALTER TABLE "T" ADD CONSTRAINT "T_fk" FOREIGN KEY ("c") REFERENCES "C"("id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;',
      'DROP POLICY IF EXISTS deny_all ON "T";',
      'CREATE POLICY deny_all ON "T" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);',
      'CREATE OR REPLACE FUNCTION "tocar"() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;',
      'CREATE TRIGGER "T_tocar" BEFORE UPDATE ON "T" FOR EACH ROW EXECUTE FUNCTION "tocar"();',
    ].join(NL);
    expect(claves(sql)).toEqual([
      'crea {"clase":"restriccion","tabla":"T","restriccion":"T_fk"}',
      'quita {"clase":"politica","politica":"deny_all","tabla":"T"}',
      'crea {"clase":"politica","politica":"deny_all","tabla":"T"}',
      'crea {"clase":"funcion","funcion":"tocar"}',
      'crea {"clase":"disparador","disparador":"T_tocar","tabla":"T"}',
    ]);
  });

  it("borrados: tablas en lista, columnas, enums; un nombre de otro schema no cuenta", () => {
    const sql = [
      'DROP TABLE IF EXISTS "A", "B" CASCADE;',
      'ALTER TABLE "T" DROP COLUMN IF EXISTS "vieja";',
      'DROP TYPE IF EXISTS "Viejo";',
      "CREATE TABLE auth.otra (id int);",
    ].join(NL);
    expect(claves(sql)).toEqual([
      'quita {"clase":"tabla","tabla":"A"}',
      'quita {"clase":"tabla","tabla":"B"}',
      'quita {"clase":"columna","tabla":"T","columna":"vieja"}',
      'quita {"clase":"enum","tipo":"Viejo"}',
    ]);
  });

  it("un nombre de más de 63 bytes se corta como lo corta Postgres", () => {
    const largo = "Indice_" + "x".repeat(70);
    expect(claves(`CREATE INDEX "${largo}" ON "T" (a);`)).toEqual([
      `crea {"clase":"indice","indice":"${largo.slice(0, 63)}","tabla":"T"}`,
    ]);
  });

  it("sin comillas, el nombre va en minúsculas (como lo guarda Postgres)", () => {
    expect(claves("CREATE INDEX idx_Algo ON Tabla (x);")).toEqual(['crea {"clase":"indice","indice":"idx_algo","tabla":"tabla"}']);
  });
});

describe("pruebasDeLosArchivos", () => {
  const de = (mapa: Map<string, Prueba[]>, archivo: string) =>
    (mapa.get(archivo) ?? []).map((p) => `${p.debeExistir ? "+" : "-"}${p.propia ? "!" : ""} ${JSON.stringify(p.objeto)}`);

  it("lo que un archivo posterior borra deja de ser prueba", () => {
    const mapa = pruebasDeLosArchivos([
      { nombre: "2026-09-01-a.sql", texto: 'CREATE TABLE "Vieja" (id int); CREATE TABLE "Queda" (id int);' },
      { nombre: "2026-10-01-b.sql", texto: 'DROP TABLE IF EXISTS "Vieja";' },
    ]);
    expect(de(mapa, "2026-09-01-a.sql")).toEqual(['+! {"clase":"tabla","tabla":"Queda"}']);
    // Que no exista prueba que b corrió: la tabla la creó un archivo anterior.
    expect(de(mapa, "2026-10-01-b.sql")).toEqual(['-! {"clase":"tabla","tabla":"Vieja"}']);
  });

  it("borrar una tabla se lleva sus columnas, su RLS y sus políticas", () => {
    const mapa = pruebasDeLosArchivos([
      { nombre: "2026-09-01-a.sql", texto: 'ALTER TABLE "T" ADD COLUMN "c" int; ALTER TABLE "T" ENABLE ROW LEVEL SECURITY;' },
      { nombre: "2026-10-01-b.sql", texto: 'DROP TABLE "T";' },
    ]);
    expect(de(mapa, "2026-09-01-a.sql")).toEqual([]);
  });

  it("DROP y CREATE de la misma política en el mismo archivo deja la prueba en pie", () => {
    const mapa = pruebasDeLosArchivos([
      { nombre: "2026-09-01-a.sql", texto: 'DROP POLICY IF EXISTS p ON "T"; CREATE POLICY p ON "T" USING (false);' },
    ]);
    expect(de(mapa, "2026-09-01-a.sql")).toEqual(['+! {"clase":"politica","politica":"p","tabla":"T"}']);
  });

  it("lo que también hace otro archivo o el baseline no es prueba propia", () => {
    const mapa = pruebasDeLosArchivos(
      [
        { nombre: "2026-09-01-a.sql", texto: 'ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY; CREATE INDEX IF NOT EXISTS "i" ON "Client" (x);' },
        { nombre: "2026-10-01-b.sql", texto: 'CREATE INDEX IF NOT EXISTS "i" ON "Client" (x);' },
      ],
      [{ nombre: "0_init", texto: 'CREATE TABLE "Client" (id text); ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;' }],
    );
    expect(de(mapa, "2026-09-01-a.sql")).toEqual(['+ {"clase":"rls","tabla":"Client"}', '+ {"clase":"indice","indice":"i","tabla":"Client"}']);
  });

  it("que no exista algo que nunca existió no prueba nada", () => {
    const mapa = pruebasDeLosArchivos([{ nombre: "2026-09-01-a.sql", texto: 'CREATE TABLE "tmp" (id int); DROP TABLE "tmp";' }]);
    expect(de(mapa, "2026-09-01-a.sql")).toEqual(['- {"clase":"tabla","tabla":"tmp"}']);
  });
});

describe("clasificarConElCatalogo", () => {
  const propia = (tabla: string): Prueba => ({ objeto: { clase: "tabla", tabla }, debeExistir: true, propia: true });
  const compartida = (tabla: string): Prueba => ({ objeto: { clase: "rls", tabla }, debeExistir: true, propia: false });
  const catalogo = clavesDelCatalogo([
    { clase: "t", objeto: "A", miembro: null },
    { clase: "r", objeto: "A", miembro: null },
    { clase: "t", objeto: "Client", miembro: null },
    { clase: "r", objeto: "Client", miembro: null },
  ]);

  it("demostrado: todo está y algo es propio", () => {
    expect(clasificarConElCatalogo([propia("A"), compartida("A")], catalogo)).toEqual({ estado: "demostrado", pruebas: 2 });
  });

  it("falta: dice qué no está", () => {
    expect(clasificarConElCatalogo([propia("A"), propia("B")], catalogo)).toEqual({ estado: "falta", faltan: ["tabla B"] });
    const borrada: Prueba = { objeto: { clase: "tabla", tabla: "A" }, debeExistir: false, propia: true };
    expect(clasificarConElCatalogo([borrada], catalogo)).toEqual({ estado: "falta", faltan: ["que no exista la tabla A"] });
  });

  it("sin prueba: un UPDATE de datos, o todo compartido", () => {
    expect(clasificarConElCatalogo([], catalogo).estado).toBe("sin-prueba");
    expect(clasificarConElCatalogo([compartida("Client")], catalogo).estado).toBe("sin-prueba");
  });
});

describe("compararConElRegistro", () => {
  const fila = (archivo: string, texto: string): FilaDelRegistro => ({
    archivo,
    huella: huellaDeSql(texto),
    aplicadoEn: new Date("2026-11-23T12:00:00Z"),
    desde: "PC · npm run db:sql",
    como: "aplicado",
  });

  it("sin anotar, cambiados, ajenos y al día", () => {
    const archivos = [
      { nombre: "2026-07-01-viejo.sql", texto: "SELECT 0;" },
      { nombre: "2026-09-01-a.sql", texto: "SELECT 1;" },
      { nombre: "2026-09-02-b.sql", texto: "SELECT 2;" },
      { nombre: "2026-09-03-c.sql", texto: "SELECT 3;" },
    ];
    const estado = compararConElRegistro(archivos, [
      fila("2026-09-01-a.sql", "SELECT 1;"),
      fila("2026-09-02-b.sql", "SELECT 2 -- antes;"),
      fila("2026-12-01-otra-rama.sql", "SELECT 9;"),
    ]);
    expect(estado.sinAnotar).toEqual(["2026-09-03-c.sql"]);
    expect(estado.cambiados.map((c) => c.archivo)).toEqual(["2026-09-02-b.sql"]);
    expect(estado.ajenos.map((f) => f.archivo)).toEqual(["2026-12-01-otra-rama.sql"]);
    expect(estado.alDia).toBe(1);
    expect(estado.posteriores).toBe(3);
  });

  it("el mismo archivo con CRLF en el checkout y LF al anotarse está al día", () => {
    const lf = "SELECT 1;" + NL + "SELECT 2;" + NL;
    const estado = compararConElRegistro([{ nombre: "2026-09-01-a.sql", texto: lf.split(NL).join(CRLF) }], [fila("2026-09-01-a.sql", lf)]);
    expect(estado).toMatchObject({ sinAnotar: [], cambiados: [], alDia: 1 });
  });
});

describe("los scripts/sql del repo", () => {
  const dir = join(process.cwd(), "scripts", "sql");
  const archivos = readdirSync(dir)
    .filter(esPosteriorAlBaseline)
    .map((nombre) => ({ nombre, texto: readFileSync(join(dir, nombre), "utf8") }));

  it("se leen todos sin lanzar, y casi todos dejan alguna prueba en el esquema", () => {
    const pruebas = pruebasDeLosArchivos(archivos);
    const conPrueba = archivos.filter((a) => (pruebas.get(a.nombre) ?? []).length > 0);
    // Medido el 2026-11-23: 158 de 161. Los que no son UPDATE de datos. Si baja mucho, la lectura se rompió.
    expect(conPrueba.length).toBeGreaterThan(archivos.length * 0.9);
  });

  it("el SQL del registro existe y se prueba a sí mismo (su tabla y su RLS)", () => {
    const pruebas = pruebasDeLosArchivos(archivos).get(SQL_DEL_REGISTRO) ?? [];
    const descritas = pruebas.map((p) => `${p.objeto.clase}:${"tabla" in p.objeto ? p.objeto.tabla : ""}`);
    expect(descritas).toContain("tabla:SqlAplicado");
    expect(descritas).toContain("rls:SqlAplicado");
  });

  it("el SQL del registro es idempotente: no crea nada sin IF NOT EXISTS ni sin atrapar el duplicado", () => {
    const texto = quitarComentarios(readFileSync(join(dir, SQL_DEL_REGISTRO), "utf8"));
    expect(texto).toMatch(/CREATE TABLE IF NOT EXISTS "SqlAplicado"/);
    expect(texto.match(/ADD CONSTRAINT/g)?.length).toBe(texto.match(/WHEN duplicate_object/g)?.length);
  });
});

describe("aplicarYAnotar — el orden de lo que se manda a la base", () => {
  /** Una base de mentira: anota la primera palabra de cada consulta y falla en la que matchee `falla`. */
  function baseFalsa(hayRegistro: boolean, falla?: RegExp) {
    const enviado: string[] = [];
    const db = {
      async query(texto: string) {
        const t = texto.trim();
        if (/to_regclass/.test(t)) return { rows: [{ existe: hayRegistro }] };
        enviado.push(/^INSERT INTO "SqlAplicado"/.test(t) ? "ANOTAR" : t);
        if (falla?.test(t)) throw new Error(`falló: ${t}`);
        return { rows: [{ archivo: "x" }] };
      },
    };
    return { db, enviado };
  }
  const archivo = { nombre: "2099-01-01-a.sql", texto: 'CREATE TABLE "A" (id int);' };

  it("en una transacción: BEGIN, el archivo, la anotación, COMMIT", async () => {
    const { db, enviado } = baseFalsa(true);
    await aplicarYAnotar(db, archivo, { desde: "prueba" });
    expect(enviado).toEqual(["BEGIN", archivo.texto, "ANOTAR", "COMMIT"]);
  });

  it("si el archivo falla: ROLLBACK, sin anotar ni COMMIT", async () => {
    const { db, enviado } = baseFalsa(true, /CREATE TABLE/);
    await expect(aplicarYAnotar(db, archivo, { desde: "prueba" })).rejects.toBeInstanceOf(ErrorAlAplicar);
    expect(enviado).toEqual(["BEGIN", archivo.texto, "ROLLBACK"]);
  });

  it("sentencia por sentencia: cada una suelta y la anotación al final; si una falla, dice cuál y no anota", async () => {
    const dos = { nombre: "2099-01-02-b.sql", texto: "SELECT 1;\nSELECT 2;\nSELECT 3;" };
    const ok = baseFalsa(true);
    await aplicarYAnotar(ok.db, dos, { desde: "prueba", sinTransaccion: true });
    expect(ok.enviado).toEqual(["SELECT 1", "SELECT 2", "SELECT 3", "ANOTAR"]);

    const mal = baseFalsa(true, /SELECT 2/);
    const error = await aplicarYAnotar(mal.db, dos, { desde: "prueba", sinTransaccion: true }).catch((e: unknown) => e);
    expect((error as ErrorAlAplicar).sentencia).toBe(2);
    expect(mal.enviado).toEqual(["SELECT 1", "SELECT 2", "ROLLBACK"]);
  });

  it("sin el registro en la base no aplica nada, salvo el archivo que lo crea", async () => {
    const sin = baseFalsa(false);
    await expect(aplicarYAnotar(sin.db, archivo, { desde: "prueba" })).rejects.toThrow(/no tiene el registro/);
    expect(sin.enviado).toEqual([]);

    const registro = baseFalsa(false);
    await aplicarYAnotar(registro.db, { nombre: SQL_DEL_REGISTRO, texto: 'CREATE TABLE IF NOT EXISTS "SqlAplicado" (x text);' }, { desde: "prueba" });
    expect(registro.enviado).toEqual(["BEGIN", 'CREATE TABLE IF NOT EXISTS "SqlAplicado" (x text);', "ANOTAR", "COMMIT"]);
  });
});
