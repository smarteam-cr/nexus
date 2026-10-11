import { describe, expect, it } from "vitest";
import { AVISO_DESACTUALIZADA, AVISO_DESACTUALIZADA_LARGO, piezaDesactualizadaPorHandoff } from "./piece-staleness";
import { ultimoCambioReal } from "@/lib/handoff/congelado";

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

describe("con el handoff congelado (etapa 3b), cuenta el último cambio real del handoff", () => {
  /* `handoffGeneratedAt` deja de moverse al congelar: el aviso sale de `ultimoCambioDelHandoff`
     (lib/handoff/congelado-server.ts), que suma la última edición posterior al congelado si cambió lo
     que dice el handoff. La regla pura es `ultimoCambioReal`. */
  const GENERADO = new Date("2026-06-20T10:00:00Z");
  const CONGELADO = new Date("2026-06-25T10:00:00Z");
  const requerimiento = doc({ contentUpdatedAt: VIEJO });

  it("una sugerencia usada (o una edición) después del congelado marca el requerimiento", () => {
    const cambio = ultimoCambioReal({ generadoAt: GENERADO, congeladoAt: CONGELADO, contenidoAt: NUEVO, cambioDesdeElCongelado: true });
    expect(piezaDesactualizadaPorHandoff(requerimiento, cambio)).toBe(true);
  });

  it("una edición anterior al congelado no marca", () => {
    const antes = new Date("2026-06-24T10:00:00Z");
    const cambio = ultimoCambioReal({ generadoAt: GENERADO, congeladoAt: CONGELADO, contenidoAt: antes, cambioDesdeElCongelado: true });
    expect(piezaDesactualizadaPorHandoff(requerimiento, cambio)).toBe(false);
  });

  it("descartar una sugerencia toca el documento pero no cambia lo vendido: no marca", () => {
    const cambio = ultimoCambioReal({ generadoAt: GENERADO, congeladoAt: CONGELADO, contenidoAt: NUEVO, cambioDesdeElCongelado: false });
    expect(piezaDesactualizadaPorHandoff(requerimiento, cambio)).toBe(false);
  });

  it("el texto largo dice que el handoff cambió (no solo que se regeneró) y va en tuteo", () => {
    expect(AVISO_DESACTUALIZADA).toBe("El handoff cambió después");
    expect(AVISO_DESACTUALIZADA_LARGO).toContain("se usó una sugerencia");
    expect(AVISO_DESACTUALIZADA_LARGO).not.toMatch(/\b(Revisalo|regeneralo)\b/);
  });
});
