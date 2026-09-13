/**
 * lib/cobranza/odoo/candidatas.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo/candidatas.test.ts --project unit`.
 *
 * Qué facturas del espejo se ofrecen al marcar facturado un cobro, y en qué orden.
 */
import { describe, it, expect } from "vitest";
import { candidatasParaElCobro, ordenarCandidatas, type FacturaDelEspejo } from "./candidatas";

const factura = (p: Partial<FacturaDelEspejo> = {}): FacturaDelEspejo => ({
  odooMoveId: 1,
  numero: "FAC/2026/0206",
  odooPartnerNombre: "GLOBAL SUPPLY S.A.",
  invoiceDate: "2026-02-04",
  montoNeto: 1867,
  moneda: "USD",
  moveType: "out_invoice",
  state: "posted",
  paymentState: "not_paid",
  ...p,
});

const cobro = { monto: 1867, moneda: "USD", fechaProgramada: "2026-02-15", numeroFactura: null };

describe("ordenarCandidatas", () => {
  it("el monto exacto primero, aunque haya otra más cerca de la fecha", () => {
    const cerca = factura({ odooMoveId: 2, numero: "FAC/2026/0210", montoNeto: 1900, invoiceDate: "2026-02-15" });
    const exacta = factura({ odooMoveId: 3, numero: "FAC/2026/0206", invoiceDate: "2026-01-02" });
    expect(ordenarCandidatas([cerca, exacta], cobro).map((f) => f.numero)).toEqual(["FAC/2026/0206", "FAC/2026/0210"]);
  });

  it("⚠ al centavo: el ruido de Odoo no le quita a una factura el primer lugar", () => {
    const conRuido = factura({ odooMoveId: 5, montoNeto: 1866.9999999999998, invoiceDate: "2025-11-01" });
    const otra = factura({ odooMoveId: 4, montoNeto: 1500, invoiceDate: "2026-02-15" });
    expect(ordenarCandidatas([otra, conRuido], cobro)[0].odooMoveId).toBe(5);
  });

  it("entre iguales, la más cercana a la fecha programada; y si empatan, por id", () => {
    const lejos = factura({ odooMoveId: 10, numero: "FAC/2026/0100", invoiceDate: "2025-12-01" });
    const antes = factura({ odooMoveId: 12, numero: "FAC/2026/0209", invoiceDate: "2026-02-12" });
    const mismaFecha = factura({ odooMoveId: 11, numero: "FAC/2026/0210", invoiceDate: "2026-02-12" });
    expect(ordenarCandidatas([lejos, antes, mismaFecha], cobro).map((f) => f.odooMoveId)).toEqual([11, 12, 10]);
  });

  it("no toca el arreglo que recibe", () => {
    const lista = [factura({ odooMoveId: 2, montoNeto: 1 }), factura({ odooMoveId: 1 })];
    ordenarCandidatas(lista, cobro);
    expect(lista.map((f) => f.odooMoveId)).toEqual([2, 1]);
  });
});

describe("candidatasParaElCobro", () => {
  it("solo la misma moneda y solo documentos vivos: sin notas de crédito, anuladas ni revertidas", () => {
    const lista = candidatasParaElCobro(
      [
        factura({ odooMoveId: 1, numero: "FAC/2026/0206" }),
        factura({ odooMoveId: 2, numero: "FAC/2026/0207", moneda: "CRC" }),
        factura({ odooMoveId: 3, numero: "NC/2026/0003", moveType: "out_refund" }),
        factura({ odooMoveId: 4, numero: "FAC/2026/0208", state: "cancel" }),
        factura({ odooMoveId: 5, numero: "FAC/2026/0209", paymentState: "reversed" }),
      ],
      cobro,
      new Set(),
    );
    expect(lista.map((f) => f.numero)).toEqual(["FAC/2026/0206"]);
    expect(lista[0]).toEqual({
      numero: "FAC/2026/0206",
      odooPartnerNombre: "GLOBAL SUPPLY S.A.",
      invoiceDate: "2026-02-04",
      montoNeto: 1867,
      moneda: "USD",
      paymentState: "not_paid",
      montoExacto: true,
    });
  });

  it("sin los números que ya tiene otro cobro, salvo el del propio cobro", () => {
    const facturas = [factura({ odooMoveId: 1, numero: "FAC/2026/0206" }), factura({ odooMoveId: 2, numero: "FAC/2026/0209" })];
    const tomados = new Set(["FAC/2026/0206", "FAC/2026/0209"]);
    expect(candidatasParaElCobro(facturas, cobro, tomados)).toEqual([]);
    expect(candidatasParaElCobro(facturas, { ...cobro, numeroFactura: "FAC/2026/0209" }, tomados).map((f) => f.numero)).toEqual([
      "FAC/2026/0209",
    ]);
  });

  it("marca cuáles tienen el monto exacto", () => {
    const lista = candidatasParaElCobro(
      [factura({ odooMoveId: 1, numero: "FAC/2026/0206" }), factura({ odooMoveId: 2, numero: "FAC/2026/0300", montoNeto: 2109.71 })],
      cobro,
      new Set(),
    );
    expect(lista.map((f) => [f.numero, f.montoExacto])).toEqual([
      ["FAC/2026/0206", true],
      ["FAC/2026/0300", false],
    ]);
  });
});
