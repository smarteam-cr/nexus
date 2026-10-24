/**
 * lib/sessions/canceladas.test.ts — la cancelada sin texto sale de TODOS los lugares que la regla nombra (U1).
 *
 * El comportamiento contra Postgres lo prueba `canceladas.int.test.ts`; esto vigila que ningún lector pierda el filtro
 * en silencio. Sin él, una cancelada vuelve al handoff, al buscador o —lo más caro— a la búsqueda de su Doc por el
 * título, que trae el de otra reunión (KNOWN-ERRORS, primera entrada).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** El código sin comentarios: un filtro citado en un comentario no cuenta. */
const fuente = (rel: string): string =>
  fs
    .readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

describe("el filtro de canceladas está donde la regla dice", () => {
  it("el chokepoint lo aplica en la membresía del proyecto, en getClientSessions y en el conteo sin revisar", () => {
    /* La edición que la pone en rojo: sacar NO_ES_CANCELADA_SIN_TEXTO de cualquiera de las tres consultas. */
    const src = fuente("lib/sessions/project-sources.ts");
    expect(src.match(/NO_ES_CANCELADA_SIN_TEXTO/g)?.length, "el import y las tres consultas").toBe(4);
    expect(src).toContain("where: { projectId, included: true, session: NO_ES_CANCELADA_SIN_TEXTO }");
    expect(src).toMatch(/reviewedAt: null, session: NO_ES_CANCELADA_SIN_TEXTO/);
  });

  it("el buscador «De tu calendario» lo aplica en la consulta que elige las reuniones", () => {
    const src = fuente("lib/sessions/calendario-de-quien-busca.ts");
    expect(src).toContain('AND ${noEsCanceladaSinTextoSql("s")}');
  });

  it("la cola de Docs: la búsqueda por título y los reintentos dejan afuera a la cancelada sin su Doc", () => {
    /* La edición que la pone en rojo: borrar `canceladaEn: null` de la pasada 2 o el OR de los reintentos. */
    const src = fuente("lib/google/meet-enrichment.ts");
    const pasada2 = src.slice(src.indexOf("googleDocId: null,"), src.indexOf("googleDocId: null,") + 200);
    expect(pasada2, "la pasada 2 (busca el Doc en Drive por el título)").toContain("canceladaEn: null");
    expect(src, "los reintentos").toContain("OR: [{ canceladaEn: null }, { googleDocId: { not: null } }]");
  });
});
