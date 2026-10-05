/**
 * lib/finanzas/gastos.test.ts — los gastos del mes sin salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect, vi } from "vitest";
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
import { loadGastosDelMes } from "./gastos-server";

// «Gastos del mes» se prueba con la base y los loaders simulados (la pantalla de quien registra, sin Postgres).
const { db, loadCostos } = vi.hoisted(() => ({
  db: {
    costoMovimiento: { findMany: vi.fn() },
    pagoPlanilla: { findMany: vi.fn(async () => []) },
    tarjetaCredito: { count: vi.fn(async () => 0) },
    cierreMes: { findUnique: vi.fn(async () => null) },
  },
  loadCostos: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/cobranza/queries", () => ({ loadCostos, loadGastos: async () => [] }));
vi.mock("@/lib/cobranza/mutations", () => ({ CobranzaError: class extends Error {} }));

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

describe("«Gastos del mes» de otro mes: los recurrentes de ESE mes (auditoría 2026-10-05)", () => {
  /* Hasta el 2026-10-05 la pantalla de un mes pasado filtraba los recurrentes con su estado de HOY: uno pausado en
     diciembre desaparecía de octubre y un aumento de diciembre cambiaba el total de octubre. Ahora usa la misma vigencia
     por mes que el punto de equilibrio (lib/finanzas/egresos-nexus.ts, `montoDelCostoEn`). */
  const fila = (id: string, categoria: string, monto: number, activo: boolean, createdAt: string) => ({
    id,
    categoria,
    nombre: id,
    monto,
    moneda: "USD",
    frecuencia: "MENSUAL",
    teamMemberId: null,
    teamMemberName: null,
    montoBase: null,
    factorCargas: null,
    activo,
    finalizadoEl: null,
    notas: null,
    createdAt,
    updatedAt: createdAt,
  });
  const mov = (costoId: string, tipo: string, fecha: string, monto: number) => ({ costoId, tipo, fechaEfectiva: new Date(`${fecha}T00:00:00Z`), monto });

  it("pausado en diciembre cuenta en octubre; un aumento de diciembre no cambia octubre; uno cargado en noviembre no está", async () => {
    loadCostos.mockResolvedValue([
      fila("hubspot", "HERRAMIENTA", 800, false, "2026-07-01T15:00:00.000Z"),
      fila("alquiler", "FIJO_OPERACION", 1200, true, "2026-07-01T15:00:00.000Z"),
      fila("canva", "HERRAMIENTA", 15, true, "2026-11-03T15:00:00.000Z"),
    ]);
    db.costoMovimiento.findMany.mockResolvedValue([
      mov("hubspot", "ALTA", "2026-07-01", 800),
      mov("alquiler", "ALTA", "2026-07-01", 1000),
      mov("canva", "ALTA", "2026-11-03", 15),
      mov("alquiler", "CAMBIO_MONTO", "2026-12-01", 1200),
      mov("hubspot", "PAUSA", "2026-12-03", 800),
    ]);

    const octubre = await loadGastosDelMes("2026-10");
    expect(octubre.recurrentes).toEqual([
      { categoria: "HERRAMIENTA", cantidad: 1, montos: [{ moneda: "USD", monto: 800 }] },
      { categoria: "FIJO_OPERACION", cantidad: 1, montos: [{ moneda: "USD", monto: 1000 }] },
    ]);
    const enero = await loadGastosDelMes("2027-01");
    expect(enero.recurrentes).toEqual([
      { categoria: "HERRAMIENTA", cantidad: 1, montos: [{ moneda: "USD", monto: 15 }] },
      { categoria: "FIJO_OPERACION", cantidad: 1, montos: [{ moneda: "USD", monto: 1200 }] },
    ]);
  });

  it("⛔ la historia se pide sin salarios: el costo de hoy Y la foto de cada movimiento, y sin el monto anterior", async () => {
    loadCostos.mockResolvedValue([]);
    db.costoMovimiento.findMany.mockResolvedValue([]);
    await loadGastosDelMes("2026-10");
    const consulta = db.costoMovimiento.findMany.mock.calls.at(-1)![0] as { where: unknown; select: Record<string, unknown> };
    expect(consulta.where).toEqual({ categoria: { in: [...CATEGORIAS_SIN_SALARIO] }, costo: { categoria: { in: [...CATEGORIAS_SIN_SALARIO] } } });
    expect(consulta.select, "el monto anterior de un costo que antes fue salario ES un salario").not.toHaveProperty("montoAnterior");
  });
});
