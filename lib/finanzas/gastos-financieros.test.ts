/**
 * lib/finanzas/gastos-financieros.test.ts — las comisiones de Stripe, las transferencias internacionales y el banco como
 * gasto financiero (2026-10-17).
 *
 * Correr: `npx vitest run lib/finanzas/gastos-financieros.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  candidatosDeGastoFinanciero,
  comisionStripeEstimada,
  desdeParaRevisar,
  egresosFinancieros,
  esCargoDeComision,
  revisionFinanciera,
  tipoDe,
  type GastoFinancieroDecidido,
  type MovimientoParaRevisar,
} from "./gastos-financieros";

let n = 0;
const mov = (p: Partial<MovimientoParaRevisar>): MovimientoParaRevisar => ({
  id: `m${++n}`,
  monto: 100,
  estado: "sent",
  tipo: "externalTransfer",
  contraparteNombre: "Cliente SA",
  descripcionBanco: null,
  nota: null,
  conTarjeta: false,
  fecha: "2026-09-10",
  ...p,
});

describe("qué movimiento es una comisión", () => {
  it("el cargo de una transferencia o el «fee» de Mercury sí; una compra con tarjeta no", () => {
    expect(esCargoDeComision(mov({ monto: -15, tipo: "wireFee", contraparteNombre: "Mercury" }))).toBe(true);
    expect(esCargoDeComision(mov({ monto: -20, descripcionBanco: "Comisión por transferencia" }))).toBe(true);
    expect(esCargoDeComision(mov({ monto: -45, conTarjeta: true, contraparteNombre: "Figma" }))).toBe(false);
    expect(esCargoDeComision(mov({ monto: -3, conTarjeta: true, tipo: "cardInternationalTransactionFee" }))).toBe(true);
    expect(esCargoDeComision(mov({ monto: -15, tipo: "wireFee", estado: "cancelled" }))).toBe(false);
  });

  it("prueba 34: la suscripción de Mercury no es comisión (ya es la herramienta «Mercury»), aunque su tipo diga «Fee»", () => {
    const suscripcion = mov({ monto: -35, tipo: "billingEngineSubscriptionFee", contraparteNombre: "Mercury Technologies, Inc.", descripcionBanco: "Mercury subscription fee" });
    expect(esCargoDeComision(suscripcion)).toBe(false);
    expect(candidatosDeGastoFinanciero([suscripcion], [], "2026-01-01")).toEqual([]);
  });

  it("prueba 34: la comisión por una compra con tarjeta afuera es del banco, no una transferencia internacional", () => {
    const m = mov({ monto: -0.51, tipo: "cardInternationalTransactionFee", contraparteNombre: "Intl. Transaction Fee" });
    expect(tipoDe(m)).toBe("BANCO");
    const [c] = candidatosDeGastoFinanciero([m], [], "2026-01-01");
    expect(c).toMatchObject({ tipo: "BANCO", como: "CARGO", montoPropuesto: 0.51 });
    expect(c.descripcion).toBe("Comisión de Mercury por una compra con tarjeta en el exterior.");
  });

  it("qué es, por quién pagó", () => {
    expect(tipoDe({ tipo: "externalTransfer", contraparteNombre: "STRIPE", descripcionBanco: null })).toBe("STRIPE");
    expect(tipoDe({ tipo: "incomingInternationalWire", contraparteNombre: "Acme", descripcionBanco: null })).toBe("TRANSFERENCIA_INTERNACIONAL");
    expect(tipoDe({ tipo: "externalTransfer", contraparteNombre: "1/ACME LLC", descripcionBanco: null })).toBe("TRANSFERENCIA_INTERNACIONAL");
    expect(tipoDe({ tipo: "wireFee", contraparteNombre: "Mercury", descripcionBanco: null })).toBe("BANCO");
    expect(tipoDe({ tipo: "wireFee", contraparteNombre: "Intl. Wire Fee", descripcionBanco: "OUR fee for international wire" })).toBe("TRANSFERENCIA_INTERNACIONAL");
  });
});

describe("los candidatos", () => {
  it("una entrada atada a su factura que llegó con menos: la diferencia, exacta", () => {
    const m = mov({ monto: 970.7, contraparteNombre: "Stripe", tipo: "externalTransfer" });
    const c = candidatosDeGastoFinanciero([m], [{ entradaId: m.id, facturaNumero: "INV-40", facturaMonto: 1000, cliente: "Acme" }], "2026-01-01");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ tipo: "STRIPE", como: "CALZA", montoPropuesto: 29.3, fecha: "2026-09-10" });
  });

  it("una entrada que pagó la factura entera no es candidato", () => {
    const m = mov({ monto: 1000 });
    expect(candidatosDeGastoFinanciero([m], [{ entradaId: m.id, facturaNumero: "INV-1", facturaMonto: 1000, cliente: "Acme" }], "2026-01-01")).toEqual([]);
  });

  it("un depósito de Stripe sin factura: la comisión se estima con la tarifa base, y lo dice", () => {
    const c = candidatosDeGastoFinanciero([mov({ monto: 970.7, contraparteNombre: "Stripe" })], [], "2026-01-01");
    expect(c[0]!.como).toBe("ESTIMADO");
    expect(c[0]!.montoPropuesto).toBe(comisionStripeEstimada(970.7));
    expect(c[0]!.descripcion).toMatch(/estimado/);
  });

  it("la tarifa base de Stripe sobre un neto devuelve el bruto que lo produjo", () => {
    expect(comisionStripeEstimada(970.7)).toBe(29.3);
    expect(comisionStripeEstimada(0)).toBe(0);
  });

  it("una entrada de un cliente sin factura y sin Stripe no es candidato; lo de antes de `desde`, tampoco", () => {
    expect(candidatosDeGastoFinanciero([mov({ monto: 500 })], [], "2026-01-01")).toEqual([]);
    expect(candidatosDeGastoFinanciero([mov({ monto: -15, tipo: "wireFee", fecha: "2025-12-31" })], [], "2026-01-01")).toEqual([]);
  });

  it("el más nuevo primero", () => {
    const c = candidatosDeGastoFinanciero(
      [mov({ monto: -10, tipo: "wireFee", fecha: "2026-03-01" }), mov({ monto: -12, tipo: "wireFee", fecha: "2026-05-01" })],
      [],
      "2026-01-01",
    );
    expect(c.map((x) => x.fecha)).toEqual(["2026-05-01", "2026-03-01"]);
  });
});

describe("la revisión y el punto de equilibrio", () => {
  const decidido = (p: Partial<GastoFinancieroDecidido>): GastoFinancieroDecidido => ({
    id: `g${++n}`,
    movimientoMercuryId: "m-x",
    tipo: "STRIPE",
    decision: "GASTO",
    fecha: "2026-09-10",
    monto: 29.3,
    moneda: "USD",
    montoPropuesto: 29.3,
    descripcion: "x",
    decididoPor: "aarrieta@smarteamcr.com",
    decididoEn: "2026-10-17T10:00:00.000Z",
    nota: null,
    ...p,
  });

  it("lo decidido sale de los pendientes; solo lo confirmado como gasto suma", () => {
    const m = mov({ monto: -15, tipo: "wireFee" });
    const r = revisionFinanciera(candidatosDeGastoFinanciero([m], [], "2026-01-01"), [
      decidido({ movimientoMercuryId: m.id, tipo: "BANCO", monto: 15 }),
      decidido({ movimientoMercuryId: "otro", decision: "NO_ES", monto: 0 }),
    ]);
    expect(r.pendientes).toEqual([]);
    expect(r.totales).toEqual({ STRIPE: 0, TRANSFERENCIA_INTERNACIONAL: 0, BANCO: 15 });
  });

  it("al punto de equilibrio entra una línea por gasto confirmado, en el mes de su día, y ninguna por «No es»", () => {
    expect(egresosFinancieros([decidido({}), decidido({ decision: "NO_ES", monto: 0 })])).toEqual([
      { periodo: "2026-09", concepto: "Comisión de Stripe", conceptoClave: "financiero-stripe", monto: 29.3, moneda: "USD", fechaISO: "2026-09-10" },
    ]);
  });
});

describe("desdeParaRevisar", () => {
  it("doce meses para atrás, con el mismo día", () => {
    expect(desdeParaRevisar("2026-10-17")).toBe("2025-10-17");
    expect(desdeParaRevisar("2026-01-01")).toBe("2025-01-01");
  });
  it("el 29 de febrero da el último día de febrero del año anterior, nunca una fecha que no existe", () => {
    expect(desdeParaRevisar("2028-02-29")).toBe("2027-02-28");
    expect(desdeParaRevisar("2029-02-28")).toBe("2028-02-28");
  });
});
