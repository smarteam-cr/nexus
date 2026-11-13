import { describe, expect, it } from "vitest";
import { armarPendientes, type DatosDePendientes } from "./pendientes";

const base: DatosDePendientes = {
  porFacturar: { n: 0, montos: [] },
  promesas: { n: 0, montos: [], clientes: [] },
  pagosDetectados: { n: 0, montos: [] },
  comisionesVencidas: 0,
  porEmparejar: { odoo: 0, mercury: 0 },
  diferencias: 0,
  decisiones: 0,
};

describe("los conectores en mora en Finanzas › Pendientes (punto 14, 2026-11-13)", () => {
  it("sin conectores que decidir, no hay tarea", () => {
    expect(armarPendientes(base).find((t) => t.clave === "conectores")).toBeUndefined();
    expect(armarPendientes({ ...base, conectores: { desactivar: [], reactivar: [] } }).find((t) => t.clave === "conectores")).toBeUndefined();
  });

  it("⭐ la tarea pide decidir, dice que la deuda tiene que ser real y lleva a Seguimiento", () => {
    const t = armarPendientes({ ...base, conectores: { desactivar: ["Iberorutas"], reactivar: ["Noelito"] } }).find((x) => x.clave === "conectores")!;
    expect(t.titulo).toBe("Decidir 2 conectores en mora");
    expect(t.detalle).toMatch(/Iberorutas/);
    expect(t.detalle).toMatch(/solo si la deuda es real/);
    expect(t.detalle).toMatch(/Noelito/);
    expect(t.href).toBe("/cobranza?ver=seguimiento");
    expect(t.cuando).toBe("hoy");
  });

  it("las promesas de pago incumplidas siguen saliendo como antes (punto 12: ya existía)", () => {
    const t = armarPendientes({ ...base, promesas: { n: 1, montos: [{ moneda: "USD", monto: 100 }], clientes: ["ALMOTEC"] } });
    expect(t.map((x) => x.clave)).toContain("promesas");
  });
});
