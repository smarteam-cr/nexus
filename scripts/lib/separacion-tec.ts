/**
 * scripts/lib/separacion-tec.ts — QUÉ es la separación del TEC, en un solo lugar (2026-10-29).
 *
 * La aplica scripts/separar-tec.ts. scripts/reubicar-reuniones-compartidas.ts la SIMULA en memoria cuando todavía no
 * se aplicó (o cuando la base no tiene la columna `comparteDominioConId`, antes del SQL): así el simulacro de las
 * reuniones se puede mirar antes del deploy, con exactamente los nombres, siglas y proyecto que dejará el otro script.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptPool } from "./db";

export const SEPARACION_TEC = {
  /** «TEC», la ficha vieja con los dominios y la empresa de HubSpot del ITCR: queda como TAE. */
  duenaId: "cmpc0dmsq001kxgijrw1y0bzd",
  duena: { nombre: "TEC · TAE", sigla: "TAE" },
  /** «TEC- AE», creada el 22 jul y vacía: queda como AE y comparte el dominio de la dueña. */
  entidadId: "cmrw92hc7005h07n14cdkxe6e",
  entidad: { nombre: "TEC · AE", sigla: "AE" },
  /** «AE | RE-IMPLEMENTACION HUBSPOT»: pasa a la ficha de AE. */
  proyectoDeLaEntidadId: "cmqze5p7y002qe4ij1bv4m145",
  /** La propuesta «AE - Smartloop» y su preventa: no tienen proyecto, pero son de AE (su reunión es «AE | …»). */
  propuestaDeLaEntidadId: "cmvimgzt105tz06pgcjryydji",
  exploracionDeLaEntidadId: "cmvil2i8v04rt06pg12clzis4",
} as const;

const S = SEPARACION_TEC;

export const conSigla = (siglas: readonly string[], s: string): string[] =>
  siglas.some((x) => x.toUpperCase() === s.toUpperCase()) ? [...siglas] : [...siglas, s];

/** Un cliente como quedará después de separar. Los demás, igual. */
export function clienteSeparado<T extends { id: string; name: string; siglas?: string[] | null; comparteDominioConId?: string | null }>(c: T): T {
  if (c.id === S.duenaId) return { ...c, name: S.duena.nombre, siglas: conSigla(c.siglas ?? [], S.duena.sigla) };
  if (c.id === S.entidadId) return { ...c, name: S.entidad.nombre, siglas: conSigla(c.siglas ?? [], S.entidad.sigla), comparteDominioConId: S.duenaId };
  return c;
}

/** La ficha de una fila (con `clientId` y quizá `projectId`) después de separar: lo del proyecto de AE va a AE. */
export function clientIdTrasSeparar(f: { clientId: string; projectId?: string | null }): string {
  return f.clientId === S.duenaId && f.projectId === S.proyectoDeLaEntidadId ? S.entidadId : f.clientId;
}

/**
 * Las columnas escalares de cada modelo y si aceptan null, leídas de prisma/schema.prisma (el dmmf de Prisma 7 en
 * runtime no trae `isRequired`). Clave: el nombre del modelo; valor: columna → acepta null.
 */
export function columnasDelEsquema(): Map<string, Map<string, boolean>> {
  const texto = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8").replace(/\r/g, "");
  const out = new Map<string, Map<string, boolean>>();
  for (const m of texto.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const cols = new Map<string, boolean>();
    for (const linea of m[2]!.split("\n")) {
      const f = linea.trim().match(/^(\w+)\s+(String|Int|Float|Boolean|DateTime|Json|Decimal|BigInt|Bytes)(\?|\[\])?(\s|$)/);
      if (f) cols.set(f[1]!, f[3] === "?");
    }
    out.set(m[1]!, cols);
  }
  return out;
}

/** ¿La base ya tiene la columna? Antes del SQL, no: los simulacros no pueden pedirla. */
export async function hayColumnaComparteDominio(): Promise<boolean> {
  const { pool, close } = createScriptPool();
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Client' AND column_name = 'comparteDominioConId'`,
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    await close();
  }
}

/** El `comparteDominioConId` guardado de cada ficha (vacío si la columna no existe todavía). */
export async function comparteDominioGuardado(): Promise<Map<string, string>> {
  if (!(await hayColumnaComparteDominio())) return new Map();
  const { pool, close } = createScriptPool();
  try {
    const r = await pool.query<{ id: string; c: string }>(
      `SELECT id, "comparteDominioConId" AS c FROM "Client" WHERE "comparteDominioConId" IS NOT NULL`,
    );
    return new Map(r.rows.map((x) => [x.id, x.c]));
  } finally {
    await close();
  }
}
