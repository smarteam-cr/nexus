/**
 * lib/finanzas/reglas-de-gasto.test.ts — las dos reglas de gasto, el presupuesto y las facturas que faltan (2026-11-13).
 */
import { describe, expect, it } from "vitest";
import {
  FACTURAS_DESDE,
  REGLAS_DE_GASTO_DESDE,
  avisosDelGasto,
  avisosDelRecurrente,
  cargoSobrePresupuesto,
  fijoDesde,
  gastosSinFactura,
  type GastoParaReglas,
} from "./reglas-de-gasto";
import { costoParaEgreso, montoDelCostoEn } from "./egresos-nexus";

const HOY = "2026-11-13";
const gasto = (extra: Partial<GastoParaReglas> = {}): GastoParaReglas => ({
  fecha: "2026-11-05",
  tipo: null,
  rubro: null,
  avisoPrevio: false,
  comprobante: "FE-001",
  pasoAFijo: false,
  ...extra,
});
const claves = (g: GastoParaReglas) => avisosDelGasto(g, HOY).map((a) => a.clave);

describe("gastos de representación: combustible, alimentación y equipo, con aviso previo", () => {
  it("combustible avisado y con factura: en regla", () => {
    expect(claves(gasto({ tipo: "REPRESENTACION", rubro: "COMBUSTIBLE", avisoPrevio: true }))).toEqual([]);
  });
  it("software como representación: fuera de la regla (grave)", () => {
    const a = avisosDelGasto(gasto({ tipo: "REPRESENTACION", rubro: "SOFTWARE", avisoPrevio: true }), HOY);
    expect(a.map((x) => x.clave)).toEqual(["FUERA_DE_REGLA"]);
    expect(a[0]!.grave).toBe(true);
    expect(a[0]!.texto).toContain("combustible, alimentación y equipo");
  });
  it("sin aviso previo se marca aunque el rubro esté bien", () => {
    expect(claves(gasto({ tipo: "REPRESENTACION", rubro: "ALIMENTACION" }))).toEqual(["SIN_AVISO_PREVIO"]);
  });
  it("sin rubro: falta decir en qué fue (no se da por fuera de la regla)", () => {
    expect(claves(gasto({ tipo: "REPRESENTACION", avisoPrevio: true }))).toEqual(["SIN_RUBRO"]);
  });
});

describe("tarjeta corporativa: solo suscripciones y software", () => {
  it("software: en regla", () => {
    expect(claves(gasto({ tipo: "TARJETA_CORPORATIVA", rubro: "SOFTWARE" }))).toEqual([]);
  });
  it("alimentación con la tarjeta: fuera de la regla", () => {
    expect(claves(gasto({ tipo: "TARJETA_CORPORATIVA", rubro: "ALIMENTACION" }))).toEqual(["FUERA_DE_REGLA"]);
  });
  it("una suscripción anotada como gasto puntual pide volverse fijo; ya fijo, no", () => {
    expect(claves(gasto({ tipo: "TARJETA_CORPORATIVA", rubro: "SUSCRIPCION" }))).toEqual(["SUSCRIPCION_SUELTA"]);
    expect(claves(gasto({ tipo: "TARJETA_CORPORATIVA", rubro: "SUSCRIPCION", pasoAFijo: true }))).toEqual([]);
  });
  it("lo grave va primero", () => {
    const a = avisosDelGasto(gasto({ tipo: "TARJETA_CORPORATIVA", rubro: "EQUIPO", comprobante: null }), HOY);
    expect(a.map((x) => x.clave)).toEqual(["FUERA_DE_REGLA", "SIN_FACTURA"]);
  });
});

describe("qué no mira", () => {
  it("«otro» (o sin clasificar) no tiene regla de rubro", () => {
    expect(claves(gasto({ tipo: "OTRO", rubro: "EQUIPO" }))).toEqual([]);
    expect(claves(gasto({ tipo: null, rubro: null }))).toEqual([]);
  });
  it("las reglas no miran hacia atrás: un gasto de antes de la regla no se marca por la regla", () => {
    expect(REGLAS_DE_GASTO_DESDE).toBe("2026-11-01");
    expect(claves(gasto({ fecha: "2026-10-20", tipo: "TARJETA_CORPORATIVA", rubro: "OTRO" }))).toEqual([]);
  });
});

describe("la factura", () => {
  it("falta en un gasto que ya pasó, desde que los gastos se anotan en Nexus", () => {
    expect(FACTURAS_DESDE).toBe("2026-10-01");
    expect(claves(gasto({ comprobante: null }))).toEqual(["SIN_FACTURA"]);
    expect(claves(gasto({ comprobante: "   " }))).toEqual(["SIN_FACTURA"]);
    expect(claves(gasto({ fecha: "2026-10-09", comprobante: null }))).toEqual(["SIN_FACTURA"]);
  });
  it("no se pide a una compra planificada ni a un gasto de antes de Nexus", () => {
    expect(claves(gasto({ fecha: "2026-12-01", comprobante: null }))).toEqual([]);
    expect(claves(gasto({ fecha: "2026-09-27", comprobante: null }))).toEqual([]);
  });
  it("la lista de las que faltan va de la más vieja a la más nueva", () => {
    const xs = [
      { id: "a", fecha: "2026-11-02", comprobante: null },
      { id: "b", fecha: "2026-10-09", comprobante: null },
      { id: "c", fecha: "2026-10-15", comprobante: "FE-9" },
      { id: "d", fecha: "2026-12-01", comprobante: null },
    ];
    expect(gastosSinFactura(xs, HOY).map((g) => g.id)).toEqual(["b", "a"]);
  });
});

describe("el presupuesto de los fijos", () => {
  const fijo = { categoria: "HERRAMIENTA", monto: 59, moneda: "USD", frecuencia: "MENSUAL", presupuesto: 60, activo: true, finalizadoEl: null };
  it("una suscripción sin presupuesto se marca; un fijo de operación sin presupuesto, no", () => {
    expect(avisosDelRecurrente({ ...fijo, presupuesto: null }).map((a) => a.clave)).toEqual(["SIN_PRESUPUESTO"]);
    expect(avisosDelRecurrente({ ...fijo, categoria: "FIJO_OPERACION", presupuesto: null })).toEqual([]);
  });
  it("un monto que pasa el presupuesto dice por cuánto", () => {
    const [a] = avisosDelRecurrente({ ...fijo, monto: 75.5 });
    expect(a!.clave).toBe("SOBRE_PRESUPUESTO");
    expect(a!.texto).toContain("15,50");
  });
  it("igual al presupuesto, pausado o dado de baja: nada", () => {
    expect(avisosDelRecurrente({ ...fijo, monto: 60 })).toEqual([]);
    expect(avisosDelRecurrente({ ...fijo, monto: 90, activo: false })).toEqual([]);
    expect(avisosDelRecurrente({ ...fijo, monto: 90, finalizadoEl: "2026-11-01" })).toEqual([]);
  });
  it("el cargo de la tarjeta se compara solo contra un presupuesto mensual", () => {
    expect(cargoSobrePresupuesto(61, { frecuencia: "MENSUAL", presupuesto: 60 })).toBe(true);
    expect(cargoSobrePresupuesto(60, { frecuencia: "MENSUAL", presupuesto: 60 })).toBe(false);
    expect(cargoSobrePresupuesto(400, { frecuencia: "ANUAL", presupuesto: 300 })).toBe(false);
    expect(cargoSobrePresupuesto(400, { frecuencia: "MENSUAL", presupuesto: null })).toBe(false);
  });
});

describe("un gasto que se repite se vuelve fijo desde el mes que sigue (sin contar dos veces su mes)", () => {
  it("fijoDesde: el primero del mes siguiente, con el cambio de año", () => {
    expect(fijoDesde("2026-11-05")).toBe("2026-12-01");
    expect(fijoDesde("2026-12-31")).toBe("2027-01-01");
  });
  it("el fijo que nace hoy de un gasto de este mes no cuenta este mes, sí el siguiente (egresos-nexus)", () => {
    const c = costoParaEgreso({
      id: "f",
      nombre: "Adobe",
      categoria: "HERRAMIENTA",
      monto: 29.99,
      moneda: "USD",
      frecuencia: "MENSUAL",
      activo: true,
      finalizadoEl: null,
      createdAt: new Date("2026-11-13T15:00:00Z"),
      movimientos: [{ tipo: "ALTA", fechaEfectiva: fijoDesde("2026-11-05"), monto: 29.99 }],
    });
    expect(montoDelCostoEn(c, "2026-11")).toBeNull();
    expect(montoDelCostoEn(c, "2026-12")).toBe(29.99);
  });
  it("el de un gasto de un mes viejo cuenta desde el mes en que se cargó, no hacia atrás", () => {
    const c = costoParaEgreso({
      id: "f",
      nombre: "LinkedIn",
      categoria: "HERRAMIENTA",
      monto: 110,
      moneda: "USD",
      frecuencia: "MENSUAL",
      activo: true,
      finalizadoEl: null,
      createdAt: new Date("2026-11-13T15:00:00Z"),
      movimientos: [{ tipo: "ALTA", fechaEfectiva: fijoDesde("2026-09-26"), monto: 110 }],
    });
    expect(montoDelCostoEn(c, "2026-10")).toBeNull();
    expect(montoDelCostoEn(c, "2026-11")).toBe(110);
  });
});
