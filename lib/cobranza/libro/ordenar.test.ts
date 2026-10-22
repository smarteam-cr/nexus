/**
 * lib/cobranza/libro/ordenar.test.ts — lo que Nexus ordena solo en «Lo que no cuadra» (2026-10-22).
 */
import { describe, it, expect } from "vitest";
import type { FacturaParaCruzar } from "@/lib/cobranza/odoo/diferencias";
import type { FacturaMercuryParaCruzar } from "@/lib/cobranza/mercury/diferencias";
import type { CobroDelLibro, EntradaDelLibro } from "./hechos";
import { claveDeshecha, combinacionesExactas, decidirOrden, porQueNoSeOrdena } from "./ordenar";

const cobro = (id: string, o: Partial<CobroDelLibro> = {}): CobroDelLibro => ({
  id,
  cuentaId: "cta",
  cuentaNombre: "Cliente",
  periodo: "2026-05",
  fechaProgramada: "2026-05-01",
  monto: 1000,
  moneda: "USD",
  estado: "COBRADO",
  fechaEmision: "2026-05-02",
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
  invoiceDate: "2026-06-03",
  montoNeto: 2000,
  montoTotal: 2260,
  montoResidual: 0,
  montoImpuesto: 260,
  moneda: "USD",
  moveType: "out_invoice",
  paymentState: "paid",
  state: "posted",
  ...o,
});

const mercury = (id: string, o: Partial<FacturaMercuryParaCruzar> = {}): FacturaMercuryParaCruzar => ({
  id,
  numero: `INV-${id.replace(/\D/g, "")}`,
  invoiceDate: "2026-05-03",
  dueDate: null,
  monto: 1000,
  moneda: "USD",
  estado: "Paid",
  mercuryCustomerId: "mc",
  clienteNombre: "Cliente LLC",
  actualizadaEn: "2026-05-20",
  ...o,
});

const entrada = (o: Partial<EntradaDelLibro>): EntradaDelLibro => ({
  cobros: [],
  facturasOdoo: [],
  facturasMercury: [],
  cuentaDeClienteMercury: new Map([["mc", "cta"]]),
  entradasMercury: [],
  hoy: "2026-10-22",
  ...o,
});

const nada = new Set<string>();

describe("una factura de Odoo que cubre varias cuotas", () => {
  it("se anota en cada cuota cuando la combinación es única y la factura está pagada (Amvac 0310)", () => {
    const d = decidirOrden(
      entrada({
        cobros: [cobro("c5", { periodo: "2026-05", monto: 1848 }), cobro("c6", { periodo: "2026-06", monto: 1848 })],
        facturasOdoo: [odoo("f310", { montoNeto: 3696 })],
      }),
      nada,
    );
    expect(d.ordenes).toHaveLength(1);
    expect(d.ordenes[0]).toMatchObject({ regla: "VARIAS_CUOTAS", numero: "FAC/2026/0310" });
    expect(d.ordenes[0]!.cuotas.map((c) => c.cobroId)).toEqual(["c5", "c6"]);
    expect(d.dudosas).toEqual([]);
  });

  it("no elige cuando las cuotas iguales calzan con otra factura (Fundauna 0359, septiembre y octubre)", () => {
    const d = decidirOrden(
      entrada({
        cobros: ["2026-05", "2026-06", "2026-07", "2026-08"].map((p, i) => cobro(`c${i}`, { periodo: p })),
        facturasOdoo: [odoo("f1", { invoiceDate: "2026-06-03" }), odoo("f2", { invoiceDate: "2026-07-03" })],
      }),
      nada,
    );
    expect(d.ordenes).toEqual([]);
    expect(d.dudosas.map((x) => x.numero).sort()).toEqual(["FAC/2026/0001", "FAC/2026/0002"]);
  });

  it("no la ordena si está pagada y una cuota sigue por cobrar: anotarla la cobraría", () => {
    const d = decidirOrden(
      entrada({ cobros: [cobro("a", { estado: "POR_COBRAR" }), cobro("b", { periodo: "2026-06" })], facturasOdoo: [odoo("f1")] }),
      nada,
    );
    expect(d.ordenes).toEqual([]);
    expect(d.dudosas[0]!.texto).toContain("ordenarla la cobraría");
  });

  it("sí la ordena sin pagar si ninguna cuota está cobrada: el día que se pague, se cobran solas", () => {
    const d = decidirOrden(
      entrada({
        cobros: [cobro("a", { estado: "POR_COBRAR" }), cobro("b", { periodo: "2026-06", estado: "POR_COBRAR" })],
        facturasOdoo: [odoo("f1", { paymentState: "not_paid" })],
      }),
      nada,
    );
    expect(d.ordenes).toHaveLength(1);
  });

  it("no toca una factura pagada en parte, ni cuotas sin marcar facturadas", () => {
    const parcial = decidirOrden(entrada({ cobros: [cobro("a"), cobro("b", { periodo: "2026-06" })], facturasOdoo: [odoo("f1", { paymentState: "partial" })] }), nada);
    expect(parcial.ordenes).toEqual([]);
    const sinFacturar = decidirOrden(
      entrada({
        cobros: [cobro("a", { estado: "PROGRAMADO", fechaEmision: null }), cobro("b", { periodo: "2026-06", estado: "PROGRAMADO", fechaEmision: null })],
        facturasOdoo: [odoo("f1", { paymentState: "not_paid" })],
      }),
      nada,
    );
    expect(sinFacturar.ordenes).toEqual([]);
  });

  it("no la vuelve a ordenar si una persona la deshizo", () => {
    const e = entrada({ cobros: [cobro("a"), cobro("b", { periodo: "2026-06" })], facturasOdoo: [odoo("f1")] });
    expect(decidirOrden(e, new Set([claveDeshecha("a", "FAC/2026/0001")])).ordenes).toEqual([]);
  });

  it("no toca cuotas que ya anotan una factura vigente", () => {
    const d = decidirOrden(
      entrada({ cobros: [cobro("a", { numeroFactura: "FAC/2026/0009" }), cobro("b", { periodo: "2026-06" })], facturasOdoo: [odoo("f1"), odoo("f9", { montoNeto: 1000 })] }),
      nada,
    );
    expect(d.ordenes).toEqual([]);
  });
});

describe("una factura de Odoo reemplazada", () => {
  it("cambia el número anulado por la factura vigente del mismo monto (Honda 0347 → 0348)", () => {
    const d = decidirOrden(
      entrada({
        cobros: [cobro("h9", { periodo: "2026-09", monto: 4000, numeroFactura: "FAC/2026/0347" })],
        facturasOdoo: [
          odoo("f347", { montoNeto: 4000, invoiceDate: "2026-09-02", paymentState: "reversed" }),
          odoo("f348", { montoNeto: 4000, invoiceDate: "2026-09-05" }),
        ],
      }),
      nada,
    );
    expect(d.ordenes).toHaveLength(1);
    expect(d.ordenes[0]).toMatchObject({ regla: "FACTURA_REEMPLAZADA", numero: "FAC/2026/0348" });
    expect(d.ordenes[0]!.cuotas[0]).toMatchObject({ numeroAntes: "FAC/2026/0347" });
  });

  it("con dos reemplazos posibles no elige", () => {
    const d = decidirOrden(
      entrada({
        cobros: [cobro("h9", { periodo: "2026-09", fechaEmision: "2026-09-01", monto: 4000, numeroFactura: "FAC/2026/0347" })],
        facturasOdoo: [odoo("f348", { montoNeto: 4000, invoiceDate: "2026-09-05" }), odoo("f349", { montoNeto: 4000, invoiceDate: "2026-09-06" })],
      }),
      nada,
    );
    expect(d.ordenes).toEqual([]);
    expect(d.dudosas).toHaveLength(1);
  });
});

describe("el número de Mercury", () => {
  const meses = ["01", "02", "03", "04"];
  const acccsa = entrada({
    cobros: meses.map((m) => cobro(`c${m}`, { periodo: `2026-${m}`, fechaProgramada: `2026-${m}-01`, fechaEmision: `2026-${m}-01`, monto: 712, plataforma: "MERCURY" })),
    facturasMercury: meses.map((m, i) => mercury(`m${i + 1}`, { invoiceDate: `2026-${m}-02`, monto: 712.5 })),
  });

  it("cuotas mensuales iguales: cada una con la suya, y el monto de la factura (ACCCSA 712 → 712,50)", () => {
    const d = decidirOrden(acccsa, nada);
    expect(d.ordenes.map((o) => [o.cuotas[0]!.cobroId, o.numero])).toEqual([
      ["c01", "INV-1"],
      ["c02", "INV-2"],
      ["c03", "INV-3"],
      ["c04", "INV-4"],
    ]);
    expect(d.ordenes.every((o) => o.regla === "NUMERO_DE_MERCURY" && o.cuotas[0]!.montoDespues === 712.5)).toBe(true);
  });

  it("con empate de distancia no elige", () => {
    const d = decidirOrden(
      entrada({
        cobros: [cobro("c", { fechaEmision: "2026-05-10", plataforma: "MERCURY" })],
        facturasMercury: [mercury("m1", { invoiceDate: "2026-05-08" }), mercury("m2", { invoiceDate: "2026-05-12" })],
      }),
      nada,
    );
    expect(d.ordenes).toEqual([]);
  });

  it("más de US$1 de diferencia no se ordena solo", () => {
    const d = decidirOrden(entrada({ cobros: [cobro("c", { plataforma: "MERCURY" })], facturasMercury: [mercury("m1", { monto: 1001.5 })] }), nada);
    expect(d.ordenes).toEqual([]);
  });

  it("una cuota cobrada sin fecha de emisión recibe la de la factura", () => {
    const d = decidirOrden(entrada({ cobros: [cobro("c", { plataforma: "MERCURY", fechaEmision: null })], facturasMercury: [mercury("m1")] }), nada);
    expect(d.ordenes[0]!.cuotas[0]!.fechaEmision).toBe("2026-05-03");
  });

  it("una factura de Mercury que cubre varias cuotas (AMC INV-47)", () => {
    const d = decidirOrden(
      entrada({
        cobros: ["05", "06", "07"].map((m) => cobro(`c${m}`, { periodo: `2026-${m}`, fechaProgramada: `2026-${m}-01`, fechaEmision: `2026-${m}-01`, monto: 2450, plataforma: "MERCURY" })),
        facturasMercury: [mercury("m47", { invoiceDate: "2026-08-10", monto: 7350 })],
      }),
      nada,
    );
    expect(d.ordenes).toHaveLength(1);
    expect(d.ordenes[0]).toMatchObject({ regla: "VARIAS_CUOTAS", fuente: "MERCURY", numero: "INV-47" });
  });
});

describe("las piezas", () => {
  it("combinacionesExactas encuentra todas hasta 4", () => {
    const xs = [1, 1, 1, 1].map((monto) => ({ monto }));
    expect(combinacionesExactas(xs, 200).length).toBe(4);
    expect(combinacionesExactas([{ monto: 10 }, { monto: 20 }], 3000)).toEqual([[{ monto: 20 }, { monto: 10 }]]);
  });

  it("porQueNoSeOrdena: solo lo que no cambia de estado", () => {
    expect(porQueNoSeOrdena(true, false, [{ estado: "COBRADO", fechaEmision: "x" }])).toBeNull();
    expect(porQueNoSeOrdena(false, true, [{ estado: "POR_COBRAR", fechaEmision: "x" }])).toBeNull();
    expect(porQueNoSeOrdena(false, true, [{ estado: "COBRADO", fechaEmision: "x" }])).not.toBeNull();
    expect(porQueNoSeOrdena(false, false, [{ estado: "COBRADO", fechaEmision: "x" }])).not.toBeNull();
  });
});
