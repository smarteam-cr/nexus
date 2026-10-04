/**
 * lib/finanzas/gastos.test.ts — los gastos del mes sin salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  CATEGORIAS_SIN_SALARIO,
  EGRESOS_DESDE_NEXUS,
  etiquetaMes,
  gastosDelMesPendiente,
  mesAnterior,
  mesSiguiente,
  montoMensual,
} from "./gastos";
import { recurrenteCreateSchema, recurrentePatchSchema } from "./gastos-esquemas";

describe("las categorías sin salario", () => {
  it("son herramientas y fijos de operación; Salario no está", () => {
    expect([...CATEGORIAS_SIN_SALARIO]).toEqual(["HERRAMIENTA", "FIJO_OPERACION"]);
    expect((CATEGORIAS_SIN_SALARIO as readonly string[]).includes("SALARIO")).toBe(false);
  });

  const base = { nombre: "HubSpot", monto: 100, moneda: "USD", frecuencia: "MENSUAL" };
  it("desde las pantallas de quien registra no se crea un salario", () => {
    expect(recurrenteCreateSchema.safeParse({ ...base, categoria: "HERRAMIENTA" }).success).toBe(true);
    expect(recurrenteCreateSchema.safeParse({ ...base, categoria: "SALARIO" }).success).toBe(false);
  });
  it("ni se convierte un costo en salario, ni se le liga una persona", () => {
    expect(recurrentePatchSchema.safeParse({ categoria: "SALARIO" }).success).toBe(false);
    expect(recurrentePatchSchema.safeParse({ teamMemberId: "cmtum4orn00bd07lg0if1q51q" }).success).toBe(false);
    expect(recurrentePatchSchema.safeParse({ monto: 120 }).success).toBe(true);
  });
});

describe("meses", () => {
  it("anterior y siguiente cruzan el año", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesAnterior("2026-10")).toBe("2026-09");
  });
  it("se nombran en español", () => {
    expect(etiquetaMes("2026-10")).toBe("octubre");
    expect(etiquetaMes("2026-09", true)).toBe("septiembre 2026");
  });
  it("un recurrente anual pesa la doceava parte por mes", () => {
    expect(montoMensual(240, "ANUAL")).toBe(20);
    expect(montoMensual(240, "MENSUAL")).toBe(240);
  });
});

describe("gastosDelMesPendiente", () => {
  const vacio = { listos: new Set<string>(), anotados: new Map<string, number>() };
  it("antes del corte no pide nada: ese gasto es del Excel de egresos", () => {
    expect(EGRESOS_DESDE_NEXUS).toBe("2026-10");
    expect(gastosDelMesPendiente({ ...vacio, hoyISO: "2026-09-20" })).toBeNull();
  });
  it("en el primer mes del corte pide el mes en curso, con lo que lleva anotado", () => {
    expect(gastosDelMesPendiente({ ...vacio, hoyISO: "2026-10-04", anotados: new Map([["2026-10", 2]]) })).toEqual({
      periodo: "2026-10",
      etiqueta: "octubre",
      anotados: 2,
      listos: false,
    });
  });
  it("el mes anterior manda mientras no se avise que está completo", () => {
    expect(gastosDelMesPendiente({ ...vacio, hoyISO: "2026-11-03" })?.periodo).toBe("2026-10");
    expect(gastosDelMesPendiente({ ...vacio, hoyISO: "2026-11-03", listos: new Set(["2026-10"]) })?.periodo).toBe("2026-11");
  });
  it("con los dos avisados, nada", () => {
    expect(gastosDelMesPendiente({ ...vacio, hoyISO: "2026-11-03", listos: new Set(["2026-10", "2026-11"]) })).toBeNull();
  });
});
