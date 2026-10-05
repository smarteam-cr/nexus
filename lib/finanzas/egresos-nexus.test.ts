/**
 * lib/finanzas/egresos-nexus.test.ts — el gasto del punto de equilibrio desde Nexus (rediseño de Finanzas, 2026-10-03,
 * etapa «Gasto sin Excel»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  calidadDeMesDeNexus,
  costoParaEgreso,
  costoVigenteEn,
  egresoDesdeNexus,
  egresosDeNexus,
  montoDelCostoEn,
  type CostoParaEgreso,
  type MovimientoDeCosto,
} from "./egresos-nexus";
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
  it("uno dado de baja cuenta hasta su mes; uno cargado después, desde su mes", () => {
    expect(costoVigenteEn(costo({ finalizadoEl: "2026-10-15" }), "2026-10")).toBe(true);
    expect(costoVigenteEn(costo({ finalizadoEl: "2026-10-15" }), "2026-11")).toBe(false);
    expect(costoVigenteEn(costo({ creadoEl: "2026-11-03" }), "2026-10")).toBe(false);
    expect(costoVigenteEn(costo({ creadoEl: "2026-11-03" }), "2026-11")).toBe(true);
  });

  /* ⚠ CAMBIÓ A PROPÓSITO (auditoría 2026-10-05). Este caso decía «un pausado no cuenta» y lo probaba sin fecha, o sea en
     NINGÚN mes: era el defecto, no la regla. Pausar un recurrente el 3 de diciembre lo sacaba también de octubre, que ya
     se había pagado. Ahora una pausa apaga desde su fecha (ver «cada mes con lo que valía ese mes»). Lo que queda de la
     regla vieja es solo el caso sin historia: sin un movimiento que diga CUÁNDO se pausó, no se inventa una fecha. */
  it("sin historia, un pausado no cuenta: no hay fecha de la pausa y no se inventa", () => {
    expect(costoVigenteEn(costo({ activo: false }), "2026-10")).toBe(false);
  });
});

describe("cada mes con lo que valía ese mes (la historia de CostoMovimiento)", () => {
  const mov = (tipo: string, fechaEfectiva: string, monto = 800): MovimientoDeCosto => ({ tipo, fechaEfectiva, monto });
  const alta = mov("ALTA", "2026-07-01");

  it("un costo pausado el 3 de diciembre sigue contando en octubre y noviembre; diciembre cuenta su mes; enero no", () => {
    const c = costo({ activo: false, movimientos: [alta, mov("PAUSA", "2026-12-03")] });
    expect(montoDelCostoEn(c, "2026-10")).toBe(800);
    expect(montoDelCostoEn(c, "2026-11")).toBe(800);
    expect(montoDelCostoEn(c, "2026-12")).toBe(800);
    expect(montoDelCostoEn(c, "2027-01")).toBeNull();
  });

  it("un aumento en diciembre no cambia octubre; diciembre ya va con el monto nuevo", () => {
    const c = costo({ monto: 950, movimientos: [alta, mov("CAMBIO_MONTO", "2026-12-15", 950)] });
    expect(montoDelCostoEn(c, "2026-10")).toBe(800);
    expect(montoDelCostoEn(c, "2026-11")).toBe(800);
    expect(montoDelCostoEn(c, "2026-12")).toBe(950);
  });

  it("pausado el último día del mes: ese mes cuenta y el siguiente no; reactivado, vuelve desde su mes", () => {
    const c = costo({ movimientos: [alta, mov("PAUSA", "2026-10-31"), mov("REACTIVACION", "2027-01-10")] });
    expect(montoDelCostoEn(c, "2026-10")).toBe(800);
    expect(montoDelCostoEn(c, "2026-11")).toBeNull();
    expect(montoDelCostoEn(c, "2026-12")).toBeNull();
    expect(montoDelCostoEn(c, "2027-01")).toBe(800);
  });

  it("un cambio de monto no prende un costo pausado", () => {
    const c = costo({ activo: false, monto: 900, movimientos: [alta, mov("PAUSA", "2026-10-05"), mov("CAMBIO_MONTO", "2026-11-02", 900)] });
    expect(montoDelCostoEn(c, "2026-10")).toBe(800);
    expect(montoDelCostoEn(c, "2026-11")).toBeNull();
  });

  it("la baja la manda la fila: corregir su fecha deja dos BAJA y no apaga desde la primera", () => {
    const c = costo({ finalizadoEl: "2026-12-20", movimientos: [alta, mov("BAJA", "2026-10-15"), mov("BAJA", "2026-12-20")] });
    expect(montoDelCostoEn(c, "2026-11")).toBe(800);
    expect(montoDelCostoEn(c, "2026-12")).toBe(800);
    expect(montoDelCostoEn(c, "2027-01")).toBeNull();
  });

  it("si la historia no termina como la fila de hoy, manda la fila: no se reconstruye a ciegas", () => {
    // Nació pausado: anota un ALTA y nada más.
    expect(montoDelCostoEn(costo({ activo: false, movimientos: [alta] }), "2026-10")).toBeNull();
    // Un monto cambiado sin dejar huella: la historia dice 800 y la fila 1000.
    expect(montoDelCostoEn(costo({ monto: 1000, movimientos: [alta] }), "2026-10")).toBe(1000);
  });

  it("los egresos de Nexus llevan el monto de cada mes", () => {
    const c = costo({ monto: 950, movimientos: [alta, mov("CAMBIO_MONTO", "2026-12-15", 950)] });
    const lineas = egresosDeNexus(["2026-10", "2026-12"], [c], [], () => "MEDIDO");
    expect(lineas.map((l) => [l.periodo, l.monto])).toEqual([
      ["2026-10", 800],
      ["2026-12", 950],
    ]);
  });
});

describe("el día de alta", () => {
  it("es el de Costa Rica: cargado el 31 de octubre a las 23:30 (5:30 del 1 de noviembre en UTC) cuenta en octubre", () => {
    // La fila de prueba trae otro `creadoEl`: el que vale es el que sale de `createdAt`.
    const c = costoParaEgreso({ ...costo({}), createdAt: new Date("2026-11-01T05:30:00Z") });
    expect(c.creadoEl).toBe("2026-10-31");
    expect(costoVigenteEn(c, "2026-10")).toBe(true);
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
