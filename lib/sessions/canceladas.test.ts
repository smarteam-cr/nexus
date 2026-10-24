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

  it("la cola de Docs: la búsqueda por título y los reintentos dejan afuera a la cancelada sin su Doc; la del Doc adjunto se lee", () => {
    /* La edición que la pone en rojo: borrar el filtro de la pasada 2 o de los reintentos, o sumarlo «por simetría» a
       la pasada 1 (el kickoff técnico de CAV ocurrió, se borró del calendario y tiene su Doc: se tiene que leer). */
    const src = fuente("lib/google/meet-enrichment.ts");
    const bloque = (desde: string) => src.slice(src.indexOf(desde), src.indexOf("});", src.indexOf(desde)));
    expect(bloque("googleDocId: { not: null },"), "la pasada 1 (Doc adjunto) no filtra canceladas").not.toMatch(/cancelad|SE_LEE_SI_CANCELADA/i);
    expect(bloque("googleDocId: null,"), "la pasada 2 (Drive por el título)").toContain("...SE_LEE_SI_CANCELADA_TIENE_SU_DOC");
    expect(bloque("enrichAttempts: { gte: 1, lt: MAX_ENRICH_ATTEMPTS },"), "los reintentos").toContain("...SE_LEE_SI_CANCELADA_TIENE_SU_DOC");
  });

  it("el rescate y la vigilancia de reintentos usan la MISMA regla de la cola (no una copia a mano)", () => {
    expect(fuente("scripts/recuperar-transcripts-meet.ts")).toContain("SE_LEE_SI_CANCELADA_TIENE_SU_DOC");
    expect(fuente("scripts/check-invariants.ts")).toContain("SE_LEE_SI_CANCELADA_TIENE_SU_DOC");
    for (const rel of ["lib/google/meet-enrichment.ts", "scripts/recuperar-transcripts-meet.ts", "scripts/check-invariants.ts"]) {
      expect(fuente(rel), `${rel}: la regla escrita a mano`).not.toContain("{ canceladaEn: null }, { googleDocId");
    }
  });
});
