import { describe, expect, it } from "vitest";
import { hayDeudaDelCliente, resumirFacturacion, textoDeVencidas, type CobroDeLaCuenta } from "./facturacion-de-la-cuenta";

const HOY = "2026-10-04";
const cobro = (o: Partial<CobroDeLaCuenta>): CobroDeLaCuenta => ({
  estado: "POR_COBRAR",
  fechaProgramada: "2026-09-01",
  fechaEmision: null,
  fechaCobro: null,
  promesaPago: null,
  monto: 1000,
  moneda: "USD",
  ...o,
});

describe("resumirFacturacion", () => {
  it("sin cobros no hay resumen (la cuenta no está en Cobranza)", () => {
    expect(resumirFacturacion([], HOY)).toBeNull();
  });

  it("vencida = factura emitida y crédito corrido, con los mismos 15 días de Cobranza", () => {
    const f = resumirFacturacion(
      [
        cobro({ fechaEmision: "2026-08-20", monto: 2300 }), // vence 4 sep → 30 días
        cobro({ fechaEmision: "2026-09-25", monto: 900 }), // vence 10 oct → todavía no
      ],
      HOY,
    )!;
    expect(f.vencidas).toEqual({ cantidad: 1, montos: { USD: 2300 }, diasMax: 30 });
    expect(hayDeudaDelCliente(f)).toBe(true);
    expect(textoDeVencidas(f)).toBe("1 factura vencida por US$2.300 (la más vieja, hace 30 días)");
  });

  it("respeta el crédito propio de la cuenta", () => {
    const f = resumirFacturacion([cobro({ fechaEmision: "2026-08-20" })], HOY, 90)!;
    expect(f.vencidas.cantidad).toBe(0);
  });

  it("sin facturar NO es deuda del cliente: se cuenta aparte, pasada la gracia", () => {
    const f = resumirFacturacion(
      [cobro({ fechaProgramada: "2026-09-20" }), cobro({ fechaProgramada: "2026-10-01" })],
      HOY,
    )!;
    expect(f.vencidas.cantidad).toBe(0);
    expect(f.sinFacturarAtrasadas).toEqual({ cantidad: 1, diasMax: 14 });
    expect(hayDeudaDelCliente(f)).toBe(false);
  });

  it("las monedas no se suman entre sí", () => {
    const f = resumirFacturacion(
      [cobro({ fechaEmision: "2026-08-01", monto: 500 }), cobro({ fechaEmision: "2026-08-01", monto: 250000, moneda: "CRC" })],
      HOY,
    )!;
    expect(f.vencidas.montos).toEqual({ USD: 500, CRC: 250000 });
    expect(textoDeVencidas(f)).toContain("US$500 y ₡250.000");
  });

  it("una promesa pasada sin pago es incumplida", () => {
    const f = resumirFacturacion([cobro({ fechaEmision: "2026-09-01", promesaPago: "2026-09-30" })], HOY)!;
    expect(f.promesasIncumplidas).toBe(1);
  });

  it("guarda el último pago", () => {
    const f = resumirFacturacion(
      [cobro({ estado: "COBRADO", fechaCobro: "2026-08-15" }), cobro({ estado: "COBRADO", fechaCobro: "2026-09-15" })],
      HOY,
    )!;
    expect(f.ultimoPago).toBe("2026-09-15");
    expect(hayDeudaDelCliente(f)).toBe(false);
  });
});
