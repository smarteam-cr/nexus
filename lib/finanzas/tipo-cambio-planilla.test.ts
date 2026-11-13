/**
 * lib/finanzas/tipo-cambio-planilla.test.ts — la planilla en dólares y el aviso de tipo de cambio (2026-11-13).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  UMBRALES_POR_DEFECTO,
  errorDeUmbrales,
  movimientoDelTipoDeCambio,
  planillaEnDolares,
  tasaDeReferencia,
  textoDelMovimiento,
} from "./tipo-cambio-planilla";
import { diasDelMes } from "./tipo-cambio";

/** Todos los días de un mes con la misma venta. */
const mes = (periodo: string, venta: number) => diasDelMes(periodo).map((fecha) => ({ fecha, venta }));

describe("la tasa de referencia: el promedio de la venta del último mes cerrado", () => {
  it("en noviembre, la de octubre (el mes en curso nunca)", () => {
    const dias = [...mes("2026-10", 456.72), ...mes("2026-11", 450)].filter((d) => d.fecha <= "2026-11-13");
    const r = tasaDeReferencia(dias, "2026-11-13");
    expect(r).toMatchObject({ periodo: "2026-10", crcPorUsd: 456.72, dias: 31, completo: true });
  });
  it("el 1 de diciembre pasa a ser la de noviembre", () => {
    const dias = [...mes("2026-10", 456), ...mes("2026-11", 450), { fecha: "2026-12-01", venta: 449 }];
    expect(tasaDeReferencia(dias, "2026-12-01")?.periodo).toBe("2026-11");
  });
  it("es un promedio: días distintos dan su media", () => {
    const dias = [
      { fecha: "2026-10-01", venta: 450 },
      { fecha: "2026-10-02", venta: 460 },
    ];
    const r = tasaDeReferencia(dias, "2026-11-13");
    expect(r?.crcPorUsd).toBe(455);
    expect(r?.completo).toBe(false);
  });
  it("sin ningún mes cerrado con tasas: null", () => {
    expect(tasaDeReferencia(mes("2026-11", 450).slice(0, 13), "2026-11-13")).toBeNull();
  });
});

describe("el aviso: vigilar desde el 3 %, decidir desde el 5 %, en las dos direcciones", () => {
  const conHoy = (venta: number) => [...mes("2026-10", 500), { fecha: "2026-11-13", venta }];
  const nivel = (venta: number) => movimientoDelTipoDeCambio(conHoy(venta), "2026-11-13", UMBRALES_POR_DEFECTO)?.nivel;

  it("los topes de siempre son 3 y 5", () => {
    expect(UMBRALES_POR_DEFECTO).toEqual({ vigilarPct: 3, decidirPct: 5 });
  });
  it("el colón se fortalece (menos colones por dólar): el caso que importa", () => {
    expect(nivel(490)).toBe("normal"); // −2 %
    expect(nivel(485)).toBe("vigilar"); // −3 %: justo en el tope ya avisa
    expect(nivel(475)).toBe("decidir"); // −5 %
    const m = movimientoDelTipoDeCambio(conHoy(475), "2026-11-13", UMBRALES_POR_DEFECTO)!;
    expect(m.pct).toBe(-5);
    expect(m.colonSeFortalece).toBe(true);
    expect(textoDelMovimiento(m)).toContain("se fortaleció 5,00 %");
  });
  it("el colón se debilita: también avisa", () => {
    expect(nivel(515)).toBe("vigilar");
    expect(nivel(530)).toBe("decidir");
    const m = movimientoDelTipoDeCambio(conHoy(530), "2026-11-13", UMBRALES_POR_DEFECTO)!;
    expect(m.colonSeFortalece).toBe(false);
    expect(textoDelMovimiento(m)).toContain("se debilitó");
  });
  it("con otros topes, el nivel cambia", () => {
    expect(movimientoDelTipoDeCambio(conHoy(490), "2026-11-13", { vigilarPct: 1, decidirPct: 2 })?.nivel).toBe("decidir");
  });
  it("sin la tasa de esta semana no hay aviso (no se compara contra una vieja)", () => {
    const dias = [...mes("2026-10", 500)];
    expect(movimientoDelTipoDeCambio(dias, "2026-11-13", UMBRALES_POR_DEFECTO)).toBeNull();
  });
  it("toma la del día anterior más cercano dentro de la semana (un domingo sin tasa)", () => {
    const dias = [...mes("2026-10", 500), { fecha: "2026-11-11", venta: 485 }];
    const m = movimientoDelTipoDeCambio(dias, "2026-11-13", UMBRALES_POR_DEFECTO)!;
    expect(m.hoy.fecha).toBe("2026-11-11");
    expect(m.nivel).toBe("vigilar");
  });
});

describe("los topes que edita Super Admin", () => {
  it("vigilar > 0, decidir > vigilar, decidir ≤ 50, dos decimales", () => {
    expect(errorDeUmbrales({ vigilarPct: 3, decidirPct: 5 })).toBeNull();
    expect(errorDeUmbrales({ vigilarPct: 3.1, decidirPct: 4.25 })).toBeNull();
    expect(errorDeUmbrales({ vigilarPct: 0, decidirPct: 5 })).toMatch(/mayor que 0/);
    expect(errorDeUmbrales({ vigilarPct: 5, decidirPct: 5 })).toMatch(/mayor que «vigilar»/);
    expect(errorDeUmbrales({ vigilarPct: 3, decidirPct: 60 })).toMatch(/50/);
    expect(errorDeUmbrales({ vigilarPct: 3.333, decidirPct: 5 })).toMatch(/decimales/);
    expect(errorDeUmbrales({ vigilarPct: Number.NaN, decidirPct: 5 })).toMatch(/dos porcentajes/);
  });
});

describe("la planilla en dólares: cada salario en su moneda, los colones al de hoy y al de referencia", () => {
  const m = {
    hoy: { fecha: "2026-11-13", venta: 475 },
    referencia: { periodo: "2026-10", crcPorUsd: 500, dias: 31, completo: true },
  };
  it("el colón fortalecido encarece la planilla en dólares, y dice cuánto", () => {
    const p = planillaEnDolares(
      [
        { montoMensual: 950_000, moneda: "CRC" },
        { montoMensual: 1_000_000, moneda: "CRC" },
        { montoMensual: 3_000, moneda: "USD" },
      ],
      m,
    )!;
    expect(p.colones).toBe(1_950_000);
    expect(p.dolares).toBe(3000);
    expect(p.colonesAlDeHoy).toBe(4105.26); // 1.950.000 ÷ 475
    expect(p.colonesAlDeReferencia).toBe(3900); // 1.950.000 ÷ 500
    expect(p.totalAlDeHoy).toBe(7105.26);
    expect(p.totalAlDeReferencia).toBe(6900);
    expect(p.diferencia).toBe(205.26);
    expect([p.enColones, p.enDolares]).toEqual([2, 1]);
  });
  it("sin salarios en colones el tipo de cambio no la mueve", () => {
    const p = planillaEnDolares([{ montoMensual: 2_000, moneda: "USD" }], m)!;
    expect(p.diferencia).toBe(0);
    expect(p.totalAlDeHoy).toBe(2000);
  });
});

describe("el FX se queda en la presentación", () => {
  it("convierte con convertir() de equilibrio.ts y no lo hace a mano", () => {
    const src = readFileSync("lib/finanzas/tipo-cambio-planilla.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).toMatch(/from "\.\/equilibrio"/);
    expect(src).not.toMatch(/\/\s*m\.(hoy\.venta|referencia\.crcPorUsd)/);
  });
});
