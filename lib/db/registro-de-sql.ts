/**
 * lib/db/registro-de-sql.ts — el registro de los `scripts/sql/` aplicados en cada base: la parte PURA.
 *
 * ── EL HUECO ─────────────────────────────────────────────────────────────────
 * Los cambios de base son `.sql` a mano en `scripts/sql/` (ARCHITECTURE Parte 0 · cap. D). Dos PCs y varias sesiones
 * los corren contra la misma producción, y no había dónde mirar cuáles ya corrieron: `check:esquema` dice lo que le
 * falta a la base del código de HOY, pero no ve un `.sql` que solo crea un índice, una política o un UPDATE de datos,
 * ni uno cuyo código todavía no salió. La tabla `SqlAplicado` (scripts/sql/2026-11-23-registro-de-sql.sql) guarda una
 * fila por archivo aplicado; esto es lo que no toca la base:
 *
 *   · `huellaDeSql`: sha256 del texto con los fines de línea en LF y sin BOM. Windows (autocrlf) y Linux ven el mismo
 *     archivo con fines distintos: sin normalizar, la misma versión daría dos huellas.
 *   · `partirEnSentencias` y `planDeAplicacion`: cómo se corre un archivo (en una transacción, con la suya propia, o
 *     sentencia por sentencia — la excepción de `ALTER TYPE … ADD VALUE` y `CONCURRENTLY`).
 *   · `pruebasDeLosArchivos` y `clasificarConElCatalogo`: el BACKFILL. Los `.sql` que corrieron antes de que existiera
 *     el registro se anotan solo si el esquema de la base PRUEBA que corrieron: cada tabla, columna, enum, valor,
 *     índice, restricción, RLS, política, función o disparador que el archivo crea está en el catálogo (y lo que
 *     borra, no está). Lo que un archivo posterior borra o renombra no cuenta como prueba.
 *   · `compararConElRegistro`: lo que lee `check:esquema` — los posteriores al baseline sin anotar, los que cambiaron
 *     después de anotarse y los anotados que este checkout no tiene.
 *
 * Quién habla con la base: `registro-de-sql-base.ts`. Decisión: docs/DECISIONS.md › «Registro de los SQL aplicados».
 */
import { createHash } from "node:crypto";

/** La tabla del registro. */
export const TABLA_DEL_REGISTRO = "SqlAplicado";
/** El archivo que la crea: el único que se puede aplicar en una base que todavía no tiene el registro. */
export const SQL_DEL_REGISTRO = "2026-11-23-registro-de-sql.sql";
/** La fecha de `prisma/migrations/0_init`: lo de esa fecha o antes ya está en el baseline y no se anota. */
export const FECHA_DEL_BASELINE = "2026-08-01";

export type ComoSeAnoto = "aplicado" | "demostrado" | "marcado";

export interface FilaDelRegistro {
  archivo: string;
  huella: string;
  aplicadoEn: Date;
  desde: string;
  como: ComoSeAnoto;
}

export interface ArchivoSql {
  /** El nombre, sin carpeta: `2026-11-23-registro-de-sql.sql`. */
  nombre: string;
  texto: string;
}

/** ¿Es un `scripts/sql/` posterior al baseline? (el nombre empieza con una fecha posterior a la de `0_init`) */
export function esPosteriorAlBaseline(nombre: string): boolean {
  return nombre.endsWith(".sql") && /^\d{4}-\d{2}-\d{2}/.test(nombre) && nombre.slice(0, 10) > FECHA_DEL_BASELINE;
}

// ── La huella ──────────────────────────────────────────────────────────────────────────────

/** El texto como lo ve cualquier máquina: sin BOM y con los fines de línea en LF (CRLF y CR sueltos incluidos). */
export function textoNormalizado(texto: string): string {
  return texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** sha256 (hex, 64) del texto normalizado. La misma versión da la misma huella en Windows y en Linux. */
export function huellaDeSql(texto: string): string {
  return createHash("sha256").update(textoNormalizado(texto), "utf8").digest("hex");
}

// ── Leer SQL sin ejecutarlo ────────────────────────────────────────────────────────────────

type Trozo =
  | { tipo: "codigo" | "comentario" | "literal"; texto: string }
  | { tipo: "dolar"; texto: string; marca: string; cuerpo: string };

const CARACTER_DE_NOMBRE = /[A-Za-z0-9_$\u0080-￿]/;
const MARCA_DE_DOLAR = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

/**
 * Parte el SQL en código, comentarios (`--` y `/* *\/`, anidados), literales (`'…'` con `''`, `E'…'` con `\`, y
 * `"…"`) y cuerpos `$marca$…$marca$`. Un literal o un comentario sin cerrar llega hasta el final: no lanza.
 */
function trozos(sql: string): Trozo[] {
  const salida: Trozo[] = [];
  let codigo = "";
  const cerrarCodigo = () => {
    if (codigo) salida.push({ tipo: "codigo", texto: codigo });
    codigo = "";
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const sig = sql[i + 1];
    if (c === "-" && sig === "-") {
      const fin = sql.indexOf("\n", i);
      const hasta = fin === -1 ? sql.length : fin;
      cerrarCodigo();
      salida.push({ tipo: "comentario", texto: sql.slice(i, hasta) });
      i = hasta;
      continue;
    }
    if (c === "/" && sig === "*") {
      let profundidad = 1;
      let j = i + 2;
      while (j < sql.length && profundidad > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          profundidad += 1;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          profundidad -= 1;
          j += 2;
        } else j += 1;
      }
      cerrarCodigo();
      salida.push({ tipo: "comentario", texto: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      // E'…' admite escapes con barra; la E es la letra pegada a la comilla, no el final de un nombre.
      const conBarra = c === "'" && /[Ee]/.test(sql[i - 1] ?? "") && !CARACTER_DE_NOMBRE.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < sql.length) {
        if (conBarra && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      j = Math.min(j, sql.length);
      cerrarCodigo();
      salida.push({ tipo: "literal", texto: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "$" && !CARACTER_DE_NOMBRE.test(sql[i - 1] ?? "")) {
      const m = MARCA_DE_DOLAR.exec(sql.slice(i));
      if (m) {
        const marca = m[0];
        const cierre = sql.indexOf(marca, i + marca.length);
        const fin = cierre === -1 ? sql.length : cierre + marca.length;
        const cuerpo = sql.slice(i + marca.length, cierre === -1 ? sql.length : cierre);
        cerrarCodigo();
        salida.push({ tipo: "dolar", texto: sql.slice(i, fin), marca, cuerpo });
        i = fin;
        continue;
      }
    }
    codigo += c;
    i += 1;
  }
  cerrarCodigo();
  return salida;
}

/**
 * El SQL sin comentarios, también los de adentro de un cuerpo `$$` (el de un `DO` o una función es código: un
 * `-- ALTER TYPE … ADD VALUE` comentado ahí adentro no corrió). Los literales quedan tal cual.
 */
export function quitarComentarios(sql: string): string {
  return trozos(sql)
    .map((t) => (t.tipo === "comentario" ? " " : t.tipo === "dolar" ? t.marca + quitarComentarios(t.cuerpo) + t.marca : t.texto))
    .join("");
}

/**
 * Las sentencias del nivel de arriba, sin el `;` final y sin las vacías (o solo de comentarios). Un `;` dentro de un
 * literal, un comentario o un cuerpo `$$` (un `DO`, una función) no parte. Límite conocido: el cuerpo estándar
 * `BEGIN ATOMIC … END` de una función SQL sí se partiría; ningún `.sql` del repo lo usa.
 */
export function partirEnSentencias(sql: string): string[] {
  const sentencias: string[] = [];
  let actual = "";
  for (const t of trozos(sql)) {
    if (t.tipo !== "codigo") {
      actual += t.texto;
      continue;
    }
    const partes = t.texto.split(";");
    partes.forEach((parte, k) => {
      actual += parte;
      if (k < partes.length - 1) {
        sentencias.push(actual);
        actual = "";
      }
    });
  }
  sentencias.push(actual);
  return sentencias.map((s) => s.trim()).filter((s) => quitarComentarios(s).trim() !== "");
}

// ── Cómo se aplica un archivo ──────────────────────────────────────────────────────────────

export type ModoDeAplicacion =
  /** El archivo entero en una transacción, y la fila del registro en la MISMA: o queda todo, o nada. */
  | "transaccion"
  /** El archivo trae su propio BEGIN/COMMIT: corre tal cual y se anota después (no es atómico con la anotación). */
  | "propia"
  /** Sentencia por sentencia, cada una por su cuenta, y se anota al final. */
  | "sentencias";

const CONTROL_DE_TRANSACCION = /^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)\b/i;
/** Lo que Postgres no corre dentro de un bloque de transacción (ni en un texto de varias sentencias). */
const FUERA_DE_TRANSACCION = /\bCONCURRENTLY\b|^\s*(?:VACUUM|CREATE\s+DATABASE|ALTER\s+SYSTEM)\b/i;

/**
 * Cómo correr un archivo. `sinTransaccion` lo pide la persona (`--sin-transaccion`): es el camino de un
 * `ALTER TYPE … ADD VALUE` cuyo valor se usa más abajo en el mismo archivo — Postgres 12 o más corre el ADD VALUE en
 * una transacción, pero el valor nuevo no se puede usar hasta que ella termina. `CONCURRENTLY`, `VACUUM`… lo imponen
 * solos. `motivo` dice por qué, para el simulacro.
 */
export function planDeAplicacion(
  texto: string,
  sinTransaccion = false,
): { modo: ModoDeAplicacion; sentencias: string[]; motivo: string } {
  const sentencias = partirEnSentencias(texto);
  const limpias = sentencias.map((s) => quitarComentarios(s).trim());
  if (sinTransaccion) return { modo: "sentencias", sentencias, motivo: "pediste --sin-transaccion" };
  const fuera = limpias.find((s) => FUERA_DE_TRANSACCION.test(s));
  if (fuera) {
    return { modo: "sentencias", sentencias, motivo: `«${fuera.slice(0, 60)}…» no corre dentro de una transacción` };
  }
  if (limpias.some((s) => CONTROL_DE_TRANSACCION.test(s))) {
    return { modo: "propia", sentencias, motivo: "el archivo trae su propio BEGIN/COMMIT" };
  }
  return { modo: "transaccion", sentencias, motivo: "una transacción, con la anotación adentro" };
}

/** ¿El error de Postgres se arregla corriendo sentencia por sentencia? Para sugerir `--sin-transaccion`. */
export function pideSinTransaccion(mensaje: string): boolean {
  return /cannot run inside a transaction block|cannot be executed (?:inside|from) a transaction block|unsafe use of new value/i.test(
    mensaje,
  );
}

// ── Las pruebas del backfill ───────────────────────────────────────────────────────────────

/** Algo del esquema que un `.sql` crea (o borra) y que el catálogo de Postgres puede confirmar. */
export type ObjetoDelEsquema =
  | { clase: "tabla"; tabla: string }
  | { clase: "columna"; tabla: string; columna: string }
  | { clase: "enum"; tipo: string }
  | { clase: "valor"; tipo: string; valor: string }
  | { clase: "indice"; indice: string; tabla: string | null }
  | { clase: "restriccion"; tabla: string; restriccion: string }
  | { clase: "rls"; tabla: string }
  | { clase: "politica"; tabla: string; politica: string }
  | { clase: "funcion"; funcion: string }
  | { clase: "disparador"; tabla: string; disparador: string };

/** Lo que el catálogo tiene que mostrar si el archivo corrió: el objeto existe, o (lo que borró) no existe. */
export interface Prueba {
  objeto: ObjetoDelEsquema;
  debeExistir: boolean;
  /** Ningún otro archivo (ni el baseline, ni policies.sql) hace lo mismo: esta prueba es de este archivo y de nadie más. */
  propia: boolean;
}

/** La clave con la que se busca en el catálogo (`clavesDelCatalogo`). */
export function claveDe(o: ObjetoDelEsquema): string {
  switch (o.clase) {
    case "tabla":
      return `tabla:${o.tabla}`;
    case "columna":
      return `columna:${o.tabla}.${o.columna}`;
    case "enum":
      return `enum:${o.tipo}`;
    case "valor":
      return `valor:${o.tipo}.${o.valor}`;
    case "indice":
      return `indice:${o.indice}`;
    case "restriccion":
      return `restriccion:${o.tabla}.${o.restriccion}`;
    case "rls":
      return `rls:${o.tabla}`;
    case "politica":
      return `politica:${o.tabla}.${o.politica}`;
    case "funcion":
      return `funcion:${o.funcion}`;
    case "disparador":
      return `disparador:${o.tabla}.${o.disparador}`;
  }
}

/** `tabla X`, `columna X.c`, `que no exista la tabla X`… para el simulacro. */
export function describirPrueba(p: Pick<Prueba, "objeto" | "debeExistir">): string {
  const o = p.objeto;
  const texto = (() => {
    switch (o.clase) {
      case "tabla":
        return `tabla ${o.tabla}`;
      case "columna":
        return `columna ${o.tabla}.${o.columna}`;
      case "enum":
        return `enum ${o.tipo}`;
      case "valor":
        return `valor ${o.tipo}.${o.valor}`;
      case "indice":
        return `índice ${o.indice}`;
      case "restriccion":
        return `restricción ${o.restriccion} de ${o.tabla}`;
      case "rls":
        return `RLS en ${o.tabla}`;
      case "politica":
        return `política ${o.politica} de ${o.tabla}`;
      case "funcion":
        return `función ${o.funcion}`;
      case "disparador":
        return `disparador ${o.disparador} de ${o.tabla}`;
    }
  })();
  return p.debeExistir ? texto : `que no exista la ${texto}`;
}

interface Evento {
  /** Posición en el texto sin comentarios: ordena los eventos de un mismo archivo. */
  pos: number;
  efecto: "crea" | "quita";
  objeto: ObjetoDelEsquema;
}

/** Un nombre: entre comillas, o sin ellas y entero (sin el lookahead, `auth.x` daría el nombre «aut»). */
const ID = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*(?![A-Za-z0-9_$]))`;
/** Un nombre, con `public.` opcional; si lo sigue otro `.`, es de otro schema y no se toma. */
const QID = String.raw`(?:(?:"public"|public)\s*\.\s*)?(${ID})(?!\s*\.)`;
const LISTA_DE_NOMBRES = new RegExp(QID, "g");
const NO_SON_NOMBRES = new Set(["cascade", "restrict", "if", "exists", "concurrently"]);
/** Las palabras que siguen a ADD y no son una columna. */
const ADD_QUE_NO_ES_COLUMNA = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "column", "value"]);

/** Postgres guarda los nombres hasta 63 bytes y corta el resto (NAMEDATALEN). */
const BYTES_DE_UN_NOMBRE = 63;
const codificador = new TextEncoder();

/** Cortado a 63 bytes sin partir una letra de varios bytes, como lo corta Postgres. */
function comoLoGuardaPostgres(n: string): string {
  if (codificador.encode(n).length <= BYTES_DE_UN_NOMBRE) return n;
  let corto = "";
  for (const letra of n) {
    if (codificador.encode(corto + letra).length > BYTES_DE_UN_NOMBRE) break;
    corto += letra;
  }
  return corto;
}

/** Un nombre de SQL como lo guarda Postgres: entre comillas, tal cual; sin comillas, en minúsculas; hasta 63 bytes. */
function nombre(id: string): string {
  return comoLoGuardaPostgres(id.startsWith('"') ? id.slice(1, -1).replace(/""/g, '"') : id.toLowerCase());
}

/** Los nombres de una lista (`DROP TABLE IF EXISTS "A", "B" CASCADE`). */
function nombresDeLista(lista: string): string[] {
  return [...lista.matchAll(LISTA_DE_NOMBRES)].map((m) => m[1]).filter((id) => !NO_SON_NOMBRES.has(id.toLowerCase())).map(nombre);
}

function todos(texto: string, patron: string): RegExpMatchArray[] {
  return [...texto.matchAll(new RegExp(patron, "gi"))];
}

/** Lo que abre un elemento de `CREATE TABLE (…)` sin ser una columna. */
const ELEMENTO_QUE_NO_ES_COLUMNA = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);
const NOMBRE_AL_INICIO = new RegExp(`^(${ID})`);

/**
 * Las columnas de un `CREATE TABLE "X" (…)` que empieza en `desde` (justo después del nombre): lo de adentro de los
 * paréntesis, partido en las comas de primer nivel. `[]` si no hay paréntesis (un `CREATE TABLE … AS SELECT`).
 */
function columnasDeLaDefinicion(t: string, desde: number): string[] {
  let i = desde;
  while (i < t.length && /\s/.test(t[i])) i += 1;
  if (t[i] !== "(") return [];
  const elementos: string[] = [];
  let actual = "";
  let profundidad = 0;
  for (let j = i + 1; j < t.length; j += 1) {
    const c = t[j];
    if (c === "'" || c === '"') {
      // Un literal o un nombre entre comillas entero (con `''` adentro son dos seguidos: da lo mismo).
      const cierre = t.indexOf(c, j + 1);
      const hasta = cierre === -1 ? t.length - 1 : cierre;
      actual += t.slice(j, hasta + 1);
      j = hasta;
      continue;
    }
    if (c === "(") profundidad += 1;
    if (c === ")") {
      if (profundidad === 0) {
        elementos.push(actual);
        break;
      }
      profundidad -= 1;
    }
    if (c === "," && profundidad === 0) {
      elementos.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  return elementos
    .map((e) => NOMBRE_AL_INICIO.exec(e.trim())?.[1])
    .filter((id): id is string => !!id && (id.startsWith('"') || !ELEMENTO_QUE_NO_ES_COLUMNA.has(id.toLowerCase())))
    .map(nombre);
}

/** ¿El archivo cambia datos (INSERT, UPDATE … SET, DELETE, TRUNCATE)? Esa parte el esquema no la puede probar. */
export function cambiaDatos(sql: string): boolean {
  const NOMBRE = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
  return new RegExp(
    String.raw`\b(?:INSERT\s+INTO|UPDATE\s+(?:ONLY\s+)?${NOMBRE}(?:\s*\.\s*${NOMBRE})?(?:\s+(?:AS\s+)?${NOMBRE})?\s+SET\b|DELETE\s+FROM|TRUNCATE\b)`,
    "i",
  ).test(quitarComentarios(sql));
}

/** Lo que crea y lo que borra un `.sql`, en el orden del texto. Ignora los comentarios. */
export function eventosDelSql(sql: string): Evento[] {
  const t = quitarComentarios(sql);
  const ev: Evento[] = [];
  const crea = (pos: number, objeto: ObjetoDelEsquema) => ev.push({ pos, efecto: "crea", objeto });
  const quita = (pos: number, objeto: ObjetoDelEsquema) => ev.push({ pos, efecto: "quita", objeto });
  const S = String.raw`\s+`;

  for (const m of todos(t, String.raw`\bCREATE${S}(?:UNLOGGED${S})?TABLE${S}(?:IF${S}NOT${S}EXISTS${S})?${QID}`)) {
    const tabla = nombre(m[1]);
    crea(m.index!, { clase: "tabla", tabla });
    // Sus columnas también: si no, un `ADD COLUMN IF NOT EXISTS` posterior de una columna que ya venía en la tabla
    // pasaría por prueba propia de ese otro archivo.
    for (const columna of columnasDeLaDefinicion(t, m.index! + m[0].length)) crea(m.index!, { clase: "columna", tabla, columna });
  }
  for (const m of todos(t, String.raw`\bCREATE${S}(?:OR${S}REPLACE${S})?(?:MATERIALIZED${S})?VIEW${S}(?:IF${S}NOT${S}EXISTS${S})?${QID}`)) {
    crea(m.index!, { clase: "tabla", tabla: nombre(m[1]) });
  }
  for (const m of todos(t, String.raw`\bDROP${S}(?:MATERIALIZED${S})?(?:TABLE|VIEW)${S}(?:IF${S}EXISTS${S})?([^;]*)`)) {
    for (const tabla of nombresDeLista(m[1])) quita(m.index!, { clase: "tabla", tabla });
  }

  // ALTER TABLE: lo de adentro de la sentencia, hasta el `;`.
  for (const m of todos(t, String.raw`\bALTER${S}TABLE${S}(?:IF${S}EXISTS${S})?(?:ONLY${S})?${QID}([^;]*)`)) {
    const tabla = nombre(m[1]);
    const cuerpo = m[2];
    const base = m.index! + m[0].length - cuerpo.length;
    for (const a of todos(cuerpo, String.raw`\bADD${S}(?:COLUMN${S})?(?:IF${S}NOT${S}EXISTS${S})?(${ID})`)) {
      if (!a[1].startsWith('"') && ADD_QUE_NO_ES_COLUMNA.has(a[1].toLowerCase())) continue;
      crea(base + a.index!, { clase: "columna", tabla, columna: nombre(a[1]) });
    }
    for (const a of todos(cuerpo, String.raw`\bADD${S}CONSTRAINT${S}(${ID})`)) {
      crea(base + a.index!, { clase: "restriccion", tabla, restriccion: nombre(a[1]) });
    }
    for (const a of todos(cuerpo, String.raw`\bDROP${S}COLUMN${S}(?:IF${S}EXISTS${S})?(${ID})`)) {
      quita(base + a.index!, { clase: "columna", tabla, columna: nombre(a[1]) });
    }
    for (const a of todos(cuerpo, String.raw`\bDROP${S}CONSTRAINT${S}(?:IF${S}EXISTS${S})?(${ID})`)) {
      quita(base + a.index!, { clase: "restriccion", tabla, restriccion: nombre(a[1]) });
    }
    for (const a of todos(cuerpo, String.raw`\bENABLE${S}ROW${S}LEVEL${S}SECURITY\b`)) crea(base + a.index!, { clase: "rls", tabla });
    for (const a of todos(cuerpo, String.raw`\bDISABLE${S}ROW${S}LEVEL${S}SECURITY\b`)) quita(base + a.index!, { clase: "rls", tabla });
    for (const a of todos(cuerpo, String.raw`\bRENAME${S}TO${S}(${ID})`)) {
      quita(base + a.index!, { clase: "tabla", tabla });
      crea(base + a.index!, { clase: "tabla", tabla: nombre(a[1]) });
    }
    for (const a of todos(cuerpo, String.raw`\bRENAME${S}CONSTRAINT${S}(${ID})${S}TO${S}(${ID})`)) {
      quita(base + a.index!, { clase: "restriccion", tabla, restriccion: nombre(a[1]) });
      crea(base + a.index!, { clase: "restriccion", tabla, restriccion: nombre(a[2]) });
    }
    for (const a of todos(cuerpo, String.raw`\bRENAME${S}(?:COLUMN${S})?(?!TO\b|CONSTRAINT\b)(${ID})${S}TO${S}(${ID})`)) {
      quita(base + a.index!, { clase: "columna", tabla, columna: nombre(a[1]) });
      crea(base + a.index!, { clase: "columna", tabla, columna: nombre(a[2]) });
    }
  }

  for (const m of todos(t, String.raw`\bCREATE${S}TYPE${S}${QID}${S}AS${S}ENUM\b`)) crea(m.index!, { clase: "enum", tipo: nombre(m[1]) });
  for (const m of todos(t, String.raw`\bDROP${S}TYPE${S}(?:IF${S}EXISTS${S})?([^;]*)`)) {
    for (const tipo of nombresDeLista(m[1])) quita(m.index!, { clase: "enum", tipo });
  }
  for (const m of todos(t, String.raw`\bALTER${S}TYPE${S}${QID}${S}ADD${S}VALUE${S}(?:IF${S}NOT${S}EXISTS${S})?'((?:[^']|'')*)'`)) {
    crea(m.index!, { clase: "valor", tipo: nombre(m[1]), valor: m[2].replace(/''/g, "'") });
  }
  for (const m of todos(t, String.raw`\bALTER${S}TYPE${S}${QID}${S}RENAME${S}VALUE${S}'((?:[^']|'')*)'${S}TO${S}'((?:[^']|'')*)'`)) {
    quita(m.index!, { clase: "valor", tipo: nombre(m[1]), valor: m[2].replace(/''/g, "'") });
    crea(m.index!, { clase: "valor", tipo: nombre(m[1]), valor: m[3].replace(/''/g, "'") });
  }
  for (const m of todos(t, String.raw`\bALTER${S}TYPE${S}${QID}${S}RENAME${S}TO${S}(${ID})`)) {
    quita(m.index!, { clase: "enum", tipo: nombre(m[1]) });
    crea(m.index!, { clase: "enum", tipo: nombre(m[2]) });
  }

  for (const m of todos(
    t,
    String.raw`\bCREATE${S}(?:UNIQUE${S})?INDEX${S}(?:CONCURRENTLY${S})?(?:IF${S}NOT${S}EXISTS${S})?(${ID})${S}ON${S}(?:ONLY${S})?${QID}`,
  )) {
    crea(m.index!, { clase: "indice", indice: nombre(m[1]), tabla: nombre(m[2]) });
  }
  for (const m of todos(t, String.raw`\bDROP${S}INDEX${S}(?:CONCURRENTLY${S})?(?:IF${S}EXISTS${S})?([^;]*)`)) {
    for (const indice of nombresDeLista(m[1])) quita(m.index!, { clase: "indice", indice, tabla: null });
  }
  for (const m of todos(t, String.raw`\bALTER${S}INDEX${S}(?:IF${S}EXISTS${S})?${QID}${S}RENAME${S}TO${S}(${ID})`)) {
    quita(m.index!, { clase: "indice", indice: nombre(m[1]), tabla: null });
    crea(m.index!, { clase: "indice", indice: nombre(m[2]), tabla: null });
  }

  for (const m of todos(t, String.raw`\bCREATE${S}POLICY${S}(${ID})${S}ON${S}${QID}`)) {
    crea(m.index!, { clase: "politica", politica: nombre(m[1]), tabla: nombre(m[2]) });
  }
  for (const m of todos(t, String.raw`\bDROP${S}POLICY${S}(?:IF${S}EXISTS${S})?(${ID})${S}ON${S}${QID}`)) {
    quita(m.index!, { clase: "politica", politica: nombre(m[1]), tabla: nombre(m[2]) });
  }

  for (const m of todos(t, String.raw`\bCREATE${S}(?:OR${S}REPLACE${S})?FUNCTION${S}${QID}\s*\(`)) crea(m.index!, { clase: "funcion", funcion: nombre(m[1]) });
  for (const m of todos(t, String.raw`\bDROP${S}FUNCTION${S}(?:IF${S}EXISTS${S})?${QID}`)) quita(m.index!, { clase: "funcion", funcion: nombre(m[1]) });

  for (const m of todos(t, String.raw`\bCREATE${S}(?:OR${S}REPLACE${S})?(?:CONSTRAINT${S})?TRIGGER${S}(${ID})[^;]*?\bON${S}${QID}`)) {
    crea(m.index!, { clase: "disparador", disparador: nombre(m[1]), tabla: nombre(m[2]) });
  }
  for (const m of todos(t, String.raw`\bDROP${S}TRIGGER${S}(?:IF${S}EXISTS${S})?(${ID})${S}ON${S}${QID}`)) {
    quita(m.index!, { clase: "disparador", disparador: nombre(m[1]), tabla: nombre(m[2]) });
  }

  return ev.sort((a, b) => a.pos - b.pos);
}

/**
 * Las claves que, si alguien las borra DESPUÉS, dejan sin valor una prueba de que `o` existe: la suya, la de su tabla
 * (borrar la tabla se lleva sus columnas, índices, restricciones, políticas, RLS y disparadores) y la de su enum.
 */
function clavesQueLaAnulan(o: ObjetoDelEsquema): string[] {
  const claves = [claveDe(o)];
  if ("tabla" in o && o.clase !== "tabla" && o.tabla) claves.push(`tabla:${o.tabla}`);
  if (o.clase === "valor") claves.push(`enum:${o.tipo}`);
  return claves;
}

/** Para una clave de índice, el borrado no sabe su tabla: se busca por nombre. */
function claveDeEvento(e: Evento): string {
  return claveDe(e.objeto);
}

/**
 * `prisma/policies.sql` prende el RLS de TODAS las tablas y crea `deny_all_non_superuser` en una lista, las dos cosas en
 * un bucle (`EXECUTE format(…)`) que esta lectura no ve, y se corre cuando sea (`npm run db:policies`). Que estén no
 * prueba que las puso un archivo: cuentan como prueba (tienen que estar), nunca como prueba propia.
 */
function puedeSerPropia(o: ObjetoDelEsquema): boolean {
  return o.clase !== "rls" && !(o.clase === "politica" && o.politica === "deny_all_non_superuser");
}

interface Momento {
  archivo: number;
  pos: number;
}
const despues = (a: Momento, b: Momento) => a.archivo > b.archivo || (a.archivo === b.archivo && a.pos > b.pos);

/**
 * Las pruebas de cada archivo, en el orden de nombre (que es el de aplicación).
 *
 *   · Lo que un archivo CREA es prueba si nada lo borra después (el mismo archivo más abajo, o uno posterior): el
 *     `DROP POLICY IF EXISTS x; CREATE POLICY x` de siempre deja la prueba en pie.
 *   · Lo que BORRA (una tabla, un enum) es prueba si nadie lo vuelve a crear después: el catálogo no debe tenerlo.
 *   · `propia`: ningún otro archivo —ni los de `fondo`: el baseline `0_init` y `policies.sql`, que pudieron haberlo
 *     hecho por su cuenta— hace lo mismo. Un archivo cuyas pruebas son todas compartidas no prueba que corrió él. El
 *     RLS y `deny_all_non_superuser` nunca son propias (`puedeSerPropia`).
 *
 * Devuelve un mapa nombre → pruebas, sin repetidas.
 */
export function pruebasDeLosArchivos(archivos: ReadonlyArray<ArchivoSql>, fondo: ReadonlyArray<ArchivoSql> = []): Map<string, Prueba[]> {
  const ordenados = [...archivos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const eventos = ordenados.map((a) => eventosDelSql(a.texto));

  const quitas = new Map<string, Momento[]>();
  const creas = new Map<string, Momento[]>();
  /** Cuántos archivos distintos (más el fondo) crean o quitan cada clave: para `propia`. */
  const autores = new Map<string, Set<string>>();
  const anotarAutor = (clave: string, autor: string) => autores.set(clave, (autores.get(clave) ?? new Set()).add(autor));

  eventos.forEach((lista, archivo) => {
    for (const e of lista) {
      const destino = e.efecto === "crea" ? creas : quitas;
      const clave = claveDeEvento(e);
      destino.set(clave, [...(destino.get(clave) ?? []), { archivo, pos: e.pos }]);
      anotarAutor(`${e.efecto}:${clave}`, ordenados[archivo].nombre);
    }
  });
  /** Lo que el fondo crea: una tabla o un enum que existía antes de cualquier archivo. */
  const creaElFondo = new Set<string>();
  for (const f of fondo) {
    for (const e of eventosDelSql(f.texto)) {
      anotarAutor(`${e.efecto}:${claveDeEvento(e)}`, `fondo:${f.nombre}`);
      if (e.efecto === "crea") creaElFondo.add(claveDeEvento(e));
    }
  }

  const resultado = new Map<string, Prueba[]>();
  eventos.forEach((lista, archivo) => {
    const pruebas = new Map<string, Prueba>();
    for (const e of lista) {
      const aca: Momento = { archivo, pos: e.pos };
      const clave = claveDeEvento(e);
      if (e.efecto === "crea") {
        const anulada = clavesQueLaAnulan(e.objeto).some((k) => (quitas.get(k) ?? []).some((q) => despues(q, aca)));
        if (anulada) continue;
        // Lo creado y borrado más arriba en el mismo archivo ya se descartó; acá queda en pie.
        const unico = (autores.get(`crea:${clave}`)?.size ?? 0) === 1;
        pruebas.set(`+${clave}`, { objeto: e.objeto, debeExistir: true, propia: unico && puedeSerPropia(e.objeto) });
      } else if (e.objeto.clase === "tabla" || e.objeto.clase === "enum") {
        const recreada = (creas.get(clave) ?? []).some((c) => despues(c, aca));
        if (recreada) continue;
        // Que algo NO exista prueba que el archivo lo borró solo si antes existía (lo creó el baseline o un archivo
        // anterior). Un `DROP TABLE IF EXISTS` de algo que nunca estuvo da verde corra o no corra el archivo.
        const existiaAntes = creaElFondo.has(clave) || (creas.get(clave) ?? []).some((c) => c.archivo < archivo);
        const unico = (autores.get(`quita:${clave}`)?.size ?? 0) === 1;
        pruebas.set(`-${clave}`, { objeto: e.objeto, debeExistir: false, propia: unico && existiaAntes });
      }
    }
    // Si el archivo crea y después borra lo mismo, la prueba de que existe ya no vale: la del borrado manda.
    for (const k of [...pruebas.keys()]) {
      if (k.startsWith("+") && pruebas.has(`-${k.slice(1)}`)) pruebas.delete(k);
    }
    resultado.set(ordenados[archivo].nombre, [...pruebas.values()]);
  });
  return resultado;
}

/** Una fila del catálogo para las pruebas (ver `registro-de-sql-base.ts › leerCatalogoParaPruebas`). */
export interface FilaDelCatalogoDePruebas {
  clase: string;
  objeto: string;
  miembro: string | null;
}

/** Del catálogo a las claves de `claveDe`. Clases: t tabla · c columna · y enum · e valor · i índice · k restricción ·
 *  r RLS · p política · f función · g disparador. Una clase que no se conoce se ignora. */
export function clavesDelCatalogo(filas: ReadonlyArray<FilaDelCatalogoDePruebas>): Set<string> {
  const claves = new Set<string>();
  for (const { clase, objeto, miembro } of filas) {
    const m = miembro ?? "";
    switch (clase) {
      case "t":
        claves.add(`tabla:${objeto}`);
        break;
      case "c":
        claves.add(`columna:${objeto}.${m}`);
        break;
      case "y":
        claves.add(`enum:${objeto}`);
        break;
      case "e":
        claves.add(`valor:${objeto}.${m}`);
        break;
      case "i":
        claves.add(`indice:${objeto}`);
        break;
      case "k":
        claves.add(`restriccion:${objeto}.${m}`);
        break;
      case "r":
        claves.add(`rls:${objeto}`);
        break;
      case "p":
        claves.add(`politica:${objeto}.${m}`);
        break;
      case "f":
        claves.add(`funcion:${objeto}`);
        break;
      case "g":
        claves.add(`disparador:${objeto}.${m}`);
        break;
    }
  }
  return claves;
}

export type VeredictoDelBackfill =
  | { estado: "demostrado"; pruebas: number }
  | { estado: "falta"; faltan: string[] }
  | { estado: "sin-prueba"; motivo: string };

/**
 * ¿El esquema prueba que el archivo corrió?
 *   · `demostrado`: todas sus pruebas están en el catálogo y al menos una es propia.
 *   · `falta`: alguna no está — lo más probable es que no corrió (o que corrió a medias). No se anota.
 *   · `sin-prueba`: no crea nada que el catálogo muestre (un UPDATE de datos) o todo lo suyo lo crea también otro
 *     archivo. Solo una persona puede anotarlo (`--marcar`).
 */
export function clasificarConElCatalogo(pruebas: ReadonlyArray<Prueba>, catalogo: ReadonlySet<string>): VeredictoDelBackfill {
  if (pruebas.length === 0) {
    return { estado: "sin-prueba", motivo: "no crea ni borra nada que el esquema muestre (datos, permisos…)" };
  }
  const faltan = pruebas.filter((p) => catalogo.has(claveDe(p.objeto)) !== p.debeExistir).map(describirPrueba);
  if (faltan.length > 0) return { estado: "falta", faltan };
  if (!pruebas.some((p) => p.propia)) {
    return { estado: "sin-prueba", motivo: "todo lo que crea lo crea también otro archivo (o el baseline)" };
  }
  return { estado: "demostrado", pruebas: pruebas.length };
}

// ── La línea de comandos ───────────────────────────────────────────────────────────────────

/**
 * Las banderas que npm se quedó. En PowerShell, `npm run db:sql -- x.sql --apply` pierde el `--` (PowerShell lo consume
 * al llamar a `npm.ps1`) y npm toma las banderas como configuración propia: el script nunca las ve. Las que npm no
 * conoce (`--sin-transaccion`, `--marcar`) las deja en `npm_config_<nombre>`; esto devuelve las que npm tiene y el script
 * no recibió, para frenar en vez de simular. ⚠ `--apply` npm no lo deja en ningún lado (probado con npm 10.9.2): esa no
 * se puede ver, y el simulacro lo avisa al final cuando lo lanzó npm.
 */
export function banderasQueSeQuedoNpm(
  banderas: readonly string[],
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return banderas.filter((b) => {
    const clave = `npm_config_${b.replace(/^--/, "").replace(/-/g, "_")}`;
    return env[clave] !== undefined && !argv.some((a) => a === b || a.startsWith(`${b}=`));
  });
}

// ── El registro contra el checkout ─────────────────────────────────────────────────────────

export interface EstadoDelRegistro {
  /** Posteriores al baseline que esta base no tiene anotados: o no corrieron, o corrieron por fuera del registro. */
  sinAnotar: string[];
  /** Anotados con otra huella: el archivo cambió después de aplicarse. */
  cambiados: Array<{ archivo: string; fila: FilaDelRegistro }>;
  /** Anotados que este checkout no tiene: de otra rama o de la otra PC. */
  ajenos: FilaDelRegistro[];
  /** Posteriores al baseline anotados con la misma huella. */
  alDia: number;
  /** Cuántos posteriores al baseline tiene el checkout. */
  posteriores: number;
}

/** `archivos`: todos los de `scripts/sql/` del checkout (los anteriores al baseline sirven para no llamarlos ajenos). */
export function compararConElRegistro(archivos: ReadonlyArray<ArchivoSql>, filas: ReadonlyArray<FilaDelRegistro>): EstadoDelRegistro {
  const porArchivo = new Map(filas.map((f) => [f.archivo, f]));
  const nombres = new Set(archivos.map((a) => a.nombre));
  const posteriores = archivos.filter((a) => esPosteriorAlBaseline(a.nombre)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const estado: EstadoDelRegistro = { sinAnotar: [], cambiados: [], ajenos: [], alDia: 0, posteriores: posteriores.length };
  for (const a of posteriores) {
    const fila = porArchivo.get(a.nombre);
    if (!fila) estado.sinAnotar.push(a.nombre);
    else if (fila.huella !== huellaDeSql(a.texto)) estado.cambiados.push({ archivo: a.nombre, fila });
    else estado.alDia += 1;
  }
  estado.ajenos = filas.filter((f) => !nombres.has(f.archivo)).sort((a, b) => a.archivo.localeCompare(b.archivo));
  return estado;
}
