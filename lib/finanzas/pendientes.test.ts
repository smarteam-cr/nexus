/**
 * lib/finanzas/pendientes.test.ts — Finanzas › Pendientes, la entrada de quien registra (rediseño 2026-10-03).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import { armarPendientes, type DatosDePendientes } from "./pendientes";

const vacio: DatosDePendientes = {
  porFacturar: { n: 0, montos: [] },
  promesas: { n: 0, montos: [], clientes: [] },
  pagosDetectados: { n: 0, montos: [] },
  comisionesVencidas: 0,
  porEmparejar: { odoo: 0, mercury: 0 },
  diferencias: 0,
  decisiones: 0,
  gastosDelMes: null,
  devueltos: [],
};

describe("armarPendientes", () => {
  it("sin nada que hacer, ninguna tarea (las decisiones de quien supervisa no son tareas de quien registra)", () => {
    expect(armarPendientes({ ...vacio, decisiones: 28 })).toEqual([]);
  });

  it("con los números de hoy (2026-10-03): primero lo de hoy, después lo de la semana", () => {
    const tareas = armarPendientes({
      ...vacio,
      pagosDetectados: { n: 5, montos: [{ moneda: "USD", monto: 4691 }] },
      porFacturar: { n: 15, montos: [{ moneda: "USD", monto: 24181.66 }] },
      promesas: { n: 12, montos: [{ moneda: "USD", monto: 20795 }], clientes: ["Construtecho", "Iberorutas", "JUDESUR", "Honda"] },
      comisionesVencidas: 3,
      porEmparejar: { odoo: 0, mercury: 30 },
      diferencias: 112,
    });
    expect(tareas.map((t) => t.clave)).toEqual(["pagos", "facturar", "promesas", "comisiones", "emparejar", "diferencias"]);
    expect(tareas.filter((t) => t.cuando === "hoy").map((t) => t.clave)).toEqual(["pagos", "facturar", "promesas", "comisiones"]);
    expect(tareas[1]!.titulo).toBe("Facturar 15 cuotas que ya tocan");
    expect(tareas[2]!.detalle).toContain("Construtecho, Iberorutas, JUDESUR y otros");
    expect(tareas[4]!.detalle).toContain("30 de Mercury");
  });

  it("los gastos del mes son tarea hasta que se avisa que están todos", () => {
    const g = { periodo: "2026-10", etiqueta: "octubre", anotados: 2, listos: false };
    expect(armarPendientes({ ...vacio, gastosDelMes: g }).map((t) => t.clave)).toEqual(["gastos"]);
    expect(armarPendientes({ ...vacio, gastosDelMes: { ...g, listos: true } })).toEqual([]);
  });

  it("en singular cuando es uno", () => {
    const [t] = armarPendientes({ ...vacio, comisionesVencidas: 1 });
    expect(t!.titulo).toBe("Confirmar 1 comisión de aliado");
  });
});
