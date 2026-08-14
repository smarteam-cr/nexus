/**
 * lib/canvas/print-vocab.test.ts — el papel no se degrada en silencio.
 *
 * El PDF de un canvas NO usa el motor de landing: aplana el `data` crudo del bloque con
 * su propio vocabulario (ver print-vocab.ts). Por eso un cambio de forma en un schema
 * —el que motivó este test: `preguntas` de Exploración pasó de `string[]` a objetos—
 * deja la pantalla perfecta y arruina el papel, sin que `tsc` ni ningún test se enteren:
 * no hay tipos que romper, son diccionarios de strings.
 *
 * Este test recorre los schemas REALES de los documentos que se imprimen y exige que
 * cada clave caiga en algún balde del vocabulario, o que `humanize` produzca algo
 * presentable por sí solo. No juzga el gusto del rótulo: frena las claves que
 * imprimirían jerga ("Q:", "Repregunta:") o estado interno.
 */
import { describe, it, expect } from "vitest";
import { SKIP_KEYS, MD_KEYS, TITLE_KEYS, NO_LABEL_KEYS, KEY_LABELS, humanize, labelFor } from "./print-vocab";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";
import { DESARROLLO_SECTION_DEFS } from "@/components/landing/configs/desarrollo.defs";
import { DIAGNOSTICO_SECTION_DEFS } from "@/components/landing/configs/diagnostico.defs";
import { ENTREGA_SECTION_DEFS } from "@/components/landing/configs/entrega.defs";

/** Toda clave que aparece en un schema, a cualquier profundidad. */
function clavesDe(schema: unknown, out = new Set<string>()): Set<string> {
  const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown };
  if (s?.type === "object" && s.properties) {
    for (const [k, sub] of Object.entries(s.properties)) {
      out.add(k);
      clavesDe(sub, out);
    }
  }
  if (s?.type === "array") clavesDe(s.items, out);
  return out;
}

const DOCS = [
  ["exploración", EXPLORACION_SECTION_DEFS],
  ["desarrollo", DESARROLLO_SECTION_DEFS],
  ["diagnóstico", DIAGNOSTICO_SECTION_DEFS],
  /* La Entrega imprime por la rama GENÉRICA (no está en PRINT_DOC_TYPES), así que cada clave
     de su schema pasa por `labelFor` y una que falte sale con `humanize()` — sin tildes. Es el
     documento donde más duele: el PDF del cierre se lo manda el CSE al cliente. */
  ["entrega", ENTREGA_SECTION_DEFS],
] as const;

/** Una clave está "gobernada" si algún balde la nombra explícitamente. */
function gobernada(k: string): boolean {
  return SKIP_KEYS.has(k) || MD_KEYS.has(k) || TITLE_KEYS.includes(k) || NO_LABEL_KEYS.has(k) || k in KEY_LABELS;
}

describe("el vocabulario del PDF cubre los schemas que se imprimen", () => {
  it("ninguna clave corta (≤2 letras) queda librada a `humanize`", () => {
    // Es el caso exacto de la regresión: `q` humanizaba a "Q" y el papel salía con
    // "**Q:** ¿pregunta…?" debajo de cada pregunta del plan de sesiones.
    const sueltas: string[] = [];
    for (const [doc, defs] of DOCS) {
      for (const d of defs) {
        for (const k of clavesDe(d.schema)) {
          if (k.length <= 2 && !gobernada(k)) sueltas.push(`${doc}:${d.key}.${k}`);
        }
      }
    }
    expect(sueltas).toEqual([]);
  });

  it("ninguna clave imprime jerga sin acentos donde el castellano los pide", () => {
    // `humanize` no puede inventar tildes: "repregunta" salía "Repregunta", que como
    // rótulo de una instrucción no dice nada. Las claves así se declaran en KEY_LABELS.
    const sospechosas = ["repregunta", "objetivo", "participantes", "preguntas"];
    for (const k of sospechosas) {
      expect(labelFor(k), `"${k}" imprime un rótulo sin pensar`).toBeTruthy();
    }
    expect(labelFor("repregunta")).toBe("Si la respuesta sale vaga");
  });

  it("la pregunta TITULA su viñeta y la casilla del CSE no llega al papel", () => {
    // Sin `q` en TITLE_KEYS la pregunta sale etiquetada en vez de encabezar la viñeta.
    expect(TITLE_KEYS).toContain("q");
    // `hecha` es estado vivo: el PDF es una foto, imprimir "Hecha: si" es ruido vencido.
    expect(SKIP_KEYS.has("hecha")).toBe(true);
  });

  it("humanize sigue siendo el fallback razonable para claves largas en castellano", () => {
    expect(humanize("comoEsHoy")).toBe("Como es hoy");
    expect(humanize("fuera_de_alcance")).toBe("Fuera de alcance");
  });
});
