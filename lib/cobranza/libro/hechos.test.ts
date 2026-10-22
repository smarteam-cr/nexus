/**
 * lib/cobranza/libro/hechos.test.ts — «Odoo y Mercury mandan»: qué factura se queda cada cuota y qué se cobra (2026-10-16).
 */
import { describe, it, expect } from "vitest";
import type { FacturaParaCruzar } from "@/lib/cobranza/odoo/diferencias";
import type { FacturaMercuryParaCruzar } from "@/lib/cobranza/mercury/diferencias";
import {
  accionesElegidas,
  decidir,
  diaVistoPagada,
  dudaDelCobro,
  facturasOdooParaFechar,
  paraCobrarSolo,
  pegaPorMontoSinDudas,
  pegarMercury,
  pegarOdoo,
  type Accion,
  type CobroDelLibro,
  type EntradaDelLibro,
} from "./hechos";

const cobro = (id: string, o: Partial<CobroDelLibro> = {}): CobroDelLibro => ({
  id,
  cuentaId: "cta",
  cuentaNombre: "Cliente",
  periodo: "2026-08",
  fechaProgramada: "2026-08-01",
  monto: 1000,
  moneda: "USD",
  estado: "POR_COBRAR",
  fechaEmision: null,
  numeroFactura: null,
  plataformaFactura: null,
  servicioId: "srv",
  servicio: "Servicio",
  plataforma: "ODOO",
  ...o,
});

const odoo = (id: string, o: Partial<FacturaParaCruzar> = {}): FacturaParaCruzar => ({
  id,
  odooMoveId: Number(id.replace(/\D/g, "") || 1),
  numero: `FAC/2026/${(id.replace(/\D/g, "") || "1").padStart(4, "0")}`,
  cuentaId: "cta",
  odooPartnerId: 1,
  odooPartnerNombre: "Cliente SA",
  invoiceDate: "2026-08-03",
  montoNeto: 1000,
  montoTotal: 1130,
  montoResidual: 1130,
  montoImpuesto: 130,
  moneda: "USD",
  moveType: "out_invoice",
  paymentState: "not_paid",
  state: "posted",
  ...o,
});

const mercury = (id: string, o: Partial<FacturaMercuryParaCruzar> = {}): FacturaMercuryParaCruzar => ({
  id,
  numero: `INV-${id.replace(/\D/g, "")}`,
  invoiceDate: "2026-08-03",
  dueDate: null,
  monto: 1000,
  moneda: "USD",
  estado: "Unpaid",
  mercuryCustomerId: "cus",
  clienteNombre: "Client Inc",
  actualizadaEn: "2026-08-20",
  ...o,
});

const entrada = (o: Partial<EntradaDelLibro>): EntradaDelLibro => ({
  cobros: [],
  facturasOdoo: [],
  facturasMercury: [],
  cuentaDeClienteMercury: new Map([["cus", "cta"]]),
  entradasMercury: [],
  hoy: "2026-10-16",
  ...o,
});

describe("Odoo: la factura se pega sola", () => {
  it("por número, aunque haya otra por el mismo monto más cerca", () => {
    const e = entrada({
      cobros: [cobro("c1", { numeroFactura: "FAC/2026/0009", fechaEmision: "2026-08-10" })],
      facturasOdoo: [odoo("f1", { invoiceDate: "2026-08-01" }), odoo("f9", { numero: "FAC/2026/0009", invoiceDate: "2026-08-10" })],
    });
    expect(pegarOdoo(e).map((p) => [p.cobroId, p.facturaId, p.via])).toEqual([["c1", "f9", "numero"]]);
  });

  it("por monto exacto, cuando es la única que calza y está cerca", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1")] });
    expect(pegarOdoo(e).map((p) => [p.cobroId, p.via])).toEqual([["c1", "monto"]]);
  });

  it("⛔ no pega por monto una cuota de un mes que todavía no llega (Ferretería Noelito, 2026-10-16)", () => {
    const e = entrada({ cobros: [cobro("c1", { periodo: "2026-11", fechaProgramada: "2026-11-01" })], facturasOdoo: [odoo("f1", { invoiceDate: "2026-10-20" })] });
    expect(pegarOdoo(e)).toEqual([]);
  });

  it("⛔ no pega por monto una factura lejos de la cuota", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { invoiceDate: "2026-06-01" })] });
    expect(pegarOdoo(e)).toEqual([]);
  });

  it("las cuotas mensuales del mismo monto no se estorban: cada factura con la suya", () => {
    const e = entrada({
      cobros: [cobro("c7", { periodo: "2026-07", fechaProgramada: "2026-07-01" }), cobro("c8")],
      facturasOdoo: [odoo("f7", { invoiceDate: "2026-07-02" }), odoo("f8", { invoiceDate: "2026-08-02" })],
    });
    expect(pegarOdoo(e).map((p) => [p.cobroId, p.facturaId]).sort()).toEqual([["c7", "f7"], ["c8", "f8"]]);
  });

  it("⛔ dos facturas igual de cerca es una moneda al aire: no se pega ninguna", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { invoiceDate: "2026-08-03" }), odoo("f2", { invoiceDate: "2026-07-30" })] });
    expect(pegarOdoo(e)).toEqual([]);
  });

  it("«en proceso de pago» cuenta como pagada; «pagada» con saldo no", () => {
    const pagada = (paymentState: string, montoResidual: number) =>
      pegarOdoo(entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { paymentState, montoResidual })] }))[0]!.pagada;
    expect(pagada("in_payment", 0)).toBe(true);
    expect(pagada("paid", 0)).toBe(true);
    expect(pagada("partial", 500)).toBe(false);
    expect(pagada("not_paid", 1130)).toBe(false);
  });

  it("una cuota de Mercury no se pega a una factura de Odoo", () => {
    const e = entrada({ cobros: [cobro("c1", { plataforma: "MERCURY" })], facturasOdoo: [odoo("f1")] });
    expect(pegarOdoo(e)).toEqual([]);
  });
});

describe("Odoo: la cuota cargada con el IVA (2026-10-21)", () => {
  /* Librería Internacional: la cuota de octubre anota FAC/2026/0365 por 2.655,50, y la factura es 2.350 sin IVA. */
  const conIva = (o: Partial<FacturaParaCruzar> = {}) =>
    entrada({
      cobros: [cobro("c1", { monto: 1130, numeroFactura: "FAC/2026/0009", fechaEmision: "2026-08-03" })],
      facturasOdoo: [odoo("f9", { numero: "FAC/2026/0009", paymentState: "paid", montoResidual: 0, ...o })],
    });

  it("con el número anotado, se pega a su factura aunque su monto sea el total con IVA", () => {
    expect(pegarOdoo(conIva()).map((p) => [p.cobroId, p.facturaId, p.via, p.pagada, p.conIva])).toEqual([["c1", "f9", "numero", true, true]]);
  });

  it("pagada allá, ⛔ no se cobra sola: espera a una persona con el porqué", () => {
    const e = conIva();
    const d = decidir(e, pegarOdoo(e), new Map([["f9", "2026-08-20"]]));
    expect(d.acciones[0]!.cobrar).toMatchObject({ fechaCobro: "2026-08-20" });
    expect(d.acciones[0]!.cobrar!.porQueNoSolo).toMatch(/con el IVA/);
    const solo = paraCobrarSolo(d.acciones, new Set());
    expect(solo.acciones).toEqual([]);
    expect(solo.quedan.map((q) => q.accion.cobroId)).toEqual(["c1"]);
  });

  it("⛔ sin el número no se pega: por monto, una cuota con IVA sería adivinar", () => {
    const e = entrada({ cobros: [cobro("c1", { monto: 1130 })], facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })] });
    expect(pegarOdoo(e)).toEqual([]);
  });

  it("⛔ un monto que no es ni el neto ni el total sigue siendo un monto distinto", () => {
    const e = entrada({
      cobros: [cobro("c1", { monto: 1100, numeroFactura: "FAC/2026/0009" })],
      facturasOdoo: [odoo("f9", { numero: "FAC/2026/0009", paymentState: "paid", montoResidual: 0 })],
    });
    expect(pegarOdoo(e)).toEqual([]);
  });

  it("la cuota con el neto sigue cobrándose sola (AMVAC FAC/2026/0354: 1.848 contra 2.088,24 con IVA)", () => {
    const e = entrada({
      cobros: [cobro("c1", { monto: 1848, numeroFactura: "FAC/2026/0354", fechaEmision: "2026-09-15", periodo: "2026-09", fechaProgramada: "2026-09-15" })],
      facturasOdoo: [odoo("f354", { numero: "FAC/2026/0354", invoiceDate: "2026-09-15", montoNeto: 1848, montoTotal: 2088.24, montoImpuesto: 240.24, paymentState: "paid", montoResidual: 0 })],
    });
    const pegados = pegarOdoo(e);
    expect(pegados.map((p) => [p.via, p.conciliada, p.conIva])).toEqual([["numero", true, undefined]]);
    const d = decidir(e, pegados, new Map([["f354", "2026-10-14"]]));
    expect(paraCobrarSolo(d.acciones, new Set()).acciones.map((a) => a.cobrar)).toEqual([{ fechaCobro: "2026-10-14", deDonde: "el pago con que Odoo concilió la factura", porQueNoSolo: null }]);
  });
});

describe("Mercury: por número, y por monto sin dudas", () => {
  it("varias cuotas con el mismo número son una factura compartida, si suman la factura", () => {
    const cs = [cobro("a", { plataforma: "MERCURY", numeroFactura: "INV-5", monto: 500 }), cobro("b", { plataforma: "MERCURY", numeroFactura: "INV-5", monto: 500 })];
    expect(pegarMercury(entrada({ cobros: cs, facturasMercury: [mercury("m5")] })).map((p) => [p.cobroId, p.cuotas])).toEqual([["a", 2], ["b", 2]]);
    const mal = [cs[0]!, { ...cs[1]!, monto: 400 }];
    expect(pegarMercury(entrada({ cobros: mal, facturasMercury: [mercury("m5")] }))).toEqual([]);
  });

  it("⛔ una factura que ya anotó otra cuota no se pega por monto a una cuota sin número", () => {
    const e = entrada({
      cobros: [cobro("con", { plataforma: "MERCURY", numeroFactura: "INV-5", estado: "COBRADO", periodo: "2026-07", fechaProgramada: "2026-07-25" }), cobro("sin", { plataforma: "MERCURY" })],
      facturasMercury: [mercury("m5", { estado: "Paid" })],
    });
    expect(pegarMercury(e).map((p) => p.cobroId)).toEqual(["con"]);
  });

  it("de un cliente de Mercury sin cuenta no se pega nada", () => {
    const e = entrada({ cobros: [cobro("c1", { plataforma: "MERCURY" })], facturasMercury: [mercury("m1")], cuentaDeClienteMercury: new Map() });
    expect(pegarMercury(e)).toEqual([]);
  });
});

describe("qué se escribe", () => {
  it("una cuota sin facturar se pega con la fecha y el número de la factura; pagada, se cobra el día del pago", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { paymentState: "in_payment", montoResidual: 0 })] });
    const pegados = pegarOdoo(e);
    expect(facturasOdooParaFechar(e, pegados)).toEqual(["f1"]);
    const d = decidir(e, pegados, new Map([["f1", "2026-08-28"]]));
    expect(d.acciones).toEqual([
      {
        fuente: "ODOO",
        cobroId: "c1",
        numero: "FAC/2026/0001",
        fechaEmision: "2026-08-03",
        numeroFactura: "FAC/2026/0001",
        // «En proceso de pago»: se puede cobrar a mano, pero no solo (no está conciliada con el banco).
        cobrar: { fechaCobro: "2026-08-28", deDonde: "el pago con que Odoo concilió la factura", porQueNoSolo: "Odoo la da «en proceso de pago»: todavía no está conciliada con el banco." },
      },
    ]);
  });

  it("⛔ sin el día del pago no se cobra: la fecha decide el mes del gráfico", () => {
    const e = entrada({ cobros: [cobro("c1", { fechaEmision: "2026-08-03", numeroFactura: "FAC/2026/0001" })], facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })] });
    const d = decidir(e, pegarOdoo(e), new Map());
    expect(d.acciones).toEqual([]);
    expect(d.pagadasSinFecha.map((p) => p.cobroId)).toEqual(["c1"]);
  });

  it("⛔ un choque no se toca: cobrada en Nexus e impaga allá queda como está", () => {
    const e = entrada({ cobros: [cobro("c1", { estado: "COBRADO", numeroFactura: "FAC/2026/0001", fechaEmision: "2026-08-03" })], facturasOdoo: [odoo("f1")] });
    const d = decidir(e, pegarOdoo(e), new Map());
    expect(d.acciones).toEqual([]);
    expect(d.choques.map((p) => p.cobroId)).toEqual(["c1"]);
  });

  it("Mercury: el día del cobro es el de la entrada de plata; ⛔ sin ella va a «pagadas sin fecha», nunca con una aproximada", () => {
    const cs = [cobro("c1", { plataforma: "MERCURY", numeroFactura: "INV-1", fechaEmision: "2026-08-03" })];
    const f = mercury("m1", { estado: "Paid", clienteNombre: "Client Inc" });
    const sinEntrada = decidir(entrada({ cobros: cs, facturasMercury: [f] }), pegarMercury(entrada({ cobros: cs, facturasMercury: [f] })), new Map());
    expect(sinEntrada.acciones).toEqual([]);
    expect(sinEntrada.pagadasSinFecha.map((p) => p.cobroId)).toEqual(["c1"]);
    const e = entrada({ cobros: cs, facturasMercury: [f], entradasMercury: [{ id: "t1", monto: 1000, fecha: "2026-08-12", quien: "Client Inc" }] });
    expect(decidir(e, pegarMercury(e), new Map()).acciones[0]!.cobrar).toEqual({ fechaCobro: "2026-08-12", deDonde: "la entrada de plata en Mercury", porQueNoSolo: null });
  });

  it("Mercury sin depósito (tarjeta por Stripe o pago externo): se cobra sola con el día en que la copia la vio pagada (2026-10-22)", () => {
    const cs = [cobro("c1", { plataforma: "MERCURY", numeroFactura: "INV-1", fechaEmision: "2026-08-03" })];
    const f = mercury("m1", { estado: "Paid", pagadaVistaEn: "2026-08-20", pagadaNoVistaEn: "2026-08-19" });
    const e = entrada({ cobros: cs, facturasMercury: [f] });
    const d = decidir(e, pegarMercury(e), new Map());
    expect(d.pagadasSinFecha).toEqual([]);
    expect(d.acciones[0]!.cobrar).toMatchObject({ fechaCobro: "2026-08-20", porQueNoSolo: null });
    expect(d.acciones[0]!.cobrar!.deDonde).toMatch(/la copia de Mercury la vio pagada/);
    expect(paraCobrarSolo(d.acciones, new Set()).acciones).toHaveLength(1);
  });

  it("Mercury: el depósito manda sobre el día visto", () => {
    const cs = [cobro("c1", { plataforma: "MERCURY", numeroFactura: "INV-1", fechaEmision: "2026-08-03" })];
    const f = mercury("m1", { estado: "Paid", clienteNombre: "Client Inc", pagadaVistaEn: "2026-08-20" });
    const e = entrada({ cobros: cs, facturasMercury: [f], entradasMercury: [{ id: "t1", monto: 1000, fecha: "2026-08-12", quien: "Client Inc" }] });
    expect(decidir(e, pegarMercury(e), new Map()).acciones[0]!.cobrar!.fechaCobro).toBe("2026-08-12");
  });

  it("⛔ Mercury: si entre «sin pagar» y «pagada» cambió el mes, no se sabe a qué mes va: espera a una persona", () => {
    expect(diaVistoPagada({ estado: "Paid", pagadaVistaEn: "2026-11-01", pagadaNoVistaEn: "2026-10-31" })).toBeNull();
    expect(diaVistoPagada({ estado: "Paid", pagadaVistaEn: "2026-10-16", pagadaNoVistaEn: "2026-10-15" })).toBe("2026-10-16");
    expect(diaVistoPagada({ estado: "Paid", pagadaVistaEn: null, pagadaNoVistaEn: null })).toBeNull();
    expect(diaVistoPagada({ estado: "Unpaid", pagadaVistaEn: "2026-10-16", pagadaNoVistaEn: null })).toBeNull();
  });

  it("una cuota ya cobrada sin número recibe el de su factura pagada, sin volver a cobrarla (Corrugando 0221, 2026-10-18)", () => {
    const e = entrada({
      cobros: [cobro("c1", { estado: "COBRADO", fechaEmision: "2026-08-01" })],
      facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })],
    });
    const pegados = pegarOdoo(e);
    expect(pegados.map((p) => p.via)).toEqual(["monto"]);
    // Ya cobrada: no hay que pedirle a Odoo el día del pago.
    expect(facturasOdooParaFechar(e, pegados)).toEqual([]);
    const d = decidir(e, pegados, new Map());
    expect(d.acciones).toEqual([{ fuente: "ODOO", cobroId: "c1", numero: "FAC/2026/0001", numeroFactura: "FAC/2026/0001", yaCobrada: true }]);
    expect(d.choques).toEqual([]);
    // El job diario no la toca: no tiene nada que cobrar.
    expect(paraCobrarSolo(d.acciones, new Set()).acciones).toEqual([]);
  });

  it("una cuota cobrada sin factura marcada recibe la fecha y el número; «en proceso de pago» también cuenta", () => {
    const e = entrada({
      cobros: [cobro("c1", { estado: "COBRADO" })],
      facturasOdoo: [odoo("f1", { paymentState: "in_payment", montoResidual: 0 })],
    });
    expect(decidir(e, pegarOdoo(e), new Map()).acciones).toEqual([
      { fuente: "ODOO", cobroId: "c1", numero: "FAC/2026/0001", fechaEmision: "2026-08-03", numeroFactura: "FAC/2026/0001", yaCobrada: true },
    ]);
  });

  it("⛔ cobrada acá con la factura pegada por monto e impaga allá es un choque: no recibe el número (Juanva 0197)", () => {
    const e = entrada({ cobros: [cobro("c1", { estado: "COBRADO", fechaEmision: "2026-08-01" })], facturasOdoo: [odoo("f1")] });
    const d = decidir(e, pegarOdoo(e), new Map());
    expect(d.acciones).toEqual([]);
    expect(d.choques.map((p) => [p.cobroId, p.via])).toEqual([["c1", "monto"]]);
  });

  it("⛔ una cuota cobrada no recibe el número de una factura dudosa: dos igual de cerca, ninguna", () => {
    const e = entrada({
      cobros: [cobro("c1", { estado: "COBRADO", fechaEmision: "2026-08-01" })],
      facturasOdoo: [
        odoo("f1", { invoiceDate: "2026-08-04", paymentState: "paid", montoResidual: 0 }),
        odoo("f2", { invoiceDate: "2026-07-29", paymentState: "paid", montoResidual: 0 }),
      ],
    });
    expect(decidir(e, pegarOdoo(e), new Map()).acciones).toEqual([]);
  });

  it("⛔ una cuota cobrada con «pagada» y saldo pendiente no recibe el número: Odoo todavía no la da pagada", () => {
    const e = entrada({
      cobros: [cobro("c1", { estado: "COBRADO", fechaEmision: "2026-08-01" })],
      facturasOdoo: [odoo("f1", { paymentState: "in_payment", montoResidual: 500 })],
    });
    expect(decidir(e, pegarOdoo(e), new Map()).acciones).toEqual([]);
  });

  it("Mercury: una cuota cobrada recibe el número de su factura «Paid»", () => {
    const cs = [cobro("c1", { plataforma: "MERCURY", estado: "COBRADO", fechaEmision: "2026-08-01" })];
    const e = entrada({ cobros: cs, facturasMercury: [mercury("m1", { estado: "Paid" })] });
    expect(decidir(e, pegarMercury(e), new Map()).acciones).toEqual([
      { fuente: "MERCURY", cobroId: "c1", numero: "INV-1", numeroFactura: "INV-1", yaCobrada: true },
    ]);
  });

  it("lo marcado para pegar de una cuota ya cobrada conserva la marca", () => {
    const a: Accion = { fuente: "ODOO", cobroId: "c1", numero: "FAC/2026/0001", numeroFactura: "FAC/2026/0001", yaCobrada: true };
    expect(accionesElegidas([a], { pegar: ["c1"], cobrar: [] }).acciones).toEqual([a]);
  });

  it("lo ya pegado y cobrado no vuelve a salir: correrlo dos veces no cambia nada", () => {
    const e = entrada({ cobros: [cobro("c1", { estado: "COBRADO", numeroFactura: "FAC/2026/0001", fechaEmision: "2026-08-03" })], facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })] });
    expect(decidir(e, pegarOdoo(e), new Map()).acciones).toEqual([]);
  });
});

describe("pegaPorMontoSinDudas", () => {
  const c = { id: "c", cuentaId: "a", moneda: "USD", monto: 10, fechaProgramada: "2026-08-01", periodo: "2026-08" };
  const f = { id: "f", fecha: "2026-08-05", cuentaId: "a", moneda: "USD", monto: 10 };
  it("otra cuota sin número igual de cerca de la factura la vuelve dudosa", () => {
    expect(pegaPorMontoSinDudas(c, f, [{ ...c, id: "d", fechaProgramada: "2026-08-09" }], [f], "2026-10-16")).toBe(false);
    expect(pegaPorMontoSinDudas(c, f, [{ ...c, id: "d", fechaProgramada: "2026-07-01" }], [f], "2026-10-16")).toBe(true);
  });
});

describe("lo que eligió quien confirma (la pantalla de cada mañana)", () => {
  const acciones: Accion[] = [
    { fuente: "ODOO", cobroId: "a", numero: "FAC/2026/0001", fechaEmision: "2026-08-03", numeroFactura: "FAC/2026/0001", cobrar: { fechaCobro: "2026-08-20", deDonde: "x", porQueNoSolo: null } },
    { fuente: "ODOO", cobroId: "b", numero: "FAC/2026/0002", fechaEmision: "2026-08-03", numeroFactura: "FAC/2026/0002" },
    { fuente: "MERCURY", cobroId: "c", numero: "INV-3", cobrar: { fechaCobro: "2026-08-21", deDonde: "y", porQueNoSolo: null } },
  ];

  it("se escribe solo lo marcado: lo que no se marcó no se toca aunque la lista lo traiga", () => {
    const r = accionesElegidas(acciones, { pegar: ["b"], cobrar: [] });
    expect(r.acciones.map((a) => a.cobroId)).toEqual(["b"]);
    expect(r.cambiaron).toEqual([]);
  });

  it("cobrar también pega la cuota a su factura", () => {
    const r = accionesElegidas(acciones, { pegar: [], cobrar: [{ cobroId: "a", fechaCobro: "2026-08-20" }] });
    expect(r.acciones).toEqual([acciones[0]]);
  });

  it("marcar solo para pegar una pagada NO la cobra", () => {
    const r = accionesElegidas(acciones, { pegar: ["a"], cobrar: [] });
    expect(r.acciones[0]!.cobrar).toBeUndefined();
    expect(r.acciones[0]!.numeroFactura).toBe("FAC/2026/0001");
  });

  it("⛔ si el día del pago cambió desde que se vio la lista, no se cobra (se pega igual) y se dice por qué", () => {
    const r = accionesElegidas(acciones, { pegar: [], cobrar: [{ cobroId: "a", fechaCobro: "2026-08-19" }] });
    expect(r.acciones[0]!.cobrar).toBeUndefined();
    expect(r.acciones[0]!.fechaEmision).toBe("2026-08-03");
    expect(r.cambiaron[0]!.motivo).toMatch(/cambió/);
  });

  it("lo marcado que ya no está en la lista se informa y no se escribe", () => {
    const r = accionesElegidas(acciones, { pegar: ["z"], cobrar: [{ cobroId: "b", fechaCobro: "2026-08-20" }] });
    expect(r.cambiaron.map((c) => c.cobroId).sort()).toEqual(["b", "z"]);
    // «b» ya no figura pagada: se pega, no se cobra.
    expect(r.acciones.find((a) => a.cobroId === "b")!.cobrar).toBeUndefined();
  });

  it("una pagada que ya tenía factura y número: cobrarla escribe solo el cobro", () => {
    const r = accionesElegidas(acciones, { pegar: [], cobrar: [{ cobroId: "c", fechaCobro: "2026-08-21" }] });
    expect(r.acciones).toEqual([acciones[2]]);
  });
});

describe("lo que se cobra solo cada día (2026-10-18)", () => {
  it("Odoo «pagada» (conciliada con el banco) con el día del pago se cobra sola", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })] });
    const d = decidir(e, pegarOdoo(e), new Map([["f1", "2026-08-28"]]));
    const solo = paraCobrarSolo(d.acciones, new Set());
    expect(solo.acciones.map((a) => [a.cobroId, a.cobrar?.fechaCobro, a.fechaEmision, a.numeroFactura])).toEqual([["c1", "2026-08-28", "2026-08-03", "FAC/2026/0001"]]);
    expect(solo.quedan).toEqual([]);
  });

  it("⛔ Odoo «en proceso de pago» no se cobra sola: queda para una persona, con el porqué", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { paymentState: "in_payment", montoResidual: 0 })] });
    const solo = paraCobrarSolo(decidir(e, pegarOdoo(e), new Map([["f1", "2026-08-28"]])).acciones, new Set());
    expect(solo.acciones).toEqual([]);
    expect(solo.quedan[0]!.motivo).toMatch(/en proceso de pago/);
  });

  it("⛔ Mercury con la entrada encontrada solo por el monto no se cobra sola", () => {
    const cs = [cobro("c1", { plataforma: "MERCURY", numeroFactura: "INV-1", fechaEmision: "2026-08-03" })];
    const f = mercury("m1", { estado: "Paid", clienteNombre: "Client Inc" });
    const e = entrada({ cobros: cs, facturasMercury: [f], entradasMercury: [{ id: "t1", monto: 1000, fecha: "2026-08-12", quien: "Otra Empresa SA" }] });
    const solo = paraCobrarSolo(decidir(e, pegarMercury(e), new Map()).acciones, new Set());
    expect(solo.acciones).toEqual([]);
    expect(solo.quedan[0]!.motivo).toMatch(/solo por el monto/);
  });

  it("⛔ lo de «pagadas sin el día del pago» y los choques nunca entran", () => {
    const e = entrada({
      cobros: [cobro("c1", { numeroFactura: "FAC/2026/0001", fechaEmision: "2026-08-03" }), cobro("c2", { estado: "COBRADO", numeroFactura: "FAC/2026/0002", fechaEmision: "2026-08-03" })],
      facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 }), odoo("f2")],
    });
    const d = decidir(e, pegarOdoo(e), new Map());
    expect(d.pagadasSinFecha.map((p) => p.cobroId)).toEqual(["c1"]);
    expect(d.choques.map((p) => p.cobroId)).toEqual(["c2"]);
    expect(paraCobrarSolo(d.acciones, new Set())).toEqual({ acciones: [], quedan: [] });
  });

  it("⛔ una cuota que una persona sacó de Cobrado no se vuelve a cobrar sola", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1", { paymentState: "paid", montoResidual: 0 })] });
    const solo = paraCobrarSolo(decidir(e, pegarOdoo(e), new Map([["f1", "2026-08-28"]])).acciones, new Set(["c1"]));
    expect(solo.acciones).toEqual([]);
    expect(solo.quedan[0]!.motivo).toMatch(/sacó de Cobrado/);
  });

  it("lo que solo se pega a su factura (sin pagar) no lo toca el job", () => {
    const e = entrada({ cobros: [cobro("c1")], facturasOdoo: [odoo("f1")] });
    const d = decidir(e, pegarOdoo(e), new Map());
    expect(d.acciones).toHaveLength(1);
    expect(paraCobrarSolo(d.acciones, new Set())).toEqual({ acciones: [], quedan: [] });
  });

  it("dudaDelCobro: un día del pago posterior a hoy o muy anterior a la factura queda para una persona", () => {
    const p = { fuente: "ODOO" as const, conciliada: true, fechaFactura: "2026-08-10" };
    expect(dudaDelCobro(p, "2026-08-20", "2026-10-18", "nombre")).toBeNull();
    expect(dudaDelCobro(p, "2026-08-07", "2026-10-18", "nombre")).toBeNull();
    expect(dudaDelCobro(p, "2026-10-19", "2026-10-18", "nombre")).toMatch(/posterior a hoy/);
    expect(dudaDelCobro(p, "2026-07-01", "2026-10-18", "nombre")).toMatch(/anterior a la factura/);
  });
});
