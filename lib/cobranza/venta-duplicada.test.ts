/**
 * lib/cobranza/venta-duplicada.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/venta-duplicada.test.ts --project unit`.
 *
 * La misma venta contada dos veces. Los casos son los de producción medidos el 2026-09-14 después de aplicar el Excel
 * de Alexander: Real Shipping INV-9 y Alliance RH INV-46 salen; Multiquimica INV-38 y Ecoquintas FAC/2026/0336 no.
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_CERCA_DE_LA_VENTA,
  laMismaVenta,
  plataEnDuda,
  textoDeLaMismaVenta,
  ventasContadasDosVeces,
  type CuotaDeVenta,
  type ServicioDeVenta,
} from "./venta-duplicada";

const DEL_LIBRO = "Facturación importada del libro de Alex (USD)";

const cuota = (p: Pick<CuotaDeVenta, "id" | "cuentaId" | "servicioId" | "monto"> & Partial<CuotaDeVenta>): CuotaDeVenta => ({
  servicio: "Servicio",
  fechaProgramada: "2026-07-15",
  fechaEmision: null,
  moneda: "USD",
  estado: "PROGRAMADO",
  numeroFactura: null,
  ...p,
});

const servicio = (p: Pick<ServicioDeVenta, "id" | "cuentaId" | "montoTotal"> & Partial<ServicioDeVenta>): ServicioDeVenta => ({
  descripcion: "Servicio",
  moneda: "USD",
  fechaInicio: "2026-08-15",
  activo: true,
  cobros: 0,
  ...p,
});

/* Real Shipping: INV-9 cargada cobrada desde el Excel; las cuotas 1 y 2 de su implementación, facturadas al día
   siguiente y cobradas; la 3, programada en julio. */
const realShipping = [
  cuota({ id: "inv9", cuentaId: "rs", servicioId: "libro-rs", servicio: DEL_LIBRO, monto: 6000, fechaProgramada: "2026-01-15", fechaEmision: "2026-01-15", estado: "COBRADO", numeroFactura: "INV-9" }),
  cuota({ id: "rs-1", cuentaId: "rs", servicioId: "impl", servicio: "Real Shipping", monto: 1500, fechaEmision: "2026-01-16", estado: "COBRADO" }),
  cuota({ id: "rs-2", cuentaId: "rs", servicioId: "impl", servicio: "Real Shipping", monto: 1500, fechaEmision: "2026-01-16", estado: "COBRADO" }),
  cuota({ id: "rs-3", cuentaId: "rs", servicioId: "impl", servicio: "Real Shipping", monto: 1000 }),
];

/* Alliance RH: INV-46 cargada cobrada; «Capacitación Sales» sin cobros, con entrada del 50 %. */
const alliance = [
  cuota({ id: "inv46", cuentaId: "al", servicioId: "libro-al", servicio: DEL_LIBRO, monto: 120, fechaProgramada: "2026-08-07", fechaEmision: "2026-08-07", estado: "COBRADO", numeroFactura: "INV-46" }),
];
const capacitacion = servicio({ id: "cap", cuentaId: "al", descripcion: "Capacitación Sales", montoTotal: 240, fechaInicio: "2026-08-15" });

describe("ventasContadasDosVeces: los casos de producción", () => {
  it("Real Shipping: INV-9 puede ser la misma venta que las cuotas 1 y 2, aunque 1.500 + 1.500 no dé 6.000", () => {
    const [v, ...resto] = ventasContadasDosVeces(realShipping, []);
    expect(resto).toEqual([]);
    expect(v?.factura).toMatchObject({ numero: "INV-9", monto: 6000, fecha: "2026-01-15", cobroIds: ["inv9"], servicioIds: ["libro-rs"] });
    expect(v?.cuotas.map((c) => c.id)).toEqual(["rs-1", "rs-2"]);
    expect(v && plataEnDuda(v)).toEqual([
      { clave: "c:rs-1", moneda: "USD", monto: 1500 },
      { clave: "c:rs-2", moneda: "USD", monto: 1500 },
    ]);
    expect(v && textoDeLaMismaVenta(v)).toBe("US$1.500 facturada el 2026-01-16 (cobrada) + US$1.500 facturada el 2026-01-16 (cobrada), de «Real Shipping»");
  });

  it("Alliance RH: INV-46 puede ser la entrada de «Capacitación Sales», que todavía no generó cobros", () => {
    const [v] = ventasContadasDosVeces(alliance, [capacitacion]);
    expect(v?.servicios.map((s) => s.id)).toEqual(["cap"]);
    expect(v && plataEnDuda(v)).toEqual([{ clave: "s:cap", moneda: "USD", monto: 120 }]);
    expect(v && textoDeLaMismaVenta(v)).toBe("el servicio «Capacitación Sales» (US$240, arranca el 2026-08-15, todavía sin cobros)");
  });

  it("⛔ Multiquimica INV-38: una cuota programada a 19 días en otro servicio es otra venta", () => {
    const multiquimica = [
      cuota({ id: "inv38", cuentaId: "mq", servicioId: "a", monto: 3400, fechaEmision: "2026-08-21", estado: "COBRADO", numeroFactura: "INV-38" }),
      cuota({ id: "mq-sep", cuentaId: "mq", servicioId: "b", monto: 1626.67, fechaProgramada: "2026-09-09" }),
    ];
    expect(ventasContadasDosVeces(multiquimica, [])).toEqual([]);
    expect(DIAS_CERCA_DE_LA_VENTA).toBe(15);
  });

  it("⛔ Ecoquintas FAC/2026/0336: una factura de dos servicios, con el número en las dos cuotas, no es una venta doble", () => {
    const ecoquintas = [
      cuota({ id: "e1880", cuentaId: "eco", servicioId: "web", monto: 1880, fechaEmision: "2026-09-03", estado: "POR_COBRAR", numeroFactura: "FAC/2026/0336" }),
      cuota({ id: "e1300", cuentaId: "eco", servicioId: "impl", monto: 1300, fechaEmision: "2026-09-03", estado: "POR_COBRAR", numeroFactura: "FAC/2026/0336" }),
    ];
    expect(ventasContadasDosVeces(ecoquintas, [])).toEqual([]);
  });
});

describe("laMismaVenta: lo que no cuenta", () => {
  const factura = { cuentaId: "rs", numero: "INV-9", fecha: "2026-01-15", monto: 6000, moneda: "USD", cobroIds: [], servicioIds: [] };
  const cerca = (p: Partial<CuotaDeVenta>) => cuota({ id: "x", cuentaId: "rs", servicioId: "impl", monto: 1500, fechaEmision: "2026-01-16", ...p });

  it("la factura que la carga está por cargar ve las cuotas de cualquier servicio", () => {
    expect(laMismaVenta(factura, [cerca({})], [])?.cuotas.map((c) => c.id)).toEqual(["x"]);
  });

  it.each([
    ["con otro número", { numeroFactura: "INV-7" }],
    ["de otra moneda", { moneda: "CRC" }],
    ["de otra cuenta", { cuentaId: "otra" }],
    ["por más que la factura", { monto: 6400 }],
    ["lejos en fecha", { fechaEmision: "2026-02-15" }],
    ["sin dato", { estado: "SIN_DATO" }],
  ])("⛔ una cuota %s no es la misma venta", (_, p) => {
    expect(laMismaVenta(factura, [cerca(p)], [])).toBeNull();
  });

  it("⛔ un servicio con cobros, pausado, sin arranque o que vale menos que la factura no es la misma venta", () => {
    const base = servicio({ id: "s", cuentaId: "rs", montoTotal: 8000, fechaInicio: "2026-01-20" });
    expect(laMismaVenta(factura, [], [base])?.servicios).toHaveLength(1);
    for (const s of [{ cobros: 3 }, { activo: false }, { fechaInicio: null }, { montoTotal: 3000 }]) {
      expect(laMismaVenta(factura, [], [{ ...base, ...s }])).toBeNull();
    }
  });
});
