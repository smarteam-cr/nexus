/**
 * lib/cobranza/carga-desde-odoo.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/carga-desde-odoo.test.ts --project unit`.
 *
 * La carga de la cuenta de kölbi desde Odoo (2026-09-30), con sus documentos reales de 2026: las facturas de Publimark
 * y McCann, la nota de crédito que anula la FAC/2026/0210, las revertidas por la moneda equivocada, y los pagos que
 * Odoo tiene conciliados con el banco.
 */
import { describe, it, expect } from "vitest";
import { planDeCargaDesdeOdoo, textoDeCargaDesdeOdoo, type DocumentoDeOdoo } from "./carga-desde-odoo";

const PUBLIMARK = { odooPartnerId: 75, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA" };
const MCCANN = { odooPartnerId: 168, odooPartnerNombre: "MCCANN ERICKSON CENTROAMERICANA COSTA RICA SOCIEDAD ANONIMA" };

const doc = (numero: string, invoiceDate: string, p: Partial<DocumentoDeOdoo> = {}): DocumentoDeOdoo => {
  const montoNeto = p.montoNeto ?? 13475;
  const montoTotal = p.montoTotal ?? Math.round(montoNeto * 113) / 100;
  const pagada = (p.paymentState ?? "paid") !== "not_paid";
  return {
    ...PUBLIMARK,
    numero,
    invoiceDate,
    moveType: "out_invoice",
    state: "posted",
    paymentState: "paid",
    montoNeto,
    montoTotal,
    montoResidual: pagada ? 0 : montoTotal,
    moneda: "USD",
    ...p,
  };
};
const enColones = { moneda: "CRC", montoNeto: 11541250, montoTotal: 13041612.5 };
const deMcCann = { ...MCCANN, moneda: "CRC", montoNeto: 11541249.95, montoTotal: 13041612.44 };

/** Los 22 documentos de 2026 de Publimark y McCann, tal como están en Odoo el 2026-09-30. */
const DOCUMENTOS: DocumentoDeOdoo[] = [
  doc("FAC/2026/0209", "2026-02-12"),
  doc("FAC/2026/0210", "2026-02-12", { paymentState: "not_paid" }),
  doc("FAC/2026/0211", "2026-02-12", { paymentState: "not_paid", montoNeto: 6737.5, montoTotal: 7613.38 }),
  doc("FAC/2026/0246", "2026-02-12", { moveType: "out_refund", paymentState: "not_paid" }),
  doc("FAC/2026/0223", "2026-03-04", { paymentState: "not_paid", montoNeto: 6737.5, montoTotal: 7613.38 }),
  doc("FAC/2026/0229", "2026-03-06", { paymentState: "reversed", montoNeto: 23082.5 }),
  doc("FAC/2026/0232", "2026-03-24", { paymentState: "reversed", montoNeto: 11541250 }),
  doc("FAC/2026/0233", "2026-03-24", enColones),
  doc("FAC/2026/0263", "2026-03-24", { moveType: "out_refund", montoNeto: 23082.5 }),
  doc("FAC/2026/0243", "2026-03-24", { moveType: "out_refund", montoNeto: 11541250 }),
  doc("FAC/2026/0236", "2026-03-31"),
  doc("FAC/2026/0275", "2026-04-23"),
  doc("FAC/2026/0288", "2026-05-28"),
  doc("FAC/2026/0308", "2026-06-24", { paymentState: "not_paid" }),
  doc("FAC/2026/0312", "2026-07-15", deMcCann),
  doc("FAC/2026/0320", "2026-07-28", { paymentState: "not_paid" }),
  doc("FAC/2026/0321", "2026-07-28", enColones),
  doc("FAC/2026/0332", "2026-08-26"),
  doc("FAC/2026/0334", "2026-09-03"),
  doc("FAC/2026/0343", "2026-09-10", { ...deMcCann, paymentState: "not_paid" }),
  doc("FAC/2026/0344", "2026-09-10", { ...deMcCann, paymentState: "not_paid" }),
  doc("FAC/2026/0345", "2026-09-10", { ...deMcCann, paymentState: "not_paid" }),
];

/** Los días en que la plata entró al banco, de la conciliación de Odoo. */
const PAGOS = new Map([
  ["FAC/2026/0209", "2026-03-31"],
  ["FAC/2026/0233", "2026-04-29"],
  ["FAC/2026/0236", "2026-04-29"],
  ["FAC/2026/0275", "2026-05-29"],
  ["FAC/2026/0288", "2026-07-30"],
  ["FAC/2026/0312", "2026-08-21"],
  ["FAC/2026/0321", "2026-09-10"],
  ["FAC/2026/0332", "2026-09-10"],
  ["FAC/2026/0334", "2026-09-10"],
]);

const plan = (p: Partial<Parameters<typeof planDeCargaDesdeOdoo>[1]> = {}) =>
  planDeCargaDesdeOdoo(DOCUMENTOS, { anio: 2026, numerosEnCobros: new Set(), fechasDePago: PAGOS, cobrarConFirma: true, ...p });

describe("cargar la cuenta de kölbi desde Odoo", () => {
  it("entran las 16 facturas vivas: 10 en dólares y 6 en colones, sin IVA", () => {
    const r = plan();
    expect(r.aCargar).toHaveLength(16);
    expect(r.aCargar.filter((c) => c.moneda === "USD")).toHaveLength(10);
    /* Dólares: 8 de US$13.475 y 2 de US$6.737,50, sin la 0210 que anuló su nota. Colones: 6 facturas de ₡11,5 M. */
    expect(r.totales).toEqual({ USD: 121275, CRC: 69247499.8 });
  });

  it("⚠ la factura sin pagar con una nota de crédito del mismo día y el mismo total no entra: la anuló", () => {
    const r = plan();
    expect(r.anuladasPorNota).toEqual([{ numero: "FAC/2026/0210", nota: "FAC/2026/0246", monto: 13475, moneda: "USD", fecha: "2026-02-12" }]);
    expect(r.aCargar.map((c) => c.numero)).not.toContain("FAC/2026/0210");
    /* Una nota anula UNA factura: la 0211 (la mitad) y la 0209 (pagada) entran. */
    expect(r.aCargar.map((c) => c.numero)).toEqual(expect.arrayContaining(["FAC/2026/0209", "FAC/2026/0211"]));
  });

  it("las revertidas y las notas de crédito no son cobros", () => {
    const r = plan();
    expect(r.noEntran).toEqual([
      { numero: "FAC/2026/0229", motivo: "está revertida en Odoo" },
      { numero: "FAC/2026/0232", motivo: "está revertida en Odoo" },
    ]);
    const numeros = r.aCargar.map((c) => c.numero);
    for (const nota of ["FAC/2026/0246", "FAC/2026/0263", "FAC/2026/0243"]) expect(numeros).not.toContain(nota);
  });

  it("⭐ con firma, las pagadas entran cobradas con el día en que la plata entró al banco; las demás, por cobrar", () => {
    const r = plan();
    const de = (n: string) => r.aCargar.find((c) => c.numero === n);
    expect(de("FAC/2026/0209")).toMatchObject({ estado: "COBRADO", fechaCobro: "2026-03-31", monto: 13475, moneda: "USD", periodo: "2026-02", fecha: "2026-02-12" });
    expect(de("FAC/2026/0312")).toMatchObject({ estado: "COBRADO", fechaCobro: "2026-08-21", monto: 11541249.95, moneda: "CRC", odooPartnerId: 168 });
    expect(de("FAC/2026/0343")).toMatchObject({ estado: "POR_COBRAR", fechaCobro: null });
    expect(r.aCargar.filter((c) => c.estado === "COBRADO")).toHaveLength(9);
  });

  it("⛔ sin firma, nada entra cobrado: COBRADO lo confirma una persona (INV3)", () => {
    const r = plan({ cobrarConFirma: false });
    expect(r.aCargar.every((c) => c.estado === "POR_COBRAR" && c.fechaCobro === null)).toBe(true);
    expect(r.aCargar.find((c) => c.numero === "FAC/2026/0209")?.nota).toContain("Odoo la da pagada");
  });

  it("pagada sin día de pago conocido: entra por cobrar y lo dice", () => {
    const r = plan({ fechasDePago: new Map() });
    const x = r.aCargar.find((c) => c.numero === "FAC/2026/0209");
    expect(x).toMatchObject({ estado: "POR_COBRAR", fechaCobro: null });
    expect(x?.nota).toContain("no se encontró el día del pago");
  });

  it("pagada a medias: por cobrar, porque falta plata", () => {
    const r = planDeCargaDesdeOdoo([doc("FAC/2026/0400", "2026-09-20", { paymentState: "partial", montoResidual: 5000 })], {
      anio: 2026,
      numerosEnCobros: new Set(),
      fechasDePago: new Map([["FAC/2026/0400", "2026-09-25"]]),
      cobrarConFirma: true,
    });
    expect(r.aCargar[0]).toMatchObject({ estado: "POR_COBRAR", nota: "Odoo la da pagada en parte: entra por cobrar." });
  });

  it("correr la carga dos veces no duplica nada: lo que ya tiene cobro no se vuelve a cargar", () => {
    const primera = plan();
    const segunda = plan({ numerosEnCobros: new Set(primera.aCargar.map((c) => c.numero)) });
    expect(segunda.aCargar).toEqual([]);
    expect(segunda.yaEstaban).toHaveLength(16);
    expect(segunda.totales).toEqual({ USD: 0, CRC: 0 });
  });

  it("solo el año pedido", () => {
    const r = planDeCargaDesdeOdoo([doc("FAC/2025/0190", "2025-12-26")], { anio: 2026, numerosEnCobros: new Set(), fechasDePago: new Map(), cobrarConFirma: true });
    expect(r.aCargar).toEqual([]);
    expect(r.noEntran).toEqual([{ numero: "FAC/2025/0190", motivo: "es de 2025, no de 2026" }]);
  });

  it("la línea de la bitácora dice de dónde sale, por cuánto, a quién se facturó y quién confirma el cobro", () => {
    const x = plan().aCargar.find((c) => c.numero === "FAC/2026/0209")!;
    const texto = textoDeCargaDesdeOdoo(x, "egonzalez@smarteamcr.com", "egonzalez@smarteamcr.com");
    expect(texto).toContain("egonzalez@smarteamcr.com cargó la factura FAC/2026/0209 desde la copia de Odoo");
    expect(texto).toContain("sin IVA, facturada a «PUBLIMARK SOCIEDAD ANONIMA» el 2026-02-12");
    expect(texto).toContain("Cobrada el 2026-03-31 según el pago que Odoo tiene conciliado con el banco");
  });
});
