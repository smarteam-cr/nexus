import { describe, expect, it } from "vitest";
import { summarizeRun, summarizePollResult } from "./poll-agent-run";

// El defecto que cubren estos casos: los CTAs de canvas pasaron a async y el toast decía
// "Listo — sin resultados" con el canvas COMPLETO en pantalla (el usuario lo leía como
// que había fallado). El resumen tiene que contar lo que el agente escribió, sea en
// cards, en bloques o en secciones del canvas.
describe("summarizeRun", () => {
  it("cuenta las secciones de los runners self-contained (GET del polling)", () => {
    expect(summarizeRun({ cards: [], sectionCount: 11 })).toBe("11 secciones");
    expect(summarizeRun({ cards: [], sectionCount: 1 })).toBe("1 sección");
  });

  it("cuenta las secciones en la respuesta SÍNCRONA, donde `sections` es un número", () => {
    expect(summarizeRun({ ok: true, sections: 8 } as { sections: number })).toBe("8 secciones");
  });

  it("cuenta los bloques del Kickoff tanto por `blocks` (síncrono) como por `blockCount` (polling)", () => {
    expect(summarizeRun({ blocks: [{}, {}, {}] })).toBe("3 bloques");
    expect(summarizeRun({ cards: [], blockCount: 6 })).toBe("6 bloques");
  });

  it("sigue contando cards y diagramas, ignorando las cards FLOWCHART/CHART", () => {
    expect(
      summarizeRun({ cards: [{ cardType: "TEXT" }, { cardType: "FLOWCHART" }], flowcharts: [{}] }),
    ).toBe("1 card + 1 diagrama");
  });

  it("solo dice «sin resultados» cuando de verdad no se escribió nada", () => {
    expect(summarizeRun({ cards: [] })).toBe("sin resultados");
    expect(summarizeRun({ cards: [], sectionCount: 0 })).toBe("sin resultados");
  });
});

describe("summarizePollResult", () => {
  it("arma el toast de éxito con lo que el runner escribió", () => {
    expect(summarizePollResult({ status: "DONE", cards: [], sectionCount: 11 })).toEqual({
      type: "success",
      message: "Listo — 11 secciones",
    });
  });
});
