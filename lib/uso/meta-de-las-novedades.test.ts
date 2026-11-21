import { describe, expect, it } from "vitest";
import { META_DE_LAS_NOVEDADES, TANDA_DE_LA_META, metaDeLasNovedades } from "./meta-de-las-novedades";

describe("la meta de las novedades de los documentos (2026-11-20)", () => {
  it("cumple con menos de la mitad vencida, sobre una tanda ya cerrada (de 30 a 60 días)", () => {
    expect(META_DE_LAS_NOVEDADES.parteVencidaMaxima).toBe(0.5);
    expect(TANDA_DE_LA_META).toEqual({ desdeDias: 60, hastaDias: 30 });
    const m = metaDeLasNovedades({ usados: 6, desestimados: 2, vencidos: 4 });
    expect(m).toMatchObject({ cerradas: 12, vencidas: 4, estado: "cumple", valor: "33 % venció" });
    expect(m.texto).toContain("Cumple la meta de que venza menos del 50 %");
  });

  it("⛔ la mitad o más vencida no cumple", () => {
    expect(metaDeLasNovedades({ usados: 3, desestimados: 1, vencidos: 4 }).estado).toBe("no-cumple");
    expect(metaDeLasNovedades({ usados: 1, desestimados: 0, vencidos: 99 })).toMatchObject({ estado: "no-cumple", valor: "99 % venció" });
  });

  it("sin suficientes cerradas no se juzga", () => {
    expect(metaDeLasNovedades({ usados: 0, desestimados: 0, vencidos: 0 })).toMatchObject({ estado: "sin-datos", valor: "—", parteVencida: null });
    expect(metaDeLasNovedades({ usados: 2, desestimados: 0, vencidos: 5 }).texto).toContain("7 cerradas de 8");
  });
});
