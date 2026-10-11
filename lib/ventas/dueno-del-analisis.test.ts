import { describe, it, expect } from "vitest";
import { duenosPorCantidad, sesionesDelDueno, unDuenoParaElAnalisis } from "./dueno-del-analisis";

const s = (resolvedClientId: string | null, manualClientId: string | null = null) => ({
  resolvedClientId,
  manualClientId,
});

describe("unDuenoParaElAnalisis: un grupo de reuniones, un solo cliente", () => {
  it("un dueño → se puede, con ese cliente", () => {
    expect(unDuenoParaElAnalisis([s("a"), s("a")])).toEqual({ ok: true, clientId: "a" });
  });

  it("LA guarda: dos dueños → no se mezclan en el mismo prompt", () => {
    const r = unDuenoParaElAnalisis([s("a"), s("b"), s("a")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([...r.duenos].sort()).toEqual(["a", "b"]);
  });

  it("todas sin dueño → se puede (prospecto sin resolver, como en la propuesta comercial)", () => {
    expect(unDuenoParaElAnalisis([s(null), s(null)])).toEqual({ ok: true, clientId: null });
  });

  it("una sin dueño y una con dueño → cuenta el dueño", () => {
    expect(unDuenoParaElAnalisis([s(null), s("a")])).toEqual({ ok: true, clientId: "a" });
  });

  it("un manual colgado no le gana a la resolución viva", () => {
    expect(unDuenoParaElAnalisis([s("a", "cliente-borrado"), s("a")])).toEqual({ ok: true, clientId: "a" });
  });

  it("sin resolución, el manual decide el dueño", () => {
    expect(unDuenoParaElAnalisis([s(null, "a"), s("a")])).toEqual({ ok: true, clientId: "a" });
  });
});

describe("un grupo con reuniones de varias empresas: se analiza una y se avisa el resto", () => {
  it("los dueños van del que tiene más reuniones al que tiene menos", () => {
    expect(duenosPorCantidad([s("b"), s("a"), s("a"), s(null), s("c")])).toEqual(["a", "b", "c"]);
    expect(duenosPorCantidad([s(null)])).toEqual([]);
  });

  it("al análisis de un dueño van sus reuniones y las que no son de nadie; nunca las de otro", () => {
    const grupo = [{ id: 1, ...s("a") }, { id: 2, ...s("b") }, { id: 3, ...s(null) }];
    expect(sesionesDelDueno(grupo, "a").map((x) => x.id)).toEqual([1, 3]);
    expect(sesionesDelDueno(grupo, null).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
