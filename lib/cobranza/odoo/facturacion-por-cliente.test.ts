/**
 * lib/cobranza/odoo/facturacion-por-cliente.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo/facturacion-por-cliente.test.ts --project unit`.
 *
 * «Facturación por cliente» (punto 8 de la revisión con Alex, 2026-09-30): lo facturado, lo cobrado y lo por cobrar de
 * cada cliente en un año, al lado de lo que ventas cerró. Los casos son los de la copia real: la factura revertida por
 * la moneda equivocada con su nota, las notas sin aplicar, el pago parcial y el cliente con dos razones sociales.
 */
import { describe, it, expect } from "vitest";
import {
  facturacionPorCliente,
  notasDeReversion,
  type CuentaParaHistorial,
  type DocumentoParaHistorial,
  type VentaParaHistorial,
} from "./facturacion-por-cliente";

let n = 0;
const doc = (p: Partial<DocumentoParaHistorial>): DocumentoParaHistorial => {
  const montoNeto = p.montoNeto ?? 1000;
  const montoTotal = p.montoTotal ?? Math.round(montoNeto * 113) / 100;
  const pagada = !["not_paid", "partial"].includes(p.paymentState ?? "paid");
  return {
    numero: `FAC/${++n}`,
    moveType: "out_invoice",
    state: "posted",
    paymentState: "paid",
    invoiceDate: "2025-06-10",
    montoNeto,
    montoTotal,
    montoResidual: pagada ? 0 : montoTotal,
    moneda: "USD",
    odooPartnerId: 1,
    odooPartnerNombre: "ACME SOCIEDAD ANONIMA",
    cuentaId: "c-acme",
    ...p,
  };
};
const venta = (p: Partial<VentaParaHistorial>): VentaParaHistorial => ({
  clientId: "cl-acme",
  clienteNombre: "Acme",
  fechaCierre: "2025-03-01",
  monto: 5000,
  moneda: "USD",
  estado: "GANADA",
  excluida: false,
  pipelineId: "default",
  ...p,
});

const CUENTAS: CuentaParaHistorial[] = [
  { cuentaId: "c-acme", clientId: "cl-acme", nombre: "Acme", viaCobro: "ODOO" },
  { cuentaId: "c-kolbi", clientId: "cl-kolbi", nombre: "kölbi", viaCobro: "ODOO" },
  { cuentaId: "c-mercury", clientId: "cl-mercury", nombre: "Iberorutas", viaCobro: "MERCURY" },
];
const filaDe = (r: ReturnType<typeof facturacionPorCliente>, nombre: string) => r.filas.find((f) => f.nombre === nombre);

describe("facturación por cliente, de la copia de Odoo", () => {
  it("⚠ la factura revertida por la moneda equivocada no cuenta, y la nota que la revirtió tampoco", () => {
    /* Publimark, 2026: la de dólares se revirtió con una nota del mismo total y se volvió a emitir en colones. */
    const docs = [
      doc({ numero: "FAC/0229", moneda: "USD", montoNeto: 11541250, paymentState: "reversed", cuentaId: "c-kolbi", odooPartnerId: 75 }),
      doc({ numero: "FAC/0263", moveType: "out_refund", moneda: "USD", montoNeto: 11541250, cuentaId: "c-kolbi", odooPartnerId: 75 }),
      doc({ numero: "FAC/0233", moneda: "CRC", montoNeto: 11541250, cuentaId: "c-kolbi", odooPartnerId: 75 }),
    ];
    expect([...notasDeReversion(docs)]).toEqual(["FAC/0263"]);
    const k = filaDe(facturacionPorCliente(docs, CUENTAS, [], 2025), "kölbi")!;
    expect(k.facturado).toEqual([{ moneda: "CRC", monto: 11541250 }]);
    expect(k.cobrado).toEqual([{ moneda: "CRC", monto: 11541250 }]);
    expect(k.facturas).toBe(1);
    expect(k.notasSinAplicar).toEqual([]);
  });

  it("una nota sin aplicar baja lo facturado pero no lo cobrado, y la fila la dice", () => {
    const docs = [
      doc({ montoNeto: 13475, paymentState: "not_paid" }),
      doc({ montoNeto: 13475, invoiceDate: "2025-06-10", moveType: "out_refund", paymentState: "not_paid" }),
      doc({ montoNeto: 2000, invoiceDate: "2025-07-01" }),
    ];
    const a = filaDe(facturacionPorCliente(docs, CUENTAS, [], 2025), "Acme")!;
    expect(a.facturado).toEqual([{ moneda: "USD", monto: 2000 }]);
    expect(a.cobrado).toEqual([{ moneda: "USD", monto: 2000 }]);
    expect(a.porCobrar).toEqual([{ moneda: "USD", monto: 13475 }]);
    expect(a.notasSinAplicar).toEqual([{ moneda: "USD", monto: 13475 }]);
    /* La identidad que la pantalla promete: facturado = cobrado + por cobrar − notas sin aplicar. */
    expect(a.facturado[0]!.monto).toBeCloseTo(a.cobrado[0]!.monto + a.porCobrar[0]!.monto - a.notasSinAplicar[0]!.monto, 2);
  });

  it("una nota aplicada salda una factura sin que entre plata: baja lo facturado y lo cobrado", () => {
    const docs = [doc({ montoNeto: 1620 }), doc({ montoNeto: 1620, moveType: "out_refund", paymentState: "paid" }), doc({ montoNeto: 5000 })];
    const a = filaDe(facturacionPorCliente(docs, CUENTAS, [], 2025), "Acme")!;
    expect(a.facturado).toEqual([{ moneda: "USD", monto: 5000 }]);
    expect(a.cobrado).toEqual([{ moneda: "USD", monto: 5000 }]);
    expect(a.notasSinAplicar).toEqual([]);
  });

  it("pagada en parte: lo cobrado es lo que ya no se debe, con la misma regla que «Lo que no cuadra»", () => {
    const docs = [doc({ montoNeto: 1000, montoTotal: 1130, montoResidual: 565, paymentState: "partial" })];
    const a = filaDe(facturacionPorCliente(docs, CUENTAS, [], 2025), "Acme")!;
    expect(a.porCobrar).toEqual([{ moneda: "USD", monto: 500 }]);
    expect(a.cobrado).toEqual([{ moneda: "USD", monto: 500 }]);
  });

  it("dos razones sociales de la misma cuenta son UNA fila; un cliente de Odoo sin cuenta va aparte y sin ventas", () => {
    const docs = [
      doc({ cuentaId: "c-kolbi", odooPartnerId: 75, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA", montoNeto: 13475 }),
      doc({ cuentaId: "c-kolbi", odooPartnerId: 168, odooPartnerNombre: "MCCANN ERICKSON", moneda: "CRC", montoNeto: 11541249.95 }),
      doc({ cuentaId: null, odooPartnerId: 90, odooPartnerNombre: "ADITEC", montoNeto: 800 }),
    ];
    const r = facturacionPorCliente(docs, CUENTAS, [venta({ clientId: "cl-kolbi" })], 2025);
    const k = filaDe(r, "kölbi")!;
    expect(k.clientesDeOdoo).toEqual(["MCCANN ERICKSON", "PUBLIMARK SOCIEDAD ANONIMA"]);
    expect(k.facturado, "⛔ nunca se suman colones con dólares").toEqual([
      { moneda: "USD", monto: 13475 },
      { moneda: "CRC", monto: 11541249.95 },
    ]);
    expect(k.ventas).toEqual({ tratos: 1, sinMonto: 0, montos: [{ moneda: "USD", monto: 5000 }] });
    const aditec = filaDe(r, "ADITEC")!;
    expect(aditec).toMatchObject({ cuentaId: null, clientesDeOdoo: [], ventas: null, clave: "odoo:90" });
  });

  it("ventas: solo las ganadas, sin excluir, de un pipeline de venta propia y con cierre en el año", () => {
    const ventas = [
      venta({ monto: 5000 }),
      venta({ monto: null }),
      venta({ monto: 999, excluida: true }),
      venta({ monto: 999, estado: "REABIERTA" }),
      venta({ monto: 999, fechaCierre: "2024-12-31" }),
      venta({ monto: 999, pipelineId: "otro" }),
      venta({ monto: 3000000, moneda: "CRC" }),
    ];
    const a = filaDe(facturacionPorCliente([doc({})], CUENTAS, ventas, 2025), "Acme")!;
    expect(a.ventas).toEqual({
      tratos: 3,
      sinMonto: 1,
      montos: [
        { moneda: "USD", monto: 5000 },
        { moneda: "CRC", monto: 3000000 },
      ],
    });
  });

  it("⭐ lo vendido sin facturas de Odoo ese año se lista aparte, con su vía de cobro", () => {
    const r = facturacionPorCliente(
      [doc({})],
      CUENTAS,
      [venta({ clientId: "cl-mercury", clienteNombre: "Iberorutas" }), venta({ clientId: "cl-sin-cuenta", clienteNombre: "Nueva SA" })],
      2025,
    );
    expect(r.ventasSinFacturas.map((v) => [v.nombre, v.viaCobro])).toEqual([
      ["Iberorutas", "MERCURY"],
      ["Nueva SA", null],
    ]);
    expect(r.totales.ventas.tratos, "los totales comparan solo lo que tiene fila").toBe(0);
  });

  it("⭐ ordena por la última factura del año, la más reciente arriba", () => {
    const docs = [
      doc({ cuentaId: "c-acme", invoiceDate: "2025-03-01" }),
      doc({ cuentaId: "c-kolbi", odooPartnerId: 75, invoiceDate: "2025-12-26" }),
      doc({ cuentaId: null, odooPartnerId: 90, odooPartnerNombre: "ADITEC", invoiceDate: "2025-08-15" }),
      doc({ cuentaId: "c-acme", invoiceDate: "2026-01-05" }),
    ];
    const r = facturacionPorCliente(docs, CUENTAS, [], 2025);
    expect(r.filas.map((f) => [f.nombre, f.ultimaFactura])).toEqual([
      ["kölbi", "2025-12-26"],
      ["ADITEC", "2025-08-15"],
      ["Acme", "2025-03-01"],
    ]);
    expect(r.anios).toEqual([2026, 2025]);
    expect(r.totales.facturas).toBe(3);
  });

  it("una fila que solo tiene notas del año no es un cliente facturado: no entra a la lista ni a los totales", () => {
    const docs = [doc({ moveType: "out_refund", invoiceDate: "2025-01-10", paymentState: "not_paid" }), doc({ invoiceDate: "2024-12-20" })];
    const r = facturacionPorCliente(docs, CUENTAS, [], 2025);
    expect(r.filas).toEqual([]);
    expect(r.totales.facturado).toEqual([]);
  });

  it("anuladas y revertidas no cuentan como facturas", () => {
    const docs = [doc({ state: "cancel" }), doc({ paymentState: "reversed" }), doc({ montoNeto: 700 })];
    const a = filaDe(facturacionPorCliente(docs, CUENTAS, [], 2025), "Acme")!;
    expect(a.facturas).toBe(1);
    expect(a.facturado).toEqual([{ moneda: "USD", monto: 700 }]);
  });
});
