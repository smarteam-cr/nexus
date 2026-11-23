import { describe, it, expect } from "vitest";
import { duenosPorCantidad } from "./dueno-del-analisis";

const s = (resolvedClientId: string | null, manualClientId: string | null = null) => ({
  resolvedClientId,
  manualClientId,
});

describe("un grupo con reuniones de varias empresas: se analiza una y se avisa el resto", () => {
  it("los dueños van del que tiene más reuniones al que tiene menos", () => {
    expect(duenosPorCantidad([s("b"), s("a"), s("a"), s(null), s("c")])).toEqual(["a", "b", "c"]);
  });

  it("una reunión sin empresa no es la empresa de nadie: un grupo de puras sin empresa no tiene a quién analizar", () => {
    expect(duenosPorCantidad([s(null)])).toEqual([]);
    expect(duenosPorCantidad([s(null), s(null, null)])).toEqual([]);
  });

  it("el dueño es el resuelto; el manual cuenta solo si no hay resuelto (un manual colgado no le gana)", () => {
    expect(duenosPorCantidad([s("a", "cliente-borrado"), s("a")])).toEqual(["a"]);
    expect(duenosPorCantidad([s(null, "a"), s("a")])).toEqual(["a"]);
  });
});
