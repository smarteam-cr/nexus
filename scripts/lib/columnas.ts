/**
 * scripts/lib/columnas.ts — qué columnas tiene cada tabla, leído del schema, y si la base ya tiene la marca de las
 * unidades (`Client.comparteDominioConId`). Lo usa scripts/separar-en-unidades.ts (antes vivía en
 * scripts/lib/separacion-tec.ts, con los nombres fijos del TEC).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptPool } from "./db";

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

/** ¿La base ya tiene la columna? Antes del SQL 2026-10-29-dominio-compartido.sql, no: el simulacro no puede pedirla. */
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
