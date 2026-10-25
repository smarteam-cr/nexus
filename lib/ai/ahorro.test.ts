/**
 * lib/ai/ahorro.test.ts — las palancas de ahorro que deciden algo (U22).
 */
import { describe, expect, it } from "vitest";
import { entradaPorLote } from "./ahorro";

describe("entradaPorLote", () => {
  it("⭐ con cambios del cronograma sin revisar, en el momento: el lote no los reclama y nadie más los tría en producción", () => {
    expect(entradaPorLote({ prendido: true, eventosSinProcesar: 2 })).toBe(false);
  });
  it("sin cambios, por lote; apagada la palanca, en el momento", () => {
    expect(entradaPorLote({ prendido: true, eventosSinProcesar: 0 })).toBe(true);
    expect(entradaPorLote({ prendido: false, eventosSinProcesar: 0 })).toBe(false);
  });
});
