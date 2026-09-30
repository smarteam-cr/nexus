/**
 * lib/db/esquema-esperado.test.ts — «lo que espera el código» contra «lo que hay en la base».
 *
 * Correr: `npx vitest run lib/db/esquema-esperado.test.ts --project unit`.
 *
 * ── EL ACCIDENTE QUE ESTE ARCHIVO CUIDA ──────────────────────────────────────
 * El 2026-09-30 el commit `e4fd8594` traía dos columnas nuevas en `SessionProject` y su SQL.
 * Desplegado sin correr antes ese SQL, `/api/health` habría dado `ok: true`, `deploy.sh` «DEPLOY
 * OK», y la ficha del cliente, el cronograma y el clasificador habrían reventado con P2022.
 *
 * Lo que se congela acá es la comparación que ahora lo detecta, y sobre todo sus dos bordes:
 *   · lo que FALTA se nombra (una columna, una tabla, un valor de enum);
 *   · lo que SOBRA no es un error — la base tiene cosas que el schema de Prisma no declara
 *     (`KnowledgeEmbedding.embedding`, índices creados por SQL) y un falso atraso acá frenaría
 *     todos los deploys.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compararEsquema,
  describirFaltante,
  esperadoDelCliente,
  esquemaDesdeCatalogo,
  listarFaltantes,
  mismoSchema,
  sqlQueNombran,
  type Esquema,
  type Faltante,
  type FilaDelCatalogo,
  type ModeloDelCliente,
} from "./esquema-esperado";

/** Como viene del dmmf del cliente generado: campos con su clase, relaciones incluidas. */
const MODELOS: ModeloDelCliente[] = [
  {
    name: "SessionProject",
    fields: [
      { name: "id", kind: "scalar", type: "String" },
      { name: "sessionId", kind: "scalar", type: "String" },
      { name: "session", kind: "object", type: "FirefliesSession" },
      { name: "source", kind: "enum", type: "SessionProjectSource" },
      { name: "planningOverride", kind: "scalar", type: "Boolean" },
      { name: "implementationOverride", kind: "scalar", type: "Boolean" },
    ],
  },
  {
    name: "KnowledgeEmbedding",
    fields: [
      { name: "id", kind: "scalar", type: "String" },
      { name: "chunkText", kind: "scalar", type: "String" },
      { name: "document", kind: "object", type: "KnowledgeDocument" },
    ],
  },
];

const ENUMS = {
  SessionProjectSource: { AGENT: "AGENT", HUMAN: "HUMAN" },
  // Declarado y sin ninguna columna que lo use.
  SinUso: { A: "A" },
};

/** Una base, escrita como la devuelve el catálogo: una fila por columna y una por valor de enum. */
function catalogo(tablas: Record<string, string[]>, enums: Record<string, string[]> = {}): FilaDelCatalogo[] {
  return [
    ...Object.entries(tablas).flatMap(([objeto, cols]) => cols.map((miembro) => ({ clase: "c", objeto, miembro }))),
    ...Object.entries(enums).flatMap(([objeto, vals]) => vals.map((miembro) => ({ clase: "e", objeto, miembro }))),
  ];
}

const AL_DIA = {
  tablas: {
    SessionProject: ["id", "sessionId", "source", "planningOverride", "implementationOverride"],
    KnowledgeEmbedding: ["id", "chunkText"],
  },
  enums: { SessionProjectSource: ["AGENT", "HUMAN"] },
};

const esperado = (): Esquema => esperadoDelCliente(MODELOS, ENUMS);
const base = (tablas: Record<string, string[]> = AL_DIA.tablas, enums: Record<string, string[]> = AL_DIA.enums) =>
  esquemaDesdeCatalogo(catalogo(tablas, enums));
const nombres = (faltantes: Faltante[]) => faltantes.map(describirFaltante);

describe("esperadoDelCliente — lo que el cliente Prisma necesita encontrar", () => {
  it("las columnas son los campos `scalar` y `enum`; una relación no es una columna", () => {
    /* La edición que lo pone en rojo: contar los campos `object`. `session` no existe como columna
       en ninguna base, así que TODA tabla con una relación daría atrasada y ningún deploy pasaría. */
    expect([...esperado().tablas.get("SessionProject")!]).toEqual([
      "id", "sessionId", "source", "planningOverride", "implementationOverride",
    ]);
    expect(esperado().tablas.get("KnowledgeEmbedding")!.has("document")).toBe(false);
  });

  it("respeta `@@map` y `@map`: manda el nombre de la base, no el del modelo", () => {
    const e = esperadoDelCliente(
      [{ name: "Cuenta", dbName: "cuentas", fields: [{ name: "creadaEn", kind: "scalar", type: "DateTime", dbName: "creada_en" }] }],
      {},
    );
    expect([...e.tablas.keys()]).toEqual(["cuentas"]);
    expect([...e.tablas.get("cuentas")!]).toEqual(["creada_en"]);
  });

  it("⚠ un campo de una clase que no se conoce NO se espera como columna", () => {
    // Ante una clase nueva de Prisma se prefiere no mirar antes que inventar un atraso.
    const e = esperadoDelCliente(
      [{ name: "Doc", fields: [{ name: "id", kind: "scalar", type: "String" }, { name: "vector", kind: "unsupported", type: "vector" }] }],
      {},
    );
    expect([...e.tablas.get("Doc")!]).toEqual(["id"]);
  });

  it("un enum entra solo si alguna columna lo usa", () => {
    expect([...esperado().enums.keys()]).toEqual(["SessionProjectSource"]);
    expect([...esperado().enums.get("SessionProjectSource")!]).toEqual(["AGENT", "HUMAN"]);
  });

  describe("las tablas pivote de una relación N:N implícita", () => {
    /* No son un modelo: Prisma las crea y las consulta por su cuenta (`_` + el nombre de la relación). */
    const CON_PIVOTE: ModeloDelCliente[] = [
      { name: "Documento", fields: [{ name: "id", kind: "scalar", type: "String" }, { name: "tags", kind: "object", type: "Tag", relationName: "DocumentoToTag" }] },
      { name: "Tag", fields: [{ name: "id", kind: "scalar", type: "String" }, { name: "documentos", kind: "object", type: "Documento", relationName: "DocumentoToTag" }] },
    ];

    it("se esperan con sus columnas A y B, y si faltan se nombran como cualquier tabla", () => {
      const e = esperadoDelCliente(CON_PIVOTE, {}, { _DocumentoToTag: ["A", "B"] });
      expect([...e.tablas.get("_DocumentoToTag")!]).toEqual(["A", "B"]);
      const sinPivote = esquemaDesdeCatalogo(catalogo({ Documento: ["id"], Tag: ["id"] }));
      expect(nombres(compararEsquema(e, sinPivote))).toEqual(["tabla _DocumentoToTag"]);
    });

    it("⛔ una pivote cuya relación ya no existe en el cliente NO se espera", () => {
      /* La edición que lo pone en rojo: esperar la lista tal cual. Un nombre viejo en
         `PIVOTES_IMPLICITAS` (la relación se borró o cambió de nombre) inventaría un atraso y
         `/api/health` revertiría cada deploy. */
      const e = esperadoDelCliente(CON_PIVOTE, {}, { _RelacionQueYaNoExiste: ["A", "B"] });
      expect(e.tablas.has("_RelacionQueYaNoExiste")).toBe(false);
    });

    it("sin lista de pivotes no se espera ninguna", () => {
      expect([...esperadoDelCliente(CON_PIVOTE, {}).tablas.keys()]).toEqual(["Documento", "Tag"]);
    });
  });
});

describe("compararEsquema — solo lo que al código le FALTA", () => {
  it("con la base al día no falta nada", () => {
    expect(compararEsquema(esperado(), base())).toEqual([]);
  });

  it("⛔ falta una columna: la nombra (el caso del 2026-09-30)", () => {
    /* El SQL de `e4fd8594` sin correr: la tabla existe, las dos columnas nuevas no. */
    const sinElSql = base({ ...AL_DIA.tablas, SessionProject: ["id", "sessionId", "source"] });
    expect(compararEsquema(esperado(), sinElSql)).toEqual([
      { clase: "columna", tabla: "SessionProject", columna: "planningOverride" },
      { clase: "columna", tabla: "SessionProject", columna: "implementationOverride" },
    ]);
  });

  it("falta una tabla: una sola entrada, sin listar sus columnas", () => {
    const sinTabla = base({ SessionProject: AL_DIA.tablas.SessionProject });
    expect(compararEsquema(esperado(), sinTabla)).toEqual([{ clase: "tabla", tabla: "KnowledgeEmbedding" }]);
  });

  it("falta un valor de enum, o el enum entero", () => {
    expect(compararEsquema(esperado(), base(AL_DIA.tablas, { SessionProjectSource: ["AGENT"] }))).toEqual([
      { clase: "valor", tipo: "SessionProjectSource", valor: "HUMAN" },
    ]);
    expect(compararEsquema(esperado(), base(AL_DIA.tablas, {}))).toEqual([{ clase: "enum", tipo: "SessionProjectSource" }]);
  });

  it("⛔ lo que SOBRA en la base no es un error", () => {
    /* La edición que lo pone en rojo: comparar en los dos sentidos. La base de producción tiene
       `KnowledgeEmbedding.embedding` (pgvector, fuera del schema de Prisma) y, entre el SQL y el
       deploy, las tablas de la tanda siguiente: con eso como «error» ningún deploy pasaría. */
    const conDeMas = base(
      {
        SessionProject: [...AL_DIA.tablas.SessionProject, "columnaDeLaOtraPc"],
        KnowledgeEmbedding: ["id", "chunkText", "embedding"],
        TablaDeLaProximaTanda: ["id"],
      },
      { SessionProjectSource: ["AGENT", "HUMAN", "VALOR_NUEVO"], EnumDeLaProximaTanda: ["X"] },
    );
    expect(compararEsquema(esperado(), conDeMas)).toEqual([]);
  });

  it("un enum que ninguna columna usa no puede faltar", () => {
    // `SinUso` no está en la base y no se reporta: el código no tiene por dónde mandarlo.
    expect(nombres(compararEsquema(esperado(), base()))).not.toContain("enum SinUso");
  });

  it("los nombres se comparan tal cual: Postgres distingue mayúsculas en un nombre entre comillas", () => {
    const enMinusculas = base({
      KnowledgeEmbedding: AL_DIA.tablas.KnowledgeEmbedding,
      sessionproject: AL_DIA.tablas.SessionProject,
    });
    expect(nombres(compararEsquema(esperado(), enMinusculas))).toEqual(["tabla SessionProject"]);
  });
});

describe("esquemaDesdeCatalogo — de las filas del catálogo a tablas y enums", () => {
  it("separa columnas (`c`) de valores de enum (`e`) y junta por objeto", () => {
    const e = esquemaDesdeCatalogo(catalogo({ A: ["x", "y"], B: ["z"] }, { E: ["UNO", "DOS"] }));
    expect([...e.tablas.get("A")!]).toEqual(["x", "y"]);
    expect([...e.tablas.get("B")!]).toEqual(["z"]);
    expect([...e.enums.get("E")!]).toEqual(["UNO", "DOS"]);
  });

  it("ignora una clase que no conoce: los índices y lo demás no entran a la comparación", () => {
    const e = esquemaDesdeCatalogo([{ clase: "i", objeto: "SessionProject_idx", miembro: "sessionId" }]);
    expect(e.tablas.size).toBe(0);
    expect(e.enums.size).toBe(0);
  });
});

describe("cómo se nombra lo que falta", () => {
  const FALTAN: Faltante[] = [
    { clase: "tabla", tabla: "Cuestionario" },
    { clase: "columna", tabla: "SessionProject", columna: "planningOverride" },
    { clase: "enum", tipo: "FacturaOdooCambioTipo" },
    { clase: "valor", tipo: "CobranzaOrigenCobro", valor: "ODOO" },
  ];

  it("cada clase dice qué es", () => {
    expect(nombres(FALTAN)).toEqual([
      "tabla Cuestionario",
      "columna SessionProject.planningOverride",
      "enum FacturaOdooCambioTipo",
      "valor CobranzaOrigenCobro.ODOO",
    ]);
  });

  it("la lista se corta y dice cuántos más quedan", () => {
    const ENTERA = "tabla Cuestionario, columna SessionProject.planningOverride, enum FacturaOdooCambioTipo, valor CobranzaOrigenCobro.ODOO";
    expect(listarFaltantes(FALTAN, 8)).toBe(ENTERA);
    // Justo en el tope no sobra ninguno: no dice «y 0 más».
    expect(listarFaltantes(FALTAN, 4)).toBe(ENTERA);
    expect(listarFaltantes(FALTAN, 2)).toBe("tabla Cuestionario, columna SessionProject.planningOverride y 2 más");
  });
});

describe("sqlQueNombran — la pista de qué SQL falta correr", () => {
  const ARCHIVOS = [
    { nombre: "a-columnas.sql", texto: 'ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "planningOverride" BOOLEAN;' },
    { nombre: "b-tabla.sql", texto: 'CREATE TABLE IF NOT EXISTS "Cuestionario" (\n  "id" TEXT NOT NULL\n);' },
    { nombre: "c-enum.sql", texto: `CREATE TYPE "FacturaOdooCambioTipo" AS ENUM ('ALTA');` },
    { nombre: "d-valor.sql", texto: `--   ALTER TYPE "CobranzaOrigenCobro" ADD VALUE IF NOT EXISTS 'ODOO';` },
    { nombre: "e-otra-cosa.sql", texto: 'UPDATE "SessionProject" SET "planningOverride" = NULL; -- y "Cuestionario"' },
    // El mismo nombre de columna y de valor, en OTRA tabla y en OTRO enum.
    { nombre: "f-homonimos.sql", texto: `ALTER TABLE "Project" ADD COLUMN "planningOverride" BOOLEAN;\nALTER TYPE "OtroOrigen" ADD VALUE 'ODOO';` },
    // Nombra la tabla buscada en un comentario y agrega la columna a OTRA.
    { nombre: "g-comentario.sql", texto: `-- Esto NO toca "SessionProject".\nALTER TABLE "Project" ADD COLUMN "implementationOverride" BOOLEAN;` },
    // Una sentencia que agrega varias columnas, en varias líneas.
    { nombre: "h-varias.sql", texto: 'ALTER TABLE "CuentaFinanciera"\n  ADD COLUMN IF NOT EXISTS "viaCobroPor" TEXT,\n  ADD COLUMN IF NOT EXISTS "viaCobroEn" TIMESTAMP(3);' },
    // Dos sentencias seguidas: la columna buscada va en la SEGUNDA, sobre otra tabla.
    { nombre: "i-dos-sentencias.sql", texto: 'ALTER TABLE "SessionProject" ADD COLUMN "otra" TEXT;\nALTER TABLE "Project" ADD COLUMN "reviewedBy" TEXT;' },
  ];

  it("encuentra la sentencia que CREA cada cosa, no cualquier mención", () => {
    /* `e-otra-cosa.sql` nombra la tabla y la columna, pero no las crea: no es el SQL pendiente. */
    expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna: "planningOverride" }, ARCHIVOS)).toEqual(["a-columnas.sql"]);
    expect(sqlQueNombran({ clase: "tabla", tabla: "Cuestionario" }, ARCHIVOS)).toEqual(["b-tabla.sql"]);
    expect(sqlQueNombran({ clase: "enum", tipo: "FacturaOdooCambioTipo" }, ARCHIVOS)).toEqual(["c-enum.sql"]);
  });

  it("un `ADD VALUE` escrito como comentario también cuenta", () => {
    // `ALTER TYPE … ADD VALUE` no corre dentro de una transacción: varios archivos lo dejan comentado, para correr aparte.
    expect(sqlQueNombran({ clase: "valor", tipo: "CobranzaOrigenCobro", valor: "ODOO" }, ARCHIVOS)).toEqual(["d-valor.sql"]);
  });

  it("sin ningún SQL que lo nombre, lista vacía", () => {
    expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna: "otraColumna" }, ARCHIVOS)).toEqual([]);
  });

  it("una columna o un valor con el mismo nombre en OTRA tabla u OTRO enum no es la pista", () => {
    /* `f-homonimos.sql` crea `planningOverride` en `Project` y `ODOO` en `OtroOrigen`: no es el SQL
       que le falta a `SessionProject` ni a `CobranzaOrigenCobro`. */
    expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna: "planningOverride" }, ARCHIVOS)).not.toContain("f-homonimos.sql");
    expect(sqlQueNombran({ clase: "valor", tipo: "CobranzaOrigenCobro", valor: "ODOO" }, ARCHIVOS)).not.toContain("f-homonimos.sql");
    expect(sqlQueNombran({ clase: "columna", tabla: "Project", columna: "planningOverride" }, ARCHIVOS)).toEqual(["f-homonimos.sql"]);
  });

  it("⛔ la tabla y la columna tienen que estar en la MISMA sentencia", () => {
    /* La edición que lo pone en rojo: pedir las dos menciones en cualquier parte del archivo.
       `g-comentario.sql` nombra `SessionProject` en un comentario y agrega la columna a `Project`:
       la pista mandaría a correr un SQL que no arregla nada. */
    expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna: "implementationOverride" }, ARCHIVOS)).toEqual([]);
    expect(sqlQueNombran({ clase: "columna", tabla: "Project", columna: "implementationOverride" }, ARCHIVOS)).toEqual(["g-comentario.sql"]);
    // Tampoco vale saltar de una sentencia a la siguiente: el `;` la cierra.
    expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna: "reviewedBy" }, ARCHIVOS)).toEqual([]);
  });

  it("una sentencia que agrega varias columnas cuenta para cada una", () => {
    for (const columna of ["viaCobroPor", "viaCobroEn"]) {
      expect(sqlQueNombran({ clase: "columna", tabla: "CuentaFinanciera", columna }, ARCHIVOS), columna).toEqual(["h-varias.sql"]);
    }
  });

  it("el nombre se busca literal: un carácter de expresión regular no calza con otra cosa ni rompe", () => {
    // Una tabla mapeada con `@@map` puede llamarse como sea. `Cuest.onario` no es `Cuestionario`.
    expect(sqlQueNombran({ clase: "tabla", tabla: "Cuest.onario" }, ARCHIVOS)).toEqual([]);
    expect(sqlQueNombran({ clase: "tabla", tabla: "Rara(" }, ARCHIVOS)).toEqual([]);
  });

  it("con los SQL de verdad: las dos columnas del 2026-09-30 apuntan a su archivo", () => {
    const dir = path.join(process.cwd(), "scripts", "sql");
    const reales = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((nombre) => ({ nombre, texto: fs.readFileSync(path.join(dir, nombre), "utf8") }));
    for (const columna of ["planningOverride", "implementationOverride"]) {
      expect(sqlQueNombran({ clase: "columna", tabla: "SessionProject", columna }, reales), columna).toEqual([
        "2026-09-29-contexto-planificacion-ejecucion.sql",
      ]);
    }
  });
});

describe("mismoSchema — ¿el cliente generado es de este schema?", () => {
  it("la copia del generador viene reformateada: los espacios no cuentan", () => {
    const fuente = "model A {\r\n  id     String   @id\r\n\r\n  nombre String?\r\n}\r\n";
    const copia = "model A {\n  id String @id\n  nombre String?\n}\n";
    expect(mismoSchema(fuente, copia)).toBe(true);
  });

  it("⛔ un campo de más es otro schema: falta correr `prisma generate`", () => {
    const fuente = "model A {\n  id String @id\n  nuevo Boolean?\n}\n";
    const copia = "model A {\n  id String @id\n}\n";
    expect(mismoSchema(fuente, copia)).toBe(false);
  });
});
