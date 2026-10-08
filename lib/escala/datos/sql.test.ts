/**
 * lib/escala/datos/sql.test.ts — el SQL de la escala como datos, congelado.
 *
 *   · Crea las dos tablas y deja las dos cerradas para `anon` (RLS + RESTRICTIVE), espejadas en
 *     prisma/policies.sql. La escala en edición y su bitácora no se leen desde el navegador.
 *   · Un solo borrador a la vez: lo asegura la base, no solo el código.
 *   · Se puede re-correr (la base local lo reaplica en cada bootstrap) y no toca ninguna tabla que ya
 *     existía: solo suma.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n?/g, "\n");
const SQL = leer(path.join("scripts", "sql", "2026-10-08-escala-como-datos.sql"));
const sentencias = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const tablas = [...sentencias.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);

describe("el SQL de la escala como datos", () => {
  it("crea las dos tablas", () => {
    expect(tablas).toEqual(["EscalaVersion", "EscalaCambio"]);
  });

  it.each(tablas)("%s: RLS encendido y política RESTRICTIVE que niega todo, también en prisma/policies.sql", (t) => {
    expect(sentencias).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    expect(sentencias).toContain(`CREATE POLICY deny_all_non_superuser ON "${t}" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);`);
    expect(leer(path.join("prisma", "policies.sql"))).toContain(`CREATE POLICY deny_all_non_superuser ON "${t}"`);
  });

  it("un solo borrador a la vez, por índice único parcial", () => {
    expect(sentencias).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "EscalaVersion_un_borrador"\s+ON "EscalaVersion" \("estado"\) WHERE "estado" = 'borrador';/);
  });

  it("se puede re-correr y solo suma", () => {
    // (`ON UPDATE CASCADE` de una FK no es un UPDATE: se busca la sentencia, al principio de la línea.)
    expect(sentencias).not.toMatch(/\b(DROP TABLE|DROP COLUMN|ALTER COLUMN|RENAME|TRUNCATE|DELETE FROM)\b|^\s*UPDATE\s/im);
    for (const l of sentencias.split("\n").filter((x) => /^(CREATE (UNIQUE )?INDEX|CREATE TABLE)/.test(x))) expect(l, l).toContain("IF NOT EXISTS");
    // Las FK y las políticas, envueltas para no fallar la segunda vez.
    expect(sentencias.match(/ADD CONSTRAINT/g)?.length).toBe(sentencias.match(/EXCEPTION WHEN duplicate_object THEN NULL/g)?.length);
    expect(sentencias.match(/CREATE POLICY/g)?.length).toBe(sentencias.match(/DROP POLICY IF EXISTS/g)?.length);
    // Las únicas tablas existentes que nombra son las de las FK, y solo para referenciarlas.
    const otras = [...sentencias.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]).filter((t) => !tablas.includes(t));
    expect(otras).toEqual([]);
  });
});
