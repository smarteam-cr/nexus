import { describe, expect, it } from "vitest";
import { conAguinaldo, costoDeLaHora, costoDelMes, filaDeMargen, horasPagadas, rangoDelPeriodo, tablaDeMargen, type CuentaParaMargen } from "./margen";

const HOY = new Date("2026-10-05T22:00:00Z");

describe("A · períodos (siempre meses cerrados)", () => {
  it("A1 mes, trimestre y año", () => {
    expect(rangoDelPeriodo("mes", HOY).meses).toEqual(["2026-09"]);
    expect(rangoDelPeriodo("trimestre", HOY).meses).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rangoDelPeriodo("anio", HOY).meses).toHaveLength(9);
    expect(rangoDelPeriodo("trimestre", HOY).etiqueta).toBe("jul – sep 2026");
    expect(rangoDelPeriodo("mes", HOY).etiqueta).toBe("sep 2026");
  });
  it("A2 en hora de Costa Rica y cruzando el año", () => {
    const r = rangoDelPeriodo("trimestre", HOY);
    expect(r.desde.toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    // El 1 de enero a las 3:00 de CR todavía es 31 de diciembre en UTC+0… y ya es enero en CR.
    expect(rangoDelPeriodo("mes", new Date("2027-01-01T09:00:00Z")).meses).toEqual(["2026-12"]);
    expect(rangoDelPeriodo("anio", new Date("2027-01-15T12:00:00Z")).meses).toHaveLength(12);
  });
});

describe("B · costo de una persona en un mes", () => {
  const base = { periodo: "2026-08", pagos: [], salario: null, alta: null, baja: null };
  it("B1 el libro manda: dos quincenas suman", () => {
    expect(costoDelMes({ ...base, pagos: [{ quincena: 1, monto: 500_000, moneda: "CRC" }, { quincena: 2, monto: 500_000, moneda: "CRC" }] })).toEqual({ monto: 1_000_000, moneda: "CRC", fuente: "libro" });
  });
  it("B2 una sola quincena y sigue en el equipo: la otra está por pagarse", () => {
    expect(costoDelMes({ ...base, pagos: [{ quincena: 1, monto: 600, moneda: "USD" }] })).toEqual({ monto: 1200, moneda: "USD", fuente: "libro-media" });
    // Si se fue a mitad de mes, solo lo pagado.
    expect(costoDelMes({ ...base, pagos: [{ quincena: 1, monto: 600, moneda: "USD" }], baja: new Date("2026-08-14T12:00:00Z") })?.monto).toBe(600);
  });
  it("B3 sin libro, el salario registrado, proporcional a los días", () => {
    const c = costoDelMes({ ...base, salario: { monto: 1550, moneda: "USD", frecuencia: "MENSUAL", finalizadoEl: null }, alta: new Date("2026-08-16T06:00:00Z") });
    expect(c?.fuente).toBe("costo-recurrente");
    expect(c?.monto).toBeCloseTo(800, 0);
    expect(costoDelMes({ ...base, salario: { monto: 12000, moneda: "USD", frecuencia: "ANUAL", finalizadoEl: null } })?.monto).toBe(1000);
  });
  it("B4 sin libro ni salario: no se adivina", () => {
    expect(costoDelMes(base)).toBeNull();
    expect(costoDelMes({ ...base, salario: { monto: 1000, moneda: "USD", frecuencia: "MENSUAL", finalizadoEl: new Date("2026-07-01T00:00:00Z") } })).toBeNull();
  });
  it("B5 aguinaldo y horas pagadas", () => {
    expect(conAguinaldo(1200)).toBe(1300);
    const r = rangoDelPeriodo("mes", HOY);
    expect(horasPagadas(40, r, null, null)).toBeCloseTo((40 * 30) / 7, 5);
    expect(horasPagadas(40, r, null, new Date("2026-08-01T00:00:00Z"))).toBe(0);
  });
});

const cuenta = (p: Partial<CuentaParaMargen>): CuentaParaMargen => ({
  clienteId: "c",
  nombre: "Acme",
  cse: "Heiver",
  ingreso: 10_000,
  fuenteDelIngreso: "Cobranza",
  horas: { reuniones: 40, preparacion: 5, entrega: 15 },
  reuniones: 20,
  plan: { sesiones: 10, horasTareas: 15 },
  ...p,
});

describe("C · margen", () => {
  it("C1 costo de la hora: directo y cargado", () => {
    const h = costoDeLaHora({ planilla: 76_924, horasPagadas: 7_401, horasConClientes: 2_710, ingreso: 139_860, horasPorSesion: 2.5 });
    expect(h.directo).toBeCloseTo(10.39, 2);
    expect(h.cargado).toBeCloseTo(28.39, 2);
    expect(h.ingresoPorHora).toBeCloseTo(51.6, 1);
    expect(h.parteAClientes).toBeCloseTo(0.366, 3);
    expect(costoDeLaHora({ planilla: 1, horasPagadas: 0, horasConClientes: 0, ingreso: 0, horasPorSesion: 0 }).cargado).toBeNull();
  });
  it("C2 una cuenta: margen real y planeado", () => {
    const f = filaDeMargen(cuenta({}), 28.4, 2.5);
    expect(f.horas).toBe(60);
    expect(f.costo).toBeCloseTo(1704);
    expect(f.margen).toBeCloseTo(8296);
    expect(f.margenPct).toBeCloseTo(0.83, 2);
    expect(f.horasPlaneadas).toBe(40);
    expect(f.realContraPlan).toBe("mas");
    expect(f.porHora).toBeCloseTo(166.67, 1);
  });
  it("C3 sin plan, sin entrega y sin ingreso", () => {
    const f = filaDeMargen(cuenta({ plan: null, ingreso: 0, horas: { reuniones: 10, preparacion: 1, entrega: 0 } }), 10, 2.5);
    expect(f.realContraPlan).toBe("sin-plan");
    expect(f.margenPct).toBeNull();
    expect(f.sinEntregaEstimada).toBe(true);
    expect(f.margen).toBe(-110);
  });
  it("C4 la tabla separa lo que cobró de lo que solo usó horas", () => {
    const t = tablaDeMargen([cuenta({ clienteId: "a", ingreso: 100 }), cuenta({ clienteId: "b", ingreso: 5000 }), cuenta({ clienteId: "c", ingreso: 0 }), cuenta({ clienteId: "d", ingreso: 0, horas: { reuniones: 0, preparacion: 0, entrega: 0 } })], 10, 2);
    expect(t.conIngreso.map((f) => f.clienteId)).toEqual(["b", "a"]);
    expect(t.sinIngreso.map((f) => f.clienteId)).toEqual(["c"]);
  });
});
