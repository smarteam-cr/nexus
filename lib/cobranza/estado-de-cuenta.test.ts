/**
 * lib/cobranza/estado-de-cuenta.test.ts — las reglas del estado de cuenta que ve el cliente (pedido 17, 2026-11-13).
 *
 * Correr: `npx vitest run lib/cobranza/estado-de-cuenta.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { armarEstadoDeCuenta, fechaCorta, mesDelPeriodo, type CuotaDeLaCuenta } from "./estado-de-cuenta";

const HOY = "2026-11-13";

const cuota = (x: Partial<CuotaDeLaCuenta>): CuotaDeLaCuenta => ({
  estado: "POR_COBRAR",
  periodo: "2026-10",
  fechaProgramada: "2026-10-15",
  fechaEmision: "2026-10-15",
  fechaCobro: null,
  numeroFactura: "FAC/2026/0100",
  monto: 1000,
  moneda: "USD",
  tipoServicio: "SUSCRIPCION",
  ...x,
});

const armar = (cuotas: CuotaDeLaCuenta[], creditoDias: number | null = 15, moneda: string | null = "USD") =>
  armarEstadoDeCuenta(cuotas, { hoy: HOY, creditoDias, monedaDeLaCuenta: moneda });

describe("qué se le muestra al cliente", () => {
  it("vencida = facturada con el crédito consumido; por vencer = facturada dentro del crédito", () => {
    const e = armar([
      cuota({ fechaEmision: "2026-10-01", numeroFactura: "A" }), // vence 16 oct → vencida
      cuota({ fechaEmision: "2026-11-05", numeroFactura: "B" }), // vence 20 nov → por vencer
    ]);
    expect(e.porPagar.map((f) => [f.numero, f.estado])).toEqual([
      ["A", "vencida"],
      ["B", "porVencer"],
    ]);
    expect(e.porPagar[0].vence).toBe("2026-10-16");
    expect(e.porPagar[0].diasVencida).toBe(28);
    expect(e.totales[0]).toMatchObject({ moneda: "USD", facturado: 2000, pagado: 0, porPagar: 2000, vencido: 1000, nVencidas: 1 });
  });

  it("usa los días de crédito de la cuenta (Colby: 90), y 15 si la cuenta no los dice", () => {
    const c = cuota({ fechaEmision: "2026-10-01" });
    expect(armar([c], 90).porPagar[0].estado).toBe("porVencer");
    expect(armar([c], null).porPagar[0].estado).toBe("vencida");
    expect(armar([c], null).creditoDias).toBe(15);
  });

  it("⛔ lo que no se facturó no es deuda: no sale, aunque su fecha ya pasó", () => {
    const e = armar([cuota({ fechaEmision: null, fechaProgramada: "2026-08-01", estado: "PROGRAMADO" })]);
    expect(e.porPagar).toEqual([]);
    expect(e.totales).toEqual([]);
  });

  it("⛔ SIN_DATO no sale: al cliente no se le muestra una suposición", () => {
    expect(armar([cuota({ estado: "SIN_DATO" })]).totales).toEqual([]);
  });

  it("lo pagado cuenta como facturado y pagado, también sin fecha de emisión: Facturado = Pagado + Por pagar", () => {
    const e = armar([
      cuota({ estado: "COBRADO", fechaCobro: "2026-10-20", numeroFactura: "P1" }),
      cuota({ estado: "COBRADO", fechaEmision: null, fechaCobro: "2026-09-02", numeroFactura: null, monto: 500.5 }),
      cuota({ fechaEmision: "2026-11-10", monto: 200.25 }),
    ]);
    const t = e.totales[0];
    expect(t).toMatchObject({ facturado: 1700.75, pagado: 1500.5, porPagar: 200.25, vencido: 0 });
    expect(Math.round((t.pagado + t.porPagar) * 100)).toBe(Math.round(t.facturado * 100));
    expect(e.pagadas.map((f) => f.pagada)).toEqual(["2026-10-20", "2026-09-02"]);
    expect(e.pagadas[1].emitida).toBeNull();
  });

  it("⛔ nunca suma ni convierte monedas: un bloque por moneda, la de la cuenta primero", () => {
    const e = armar(
      [cuota({ moneda: "USD", monto: 100 }), cuota({ moneda: "CRC", monto: 50000 }), cuota({ moneda: "CRC", monto: 25000 })],
      15,
      "CRC",
    );
    expect(e.totales.map((t) => [t.moneda, t.facturado])).toEqual([
      ["CRC", 75000],
      ["USD", 100],
    ]);
  });

  it("suma en centavos: 0,1 + 0,2 da 0,3", () => {
    expect(armar([cuota({ monto: 0.1 }), cuota({ monto: 0.2 })]).totales[0].facturado).toBe(0.3);
  });

  it("⛔ la factura no lleva nada interno: solo número, concepto, mes, fechas, monto y estado", () => {
    const e = armar([cuota({})]);
    expect(Object.keys(e.porPagar[0]).sort()).toEqual(["concepto", "diasVencida", "emitida", "estado", "moneda", "monto", "numero", "pagada", "periodo", "vence"]);
  });
});

describe("las fechas, sin Intl", () => {
  it("el mes del periodo y la fecha corta", () => {
    expect(mesDelPeriodo("2026-09")).toBe("Septiembre 2026");
    expect(mesDelPeriodo("raro")).toBe("raro");
    expect(fechaCorta("2026-09-05")).toBe("5 sep 2026");
    expect(fechaCorta(null)).toBe("—");
  });
});
