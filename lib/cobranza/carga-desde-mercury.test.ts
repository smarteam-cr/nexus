/**
 * lib/cobranza/carga-desde-mercury.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/carga-desde-mercury.test.ts --project unit`.
 *
 * La carga de cuentas desde Mercury (2026-10-12), con las facturas reales de la copia de ese día: Patagonia Camp,
 * el Ministerio de Economía, Intercert (numeradas a mano, «INVOICE-1») y MSC Payroll, cuya factura ya son dos cuotas
 * que Nexus tiene cobradas sin número.
 */
import { describe, it, expect } from "vitest";
import { planDeCargaDesdeMercury, textoDeCargaDesdeMercury, type CuotaDeLaCuenta, type FacturaDeMercury } from "./carga-desde-mercury";

const factura = (numero: string, invoiceDate: string, monto: number, p: Partial<FacturaDeMercury> = {}): FacturaDeMercury => ({
  id: `fm-${numero}`,
  numero,
  mercuryCustomerId: "cliente",
  clienteNombre: "Patagonia Camp S.A",
  invoiceDate,
  monto,
  moneda: "USD",
  estado: "Paid",
  actualizadaEn: invoiceDate,
  ...p,
});
const BASE = { anio: 2026, numerosEnCobros: new Set<string>(), cuotasDeLaCuenta: [] as CuotaDeLaCuenta[], entradas: new Map<string, string>(), cobrarConFirma: true };

describe("qué entra", () => {
  it("las facturas del año, sin anular, en su moneda y por su monto", () => {
    const plan = planDeCargaDesdeMercury(
      [
        factura("INV-8", "2026-01-08", 4000),
        factura("INV-2", "2025-11-03", 100),
        factura("INV-50", "2026-08-01", 500, { estado: "Cancelled" }),
        factura("INV-51", "2026-08-02", 500, { moneda: "EUR" }),
      ],
      BASE,
    );
    expect(plan.aCargar.map((c) => c.numero)).toEqual(["INV-8"]);
    expect(plan.totales).toEqual({ USD: 4000, CRC: 0 });
    expect(plan.noEntran).toEqual([
      { numero: "INV-2", motivo: "es de 2025, no de 2026" },
      { numero: "INV-50", motivo: "está anulada en Mercury" },
      { numero: "INV-51", motivo: "está en EUR: Nexus cobra en dólares o en colones" },
    ]);
  });

  it("un número que ya está en un cobro no se carga otra vez, aunque esté escrito a mano («INVOICE-1»)", () => {
    const plan = planDeCargaDesdeMercury(
      [factura("INVOICE-1", "2026-03-05", 1000, { estado: "Unpaid" }), factura("INVOICE-2", "2026-04-05", 1000, { estado: "Unpaid" })],
      { ...BASE, numerosEnCobros: new Set(["INVOICE-1"]) },
    );
    expect(plan.yaEstaban).toEqual(["INVOICE-1"]);
    expect(plan.aCargar.map((c) => c.numero)).toEqual(["INVOICE-2"]);
  });

  it("⛔ si la cuenta ya tiene cuotas sin número en esa moneda, no carga: es probable que la factura sea una de ellas (MSC Payroll)", () => {
    const cuotas: CuotaDeLaCuenta[] = [
      { periodo: "2026-06", monto: 1680, moneda: "USD", estado: "COBRADO", numeroFactura: null },
      { periodo: "2026-07", monto: 1680, moneda: "USD", estado: "COBRADO", numeroFactura: null },
      { periodo: "2026-08", monto: 1680, moneda: "USD", estado: "PROGRAMADO", numeroFactura: null },
    ];
    const plan = planDeCargaDesdeMercury([factura("INV-36", "2026-07-10", 3360, { clienteNombre: "MSC Development Group LLC" })], { ...BASE, cuotasDeLaCuenta: cuotas });
    expect(plan.aCargar).toEqual([]);
    expect(plan.enCuotasSinNumero).toHaveLength(1);
    expect(plan.enCuotasSinNumero[0]).toMatchObject({ numero: "INV-36", monto: 3360, cuotas });
    expect(plan.totales.USD).toBe(0);
  });

  it("las cuotas con número o en otra moneda no frenan la carga", () => {
    const plan = planDeCargaDesdeMercury([factura("INV-60", "2026-09-01", 900)], {
      ...BASE,
      cuotasDeLaCuenta: [
        { periodo: "2026-08", monto: 900, moneda: "USD", estado: "COBRADO", numeroFactura: "INV-59" },
        { periodo: "2026-08", monto: 500000, moneda: "CRC", estado: "PROGRAMADO", numeroFactura: null },
      ],
    });
    expect(plan.aCargar.map((c) => c.numero)).toEqual(["INV-60"]);
  });
});

describe("cobrada o por cobrar", () => {
  it("pagada y con firma: cobrada el día que la plata entró a Mercury", () => {
    const f = factura("INV-10", "2026-01-26", 23687.25, { clienteNombre: "Ministerio de Economía - MH MINEC FONDO ROTATORIO CAF 12061" });
    const [c] = planDeCargaDesdeMercury([f], { ...BASE, entradas: new Map([[f.id, "2026-02-03"]]) }).aCargar;
    expect(c).toMatchObject({ estado: "COBRADO", fechaCobro: "2026-02-03", origenDelDia: "ENTRADA", nota: null });
  });

  it("pagada sin entrada en el banco: el día en que la copia la vio pagada, y la nota lo dice", () => {
    const [c] = planDeCargaDesdeMercury([factura("INV-8", "2026-01-08", 4000, { pagadaVistaEn: "2026-01-12" })], BASE).aCargar;
    expect(c).toMatchObject({ estado: "COBRADO", fechaCobro: "2026-01-12", origenDelDia: "VISTA" });
    expect(c!.nota).toMatch(/la copia la vio pagada/);
  });

  it("⛔ pagada sin entrada y sin saber cuándo: entra por cobrar, nunca con el último cambio de Mercury", () => {
    const [c] = planDeCargaDesdeMercury([factura("INV-8", "2026-01-08", 4000, { actualizadaEn: "2026-01-09" })], BASE).aCargar;
    expect(c).toMatchObject({ estado: "POR_COBRAR", fechaCobro: null, origenDelDia: null });
    expect(c!.nota).toMatch(/no dice qué día/);
  });

  it("⛔ sin firma de cobro nada entra cobrado (INV3)", () => {
    const [c] = planDeCargaDesdeMercury([factura("INV-8", "2026-01-08", 4000)], { ...BASE, cobrarConFirma: false }).aCargar;
    expect(c).toMatchObject({ estado: "POR_COBRAR", fechaCobro: null, origenDelDia: null });
    expect(c!.nota).toMatch(/pagada: entra por cobrar/);
  });

  it("sin pagar o en proceso: por cobrar", () => {
    const plan = planDeCargaDesdeMercury(
      [factura("INVOICE-1", "2026-03-05", 1000, { estado: "Unpaid" }), factura("INV-70", "2026-09-05", 1000, { estado: "Processing" })],
      BASE,
    );
    expect(plan.aCargar.map((c) => c.estado)).toEqual(["POR_COBRAR", "POR_COBRAR"]);
    expect(plan.aCargar[1]!.nota).toMatch(/en proceso de pago/);
  });
});

describe("la bitácora", () => {
  it("dice de dónde sale, por cuánto, a quién y quién confirma el cobro", () => {
    const f = factura("INV-10", "2026-01-26", 23687.25, { clienteNombre: "Ministerio de Economía" });
    const [c] = planDeCargaDesdeMercury([f], { ...BASE, entradas: new Map([[f.id, "2026-02-03"]]) }).aCargar;
    const texto = textoDeCargaDesdeMercury(c!, "egonzalez@smarteamcr.com", "egonzalez@smarteamcr.com");
    expect(texto).toContain("cargó la factura INV-10 desde la copia de Mercury");
    expect(texto).toContain("«Ministerio de Economía» el 2026-01-26");
    expect(texto).toContain("Cobrada el 2026-02-03, el día que la plata entró a Mercury; la confirma egonzalez@smarteamcr.com.");
  });
});
