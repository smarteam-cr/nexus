import { describe, expect, it } from "vitest";
import { piezaDesactualizadaPorHandoff } from "./piece-staleness";

const VIEJO = new Date("2026-07-01T10:00:00Z");
const NUEVO = new Date("2026-07-20T10:00:00Z");

const doc = (over: Partial<Parameters<typeof piezaDesactualizadaPorHandoff>[0]> = {}) => ({
  slug: "tech-requirements" as string | null,
  contentUpdatedAt: VIEJO as Date | string | null,
  hasContent: true,
  ...over,
});

describe("el requerimiento técnico avisa cuando el handoff corrió después", () => {
  it("handoff posterior al documento → desactualizado", () => {
    expect(piezaDesactualizadaPorHandoff(doc(), NUEVO)).toBe(true);
  });

  it("documento tocado después del handoff → al día", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ contentUpdatedAt: NUEVO }), VIEJO)).toBe(false);
  });

  it("mismo instante → al día (el encadenado escribe en la misma corrida)", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ contentUpdatedAt: VIEJO }), VIEJO)).toBe(false);
  });

  it("acepta fechas serializadas como string (así viajan por el JSON del listado)", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ contentUpdatedAt: VIEJO.toISOString() }), NUEVO.toISOString())).toBe(true);
  });
});

describe("no grita cuando no puede saber", () => {
  it("sin contenido no hay nada viejo: la fila ya dice 'vacía'", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ hasContent: false }), NUEVO)).toBe(false);
  });

  it("documento sin fecha de contenido (anterior a la marca) → no se marca", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ contentUpdatedAt: null }), NUEVO)).toBe(false);
  });

  it("proyecto sin handoff generado → no se marca", () => {
    expect(piezaDesactualizadaPorHandoff(doc(), null)).toBe(false);
  });

  it("fecha basura → no se marca (nunca revienta ni inventa)", () => {
    expect(piezaDesactualizadaPorHandoff(doc({ contentUpdatedAt: "no es una fecha" }), NUEVO)).toBe(false);
    expect(piezaDesactualizadaPorHandoff(doc(), "tampoco")).toBe(false);
  });
});

describe("solo aplica a la pieza que el handoff encadenaba", () => {
  for (const otra of ["kickoff", "diagnosis", "planning", "implementation", "exploration", null]) {
    it(`${otra ?? "canvas custom (sin slug)"} nunca se marca por el handoff`, () => {
      expect(piezaDesactualizadaPorHandoff(doc({ slug: otra }), NUEVO)).toBe(false);
    });
  }
});
