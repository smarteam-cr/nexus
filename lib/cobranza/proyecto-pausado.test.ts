/**
 * lib/cobranza/proyecto-pausado.test.ts — el aviso de «proyecto pausado» antes de facturar (2026-10-06).
 */
import { describe, expect, it } from "vitest";
import { AVISO_PROYECTO_PAUSADO, estaPausado, proyectoPausadoDe, type ProyectoParaPausa } from "./proyecto-pausado";
import { armarPendientes, type DatosDePendientes } from "@/lib/finanzas/pendientes";

const proyecto = (p: Partial<ProyectoParaPausa> = {}): ProyectoParaPausa => ({
  id: "p1",
  name: "BLUESAT - SERVICE HUB",
  status: "active",
  hubspotStatus: "on_track",
  healthStatusOverride: null,
  hubspotOwnerName: "Alexander Vanegas",
  ...p,
});

describe("qué es un proyecto pausado", () => {
  it("cualquiera de las tres marcas: HubSpot en pausa, la salud fijada a mano o el estado interno", () => {
    expect(estaPausado(proyecto({ hubspotStatus: "on_hold" }))).toBe(true);
    expect(estaPausado(proyecto({ healthStatusOverride: "PAUSADO" }))).toBe(true);
    expect(estaPausado(proyecto({ status: "paused" }))).toBe(true);
    expect(estaPausado(proyecto())).toBe(false);
    // Atrasado o en riesgo no es pausado.
    expect(estaPausado(proyecto({ hubspotStatus: "delayed" }))).toBe(false);
  });

  it("el texto es el que pidió Elías, tal cual", () => {
    expect(AVISO_PROYECTO_PAUSADO).toBe("El proyecto está pausado. Consulta con Customer Success y el líder antes de facturar.");
  });
});

describe("de qué proyecto es la cuota", () => {
  const pausadoDelCliente = proyecto({ id: "p2", name: "Intercert - MHP", hubspotStatus: "on_hold", hubspotOwnerName: null });

  it("el proyecto del servicio manda: pausado avisa, con el proyecto y el CSE", () => {
    expect(proyectoPausadoDe(proyecto({ hubspotStatus: "on_hold" }), [])).toEqual({
      projectId: "p1",
      nombre: "BLUESAT - SERVICE HUB",
      cse: "Alexander Vanegas",
    });
  });

  it("si el proyecto del servicio sigue, no avisa aunque el cliente tenga otro pausado", () => {
    expect(proyectoPausadoDe(proyecto(), [pausadoDelCliente])).toBeNull();
  });

  it("un servicio sin proyecto toma el pausado del cliente; sin ninguno, no avisa", () => {
    expect(proyectoPausadoDe(null, [pausadoDelCliente])?.nombre).toBe("Intercert - MHP");
    expect(proyectoPausadoDe(null, [])).toBeNull();
  });
});

describe("la tarea «Facturar» de Pendientes y Para ti dice cuántas son de un proyecto pausado", () => {
  const base: DatosDePendientes = {
    porFacturar: { n: 3, montos: [{ moneda: "USD", monto: 4500 }] },
    promesas: { n: 0, montos: [], clientes: [] },
    pagosDetectados: { n: 0, montos: [] },
    comisionesVencidas: 0,
    porEmparejar: { odoo: 0, mercury: 0 },
    diferencias: 0,
    decisiones: 0,
    gastosDelMes: null,
    devueltos: [],
  };
  const facturar = (d: DatosDePendientes) => armarPendientes(d).find((t) => t.clave === "facturar")!;

  it("sin pausados, el texto de siempre", () => {
    expect(facturar(base).detalle).toBe("Emite la factura en Odoo o en Mercury y márcala en Cobranza con su número.");
  });

  it("con pausados, el aviso y los clientes", () => {
    const d = { ...base, porFacturar: { ...base.porFacturar, pausados: { n: 2, clientes: ["BLUESAT", "Intercert"] } } };
    expect(facturar(d).detalle).toContain("2 son de un proyecto pausado (BLUESAT, Intercert)");
    expect(facturar(d).detalle).toContain("consulta con Customer Success y el líder antes de facturarlas");
  });
});
