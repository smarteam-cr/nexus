/**
 * lib/finanzas/egresos-nexus.test.ts — el gasto del punto de equilibrio desde Nexus (rediseño de Finanzas, 2026-10-03,
 * etapa «Gasto sin Excel»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import { calidadDeMesDeNexus, costoVigenteEn, egresoDesdeNexus, egresosDeNexus, type CostoParaEgreso } from "./egresos-nexus";
import { calcularEquilibrio, type EgresoDeMes } from "./equilibrio";
import { porCobrarEnMercurySinEmparejar } from "./facturado-sin-cuenta";

const costo = (x: Partial<CostoParaEgreso>): CostoParaEgreso => ({
  id: "c1",
  nombre: "HubSpot",
  categoria: "HERRAMIENTA",
  monto: 800,
  moneda: "USD",
  frecuencia: "MENSUAL",
  activo: true,
  finalizadoEl: null,
  creadoEl: "2026-07-01",
  ...x,
});

describe("de dónde sale el gasto", () => {
  it("hasta septiembre del Excel, desde octubre de Nexus", () => {
    expect(egresoDesdeNexus("2026-09")).toBe(false);
    expect(egresoDesdeNexus("2026-10")).toBe(true);
    expect(egresoDesdeNexus("2027-01")).toBe(true);
  });
});

describe("costoVigenteEn", () => {
  it("un pausado no cuenta; uno dado de baja cuenta hasta su mes; uno cargado después, desde su mes", () => {
    expect(costoVigenteEn(costo({ activo: false }), "2026-10")).toBe(false);
    expect(costoVigenteEn(costo({ finalizadoEl: "2026-10-15" }), "2026-10")).toBe(true);
    expect(costoVigenteEn(costo({ finalizadoEl: "2026-10-15" }), "2026-11")).toBe(false);
    expect(costoVigenteEn(costo({ creadoEl: "2026-11-03" }), "2026-10")).toBe(false);
    expect(costoVigenteEn(costo({ creadoEl: "2026-11-03" }), "2026-11")).toBe(true);
  });
});

describe("egresosDeNexus", () => {
  const costos = [costo({}), costo({ id: "c2", nombre: "Hosting", categoria: "FIJO_OPERACION", monto: 1200, frecuencia: "ANUAL" })];
  const gastos = [
    { fecha: "2026-10-02", monto: 40, moneda: "USD" as const },
    { fecha: "2026-10-20", monto: 10, moneda: "USD" as const },
    { fecha: "2026-10-05", monto: 5000, moneda: "CRC" as const },
    { fecha: "2026-11-01", monto: 99, moneda: "USD" as const },
  ];
  const lineas = egresosDeNexus(["2026-09", "2026-10"], costos, gastos, () => "MEDIDO");

  it("no toca los meses del Excel", () => {
    expect(lineas.every((l) => l.periodo === "2026-10")).toBe(true);
  });
  it("cada recurrente por lo que cuesta en un mes: un anual pesa la doceava parte", () => {
    expect(lineas.find((l) => l.conceptoClave === "costo-c1")).toMatchObject({ rubro: "HERRAMIENTA", monto: 800 });
    expect(lineas.find((l) => l.conceptoClave === "costo-c2")).toMatchObject({ rubro: "FIJO_OPERACION", monto: 100 });
  });
  it("los gastos del mes van juntos, uno por moneda, como costo fijo; los de otro mes no", () => {
    const delMes = lineas.filter((l) => l.conceptoClave === "gastos-del-mes");
    expect(delMes.map((l) => [l.moneda, l.monto])).toEqual([
      ["USD", 50],
      ["CRC", 5000],
    ]);
    expect(delMes.every((l) => l.rubro === "FIJO_OPERACION")).toBe(true);
  });
  it("sin rubro tarjeta: lo que se paga con tarjeta ya es un recurrente o un gasto del mes", () => {
    expect(lineas.some((l) => l.rubro === "TARJETA")).toBe(false);
  });
});

describe("calidadDeMesDeNexus", () => {
  it("completo con las dos quincenas y los gastos confirmados", () => {
    expect(calidadDeMesDeNexus(new Set([1, 2]), true)).toEqual({ estado: "COMPLETO", faltantes: [] });
  });
  it("lo que falta se nombra como en el Excel, para que el cierre lo reconozca", () => {
    expect(calidadDeMesDeNexus(new Set([1]), false)).toEqual({
      estado: "PARCIAL",
      faltantes: ["planilla-q2", "gastos del mes sin confirmar"],
    });
    expect(calidadDeMesDeNexus(new Set(), true).faltantes).toEqual(["planilla"]);
  });
});

describe("el motor con meses de calidad dada", () => {
  const e = (periodo: string, rubro: EgresoDeMes["rubro"], conceptoClave: string, monto: number): EgresoDeMes => ({
    periodo,
    rubro,
    concepto: conceptoClave,
    conceptoClave,
    monto,
    moneda: "USD",
    calidad: "MEDIDO",
  });
  const egresos = [
    e("2026-09", "HERRAMIENTA", "excel-hubspot", 800),
    e("2026-09", "TARJETA", "tarjeta", 131),
    e("2026-10", "HERRAMIENTA", "costo-c1", 800),
  ];
  const r = calcularEquilibrio(egresos, [], {
    anio: 2026,
    hoyISO: "2026-11-04",
    calidadDada: new Map([["2026-10", { estado: "COMPLETO" as const, faltantes: [] }]]),
  });
  const mes = (p: string) => r.meses.find((m) => m.periodo === p)!;

  it("un mes de Nexus usa su calidad, aunque no tenga la tarjeta ni los conceptos del Excel", () => {
    expect(mes("2026-10").estado).toBe("COMPLETO");
    expect(mes("2026-10").egresos).toBe(800);
  });
  it("los meses del Excel se siguen midiendo como siempre", () => {
    expect(mes("2026-09").estado).toBe("COMPLETO");
    expect(mes("2026-08").estado).toBe("PARCIAL");
  });
});

describe("Mercury sin emparejar", () => {
  const f = (cliente: string, invoiceDate: string, monto: number, estado = "Unpaid") => ({
    mercuryCustomerId: cliente,
    clienteNombre: cliente,
    invoiceDate,
    monto,
    moneda: "USD",
    estado,
  });
  const medido = porCobrarEnMercurySinEmparejar(
    [f("Teamnet", "2026-08-01", 2000), f("Teamnet", "2026-09-01", 2000), f("Metzger", "2026-09-28", 925), f("Metzger", "2026-07-01", 500, "Paid"), f("Otro", "2025-12-01", 100)],
    2026,
    (monto) => monto,
  );
  it("cuenta lo sin pagar del año, por cliente, el más grande primero", () => {
    expect(medido.cuantas).toBe(3);
    expect(medido.clientes).toBe(2);
    expect(medido.monto).toBe(4925);
    expect(medido.items.map((i) => i.texto)).toEqual(["Teamnet", "Metzger"]);
  });
});
