/**
 * lib/finanzas/cierre.test.ts — el cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del mes»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  cambioDespuesDelCierre,
  confirmadoPorPersona,
  esFaltanteDePlanilla,
  estadoEnElAnio,
  faltanParaCerrar,
  itemsDeCierre,
  mesParaCerrar,
  type DatosDelMes,
} from "./cierre";

const nombres = { registra: "Dinia", supervisa: "Alex" };
const completo: DatosDelMes = {
  periodo: "2026-07",
  quincenas: [1, 2],
  gastosListos: false,
  gastosAnotados: 0,
  faltantesDelExcel: [],
  tipoCambio: { crcPorUsd: 500, fuente: "BCCR", confirmadoPor: "alex@smarteamcr.com" },
  porRevisar: 0,
  devueltos: 0,
};

describe("qué frena el cierre", () => {
  it("un mes con todo listo no tiene nada que lo frene", () => {
    expect(faltanParaCerrar(itemsDeCierre(completo, null, nombres))).toEqual([]);
  });

  it("frenan la planilla, los gastos, el tipo de cambio y la revisión", () => {
    const d: DatosDelMes = {
      ...completo,
      quincenas: [1],
      faltantesDelExcel: ["costos fijos"],
      tipoCambio: { crcPorUsd: 500, fuente: "Excel", confirmadoPor: null },
      porRevisar: 3,
    };
    const items = itemsDeCierre(d, null, nombres);
    expect(faltanParaCerrar(items).map((i) => i.clave)).toEqual(["planilla", "gastos", "tipo-cambio", "revision"]);
    expect(items.find((i) => i.clave === "planilla")?.detalle).toBe("Falta la 2ª quincena de julio.");
  });

  it("desde octubre de 2026 los gastos los da por completos quien registra, no el Excel", () => {
    const octubre = { ...completo, periodo: "2026-10", faltantesDelExcel: ["costos fijos"] };
    const gastos = (d: DatosDelMes) => itemsDeCierre(d, null, nombres).find((i) => i.clave === "gastos")!;
    expect(gastos(octubre).listo).toBe(false);
    expect(gastos(octubre).quien).toBe("Dinia");
    expect(gastos({ ...octubre, gastosListos: true, gastosAnotados: 4 }).listo).toBe(true);
  });

  it("lo de Ingresos y Conciliación se muestra pero no frena", () => {
    const equipo = {
      porFacturar: { n: 15, plata: "US$24.181,66" },
      pagosDetectados: { n: 5, plata: "US$4.691" },
      comisionesVencidas: 3,
      conciliacion: 112,
    };
    const items = itemsDeCierre(completo, equipo, nombres);
    expect(items.filter((i) => !i.bloquea).map((i) => i.clave)).toEqual(["facturar", "pagos", "comisiones", "conciliacion"]);
    expect(faltanParaCerrar(items)).toEqual([]);
  });
});

describe("las piezas", () => {
  it("un tipo de cambio lo confirmó una persona si lo firma un email", () => {
    expect(confirmadoPorPersona("script:cargar-tipo-cambio")).toBeNull();
    expect(confirmadoPorPersona("alex@smarteamcr.com")).toBe("alex@smarteamcr.com");
    expect(confirmadoPorPersona(null)).toBeNull();
  });
  it("los faltantes de planilla ya tienen su línea", () => {
    expect(esFaltanteDePlanilla("planilla")).toBe(true);
    expect(esFaltanteDePlanilla("planilla-q2")).toBe(true);
    expect(esFaltanteDePlanilla("costos fijos")).toBe(false);
  });
  it("el mes que toca cerrar es el anterior, también en enero", () => {
    expect(mesParaCerrar("2026-10-04")).toBe("2026-09");
    expect(mesParaCerrar("2027-01-02")).toBe("2026-12");
  });
});

describe("la tira del año", () => {
  const hoy = "2026-10-04";
  it("cerrado, por venir, en curso, completo o lo que falta", () => {
    expect(estadoEnElAnio("2026-04", hoy, true, []).estado).toBe("CERRADO");
    expect(estadoEnElAnio("2026-11", hoy, false, []).texto).toBe("Por venir");
    expect(estadoEnElAnio("2026-10", hoy, false, [{ clave: "planilla" }]).texto).toBe("En curso");
    expect(estadoEnElAnio("2026-07", hoy, false, []).estado).toBe("LISTO");
    expect(estadoEnElAnio("2026-08", hoy, false, [{ clave: "planilla" }]).texto).toBe("Falta planilla");
    expect(estadoEnElAnio("2026-09", hoy, false, [{ clave: "planilla" }, { clave: "gastos" }]).texto).toBe("Faltan 2 cosas");
  });
});

describe("cambió después del cierre", () => {
  const guardados = { moneda: "USD" as const, egresos: 40000, facturado: 50000, cobrado: 30000, ingresosTotales: 52000 };
  it("un número distinto lo marca; un centavo de redondeo no", () => {
    expect(cambioDespuesDelCierre(guardados, { egresos: 40000, facturado: 50000, cobrado: 30000, ingresosTotales: 52000 })).toBe(false);
    expect(cambioDespuesDelCierre(guardados, { egresos: 40000.01, facturado: 50000, cobrado: 30000, ingresosTotales: 52000 })).toBe(false);
    expect(cambioDespuesDelCierre(guardados, { egresos: 40000, facturado: 50500, cobrado: 30000, ingresosTotales: 52500 })).toBe(true);
  });
});
