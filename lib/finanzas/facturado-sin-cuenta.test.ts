/**
 * lib/finanzas/facturado-sin-cuenta.test.ts
 *
 * Correr: `npx vitest run lib/finanzas/facturado-sin-cuenta.test.ts --project unit`.
 *
 * Lo que Odoo facturó a clientes sin cuenta en Nexus no entra al punto de equilibrio, y hasta el 2026-09-29 nada lo
 * decía: el tablero mostraba la mitad de lo facturado del año (Publimark y McCann no existen en Nexus).
 */
import { describe, it, expect } from "vitest";
import { facturadoEnOdooSinCuenta, type FacturaDeOdooSinCuenta } from "./facturado-sin-cuenta";
import { detectarInconsistencias, resumirInconsistencias, type EstadoParaAuditar } from "./inconsistencias";

/** A ₡500 por dólar, y sin tasa para agosto: como la tabla de tipos de cambio con un mes sin cargar. */
const aDolares = (monto: number, moneda: string, periodo: string): number | null => {
  if (moneda === "USD") return monto;
  if (periodo === "2026-08") return null;
  return Math.round((monto / 500) * 100) / 100;
};

const factura = (p: Partial<FacturaDeOdooSinCuenta> = {}): FacturaDeOdooSinCuenta => ({
  odooPartnerId: 75,
  odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA",
  invoiceDate: "2026-09-03",
  montoNeto: 13475,
  moneda: "USD",
  moveType: "out_invoice",
  state: "posted",
  paymentState: "paid",
  ...p,
});

describe("lo facturado en Odoo a clientes sin cuenta en Nexus", () => {
  const mccann = { odooPartnerId: 168, odooPartnerNombre: "MCCANN ERICKSON CENTROAMERICANA COSTA RICA SOCIEDAD ANONIMA", moneda: "CRC", montoNeto: 11541250 };
  const facturas = [
    factura({ invoiceDate: "2026-02-12", paymentState: "not_paid" }),
    factura({ invoiceDate: "2026-09-03" }),
    factura({ invoiceDate: "2026-07-28", moneda: "CRC", montoNeto: 11541250 }),
    factura({ ...mccann, invoiceDate: "2026-07-15" }),
    factura({ ...mccann, invoiceDate: "2026-09-10", paymentState: "not_paid" }),
  ];

  it("suma por cliente en la moneda del reporte, con cada factura a la tasa de SU mes", () => {
    const r = facturadoEnOdooSinCuenta(facturas, 2026, aDolares);
    expect(r.cuantas).toBe(5);
    expect(r.clientes).toBe(2);
    expect(r.sinTasa).toBe(0);
    /* Publimark: 13.475 × 2 + ₡11.541.250 / 500 = 50.032,50 · McCann: ₡23.082.500 / 500 = 46.165. */
    expect(r.items.map((i) => [i.texto, i.monto])).toEqual([
      ["PUBLIMARK SOCIEDAD ANONIMA", 50032.5],
      [mccann.odooPartnerNombre, 46165],
    ]);
    expect(r.monto).toBe(96197.5);
  });

  it("cada cliente dice cuántas facturas son, en su moneda, de qué meses y cuántas siguen sin pagar", () => {
    const r = facturadoEnOdooSinCuenta(facturas, 2026, aDolares);
    expect(r.items[0]?.nota).toBe("3 facturas · US$26.950 + ₡11.541.250 sin IVA · de feb a sep · 1 sin pagar en Odoo");
    expect(r.items[1]?.nota).toBe("2 facturas · ₡23.082.500 sin IVA · de jul a sep · 1 sin pagar en Odoo");
    const unaSola = facturadoEnOdooSinCuenta([factura()], 2026, aDolares).items[0];
    expect(unaSola?.nota).toBe("1 factura · US$13.475 sin IVA · de sep · todas pagadas en Odoo");
  });

  it("⛔ solo facturas vivas del año: ni notas de crédito, ni revertidas, ni anuladas, ni de otro año", () => {
    const r = facturadoEnOdooSinCuenta(
      [
        factura(),
        factura({ moveType: "out_refund", montoNeto: 23083 }),
        factura({ paymentState: "reversed", montoNeto: 11541250 }),
        factura({ state: "cancel" }),
        factura({ invoiceDate: "2025-12-29" }),
      ],
      2026,
      aDolares,
    );
    expect(r.cuantas).toBe(1);
    expect(r.monto).toBe(13475);
  });

  it("⚠ sin tipo de cambio no se aproxima: la factura se cuenta y se muestra, pero no suma", () => {
    const r = facturadoEnOdooSinCuenta(
      [factura(), factura({ invoiceDate: "2026-08-26", moneda: "CRC", montoNeto: 11541250 })],
      2026,
      aDolares,
    );
    expect(r.cuantas).toBe(2);
    expect(r.sinTasa).toBe(1);
    expect(r.monto).toBe(13475);
    expect(r.items[0]?.nota).toContain("US$13.475 + ₡11.541.250 sin IVA");
  });

  it("sin facturas sin cuenta no hay nada que decir", () => {
    expect(facturadoEnOdooSinCuenta([], 2026, aDolares)).toEqual({ cuantas: 0, clientes: 0, monto: 0, sinTasa: 0, items: [] });
  });
});

describe("la línea del punto de equilibrio: «facturado en Odoo que este tablero no cuenta»", () => {
  const limpio = (): EstadoParaAuditar => ({
    anio: 2026,
    hoyISO: "2026-09-29",
    mesesParciales: [],
    facturadoTotal: 277_343.14,
    ventas: {
      vendido: 471_465.67,
      sinCobranza: { cuantas: 0, monto: 0 },
      parcial: { cuantas: 0, monto: 0 },
      sinCliente: { cuantas: 0, monto: 0, items: [] },
      sinMonto: { cuantas: 0, items: [] },
      resueltasPorNombre: { cuantas: 0, items: [] },
      fueraDePipeline: { cuantas: 0, monto: 0, sinMonto: 0 },
      descubiertas: [],
    },
    comisionesVencidas: [],
    serviciosSinCobros: { cuantas: 0, monto: 0, items: [] },
    cuentasSinEmpresa: { cuantas: 0, items: [] },
    facturaSoloFueraDePipeline: { cuantas: 0, facturado: 0, cobrado: 0, items: [] },
    facturaDeGrupo: { cuantas: 0, facturado: 0, items: [] },
    cobradosSinFecha: { cuantas: 0, total: 101 },
    periodosSinTasa: [],
    facturadoSinTasa: [],
    monedaInferida: [],
    desviosDeCambio: [],
    tarjetaYHerramientas: { hay: false, periodos: [] },
    aguinaldo: null,
    ingresosSinCategoria: { cuantas: 0, monto: 0, items: [] },
  });
  const sinCuenta = { cuantas: 28, clientes: 7, monto: 282_324, sinTasa: 0, items: [{ texto: "PUBLIMARK SOCIEDAD ANONIMA", monto: 180_915 }] };

  it("aparece con su monto, dice cuánto más grande es el año y manda a crear la cuenta", () => {
    const x = detectarInconsistencias({ ...limpio(), facturadoEnOdooSinCuenta: sinCuenta }).find((i) => i.codigo === "ODOO_FACTURADO_SIN_CUENTA");
    expect(x?.severidad).toBe("ALTA");
    expect(x?.resuelve).toBe("COBRANZA");
    expect(x?.montoEnJuego).toBe(282_324);
    expect(x?.titulo).toBe("28 facturas de Odoo que este tablero no cuenta: son de 7 clientes sin cuenta en Nexus");
    /* El separador de miles lo pone `toLocaleString` y cambia con la versión de ICU: se afirma la cifra, no el signo. */
    expect(x?.detalle).toMatch(/Arriba dice \$277\D?343,14 facturados; con estas facturas serían \$559\D?667,14, sin IVA/);
    expect(x?.queHacer).toContain("Emparejar");
    expect(x?.items).toEqual(sinCuenta.items);
    expect(x?.yaContadoEn, "sin ventas descubiertas no hay con qué contarla dos veces").toBeUndefined();
  });

  it("⚠ con ventas sin cobranza en la lista, es la misma plata vista desde la factura: no infla el total", () => {
    /* El trato de kölbi (US$108.000) ya está en «ventas ganadas que no están en cobranza»; sus facturas, acá. */
    const xs = detectarInconsistencias({
      ...limpio(),
      ventas: { ...limpio().ventas, sinCobranza: { cuantas: 1, monto: 108_000 }, descubiertas: [{ texto: "KOLBI ICE | SALES HUB", monto: 108_000 }] },
      facturadoEnOdooSinCuenta: sinCuenta,
    });
    expect(xs.find((i) => i.codigo === "ODOO_FACTURADO_SIN_CUENTA")?.yaContadoEn).toBe("VENTAS_SIN_COBRANZA");
    expect(resumirInconsistencias(xs).montoTotal).toBe(108_000);
  });

  it("sin medir (o sin facturas sin cuenta) la línea no está: lo que se arregla desaparece", () => {
    expect(detectarInconsistencias(limpio()).some((i) => i.codigo === "ODOO_FACTURADO_SIN_CUENTA")).toBe(false);
    const vacio = { cuantas: 0, clientes: 0, monto: 0, sinTasa: 0, items: [] };
    expect(detectarInconsistencias({ ...limpio(), facturadoEnOdooSinCuenta: vacio })).toEqual([]);
  });

  it("dice cuántas facturas quedaron sin sumar por falta de tipo de cambio", () => {
    const x = detectarInconsistencias({ ...limpio(), facturadoEnOdooSinCuenta: { ...sinCuenta, sinTasa: 2 } }).find((i) => i.codigo === "ODOO_FACTURADO_SIN_CUENTA");
    expect(x?.detalle).toContain("2 de esas facturas no están sumadas");
  });
});
