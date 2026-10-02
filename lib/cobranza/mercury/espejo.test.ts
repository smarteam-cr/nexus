/**
 * lib/cobranza/mercury/espejo.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/mercury --project unit`.
 *
 * Cómo se lee lo que devuelve Mercury, con la forma real medida el 2026-10-02, y la regla de qué entrada de plata es
 * un cliente pagando (sobre los casos reales: el pago automático de la tarjeta, el cashback, una devolución de Airbnb,
 * la plata de Smarteam y la transferencia de Atlas Mining).
 */
import { describe, it, expect } from "vitest";
import { esEntradaDeCliente, facturaCambio, mapearCliente, mapearFactura, mapearMovimiento, nombreDeQuienPago } from "./espejo";

const CRUDA = {
  id: "55573008-bdfb-11f1-8d46-2ddf73c78b8b",
  dueDate: "2026-10-02",
  invoiceDate: "2026-10-02",
  invoiceNumber: "INV-53",
  customerId: "23837236-7bdd-11f1-a23e-c7a80575cfb2",
  status: "Unpaid",
  amount: 1780,
  currencyCode: "USD",
  createdAt: "2026-10-02T00:50:59.121144Z",
  updatedAt: "2026-10-02T00:50:59.121144Z",
};

describe("las facturas", () => {
  it("se leen con sus fechas, su monto y su cliente", () => {
    const r = mapearFactura(CRUDA);
    expect(r).toEqual({
      factura: {
        mercuryInvoiceId: CRUDA.id,
        numero: "INV-53",
        invoiceDate: "2026-10-02",
        dueDate: "2026-10-02",
        monto: 1780,
        moneda: "USD",
        estado: "Unpaid",
        mercuryCustomerId: CRUDA.customerId,
        canceladaEn: null,
        creadaEnMercury: "2026-10-02T00:50:59.121Z",
        actualizadaEnMercury: "2026-10-02T00:50:59.121Z",
      },
    });
  });

  it("⛔ a la que le falta algo se la rechaza diciendo qué: no se inventa nada", () => {
    const r = mapearFactura({ ...CRUDA, amount: undefined, customerId: "" });
    expect(r).toEqual({ rechazo: "INV-53: le falta monto, cliente" });
  });

  it("solo se reescribe la que cambió", () => {
    const f = (mapearFactura(CRUDA) as { factura: Parameters<typeof facturaCambio>[1] }).factura;
    const previa = { ...f, estadoEspejo: "VIGENTE" };
    expect(facturaCambio(previa, f)).toBe(false);
    expect(facturaCambio(previa, { ...f, estado: "Paid" })).toBe(true);
    expect(facturaCambio({ ...previa, estadoEspejo: "DESAPARECIDA" }, f), "la que vuelve también").toBe(true);
  });
});

describe("los clientes", () => {
  it("se leen con su razón social y su país", () => {
    expect(mapearCliente({ id: "c1", name: "SOLUCIONES, ANALITICOS Y SERVICIOS TEAM", email: "a@b.com", address: { country: "MX" } })).toEqual({
      mercuryCustomerId: "c1",
      nombre: "SOLUCIONES, ANALITICOS Y SERVICIOS TEAM",
      correo: "a@b.com",
      pais: "MX",
    });
    expect(mapearCliente({ id: "c1" })).toBeNull();
  });
});

describe("¿esta entrada de plata es un cliente pagando?", () => {
  const mov = (p: Record<string, unknown>) =>
    mapearMovimiento({ id: "t", accountId: "a", amount: 100, status: "sent", kind: "other", createdAt: "2026-08-01T00:00:00Z", ...p })!;

  it("✓ la transferencia de un cliente, con o sin el «1/» de las internacionales", () => {
    expect(esEntradaDeCliente(mov({ amount: 7350, counterpartyName: "1/ATLAS MINING Y CONSTRUCTION SA" }))).toBe(true);
    expect(esEntradaDeCliente(mov({ amount: 938.23, counterpartyName: "Navis One Lab LLC" }))).toBe(true);
    expect(nombreDeQuienPago("1/VISUAL BRANDING, SOCIEDAD ANONIM")).toBe("VISUAL BRANDING, SOCIEDAD ANONIM");
  });

  it("✗ lo que entra y no es un cliente: cuentas propias, cashback, intereses, devoluciones y Smarteam", () => {
    expect(esEntradaDeCliente(mov({ amount: 391.84, counterpartyName: "Mercury Checking ••6736", bankDescription: "IO AUTOPAY" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: 5.87, counterpartyName: "Mercury IO Cashback" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: 17.94, counterpartyName: "Airbnb", details: { debitCardInfo: { id: "x" } } }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: 884, counterpartyName: "SMARTEAM CONSULT" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: 5000, kind: "internalTransfer", counterpartyName: "Ahorros" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: 0.06, kind: "interestPayment" }))).toBe(false);
  });

  it("✗ lo que no llegó (fallido, cancelado, devuelto) y lo que sale", () => {
    expect(esEntradaDeCliente(mov({ status: "failed", counterpartyName: "Cliente" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ status: "reversed", counterpartyName: "Cliente" }))).toBe(false);
    expect(esEntradaDeCliente(mov({ amount: -100, counterpartyName: "Proveedor" }))).toBe(false);
  });
});
