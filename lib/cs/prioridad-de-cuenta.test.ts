import { describe, expect, it } from "vitest";
import { motivoEnPalabras, prioridadDesdeEventos, prioridadVisible, rangoDePrioridad, type EventoDePrioridad } from "./prioridad-de-cuenta";
import { prioridadDeCuentaSchema } from "./schema";

const evento = (o: Partial<EventoDePrioridad>): EventoDePrioridad => ({
  id: "e1",
  tipo: "marcar",
  motivo: "smartloop",
  nota: null,
  porEmail: "avanegas@smarteamcr.com",
  porNombre: "Alexander Vanegas",
  en: "2026-10-29T15:00:00Z",
  ...o,
});

describe("la marca de prioridad", () => {
  it("⭐ vale el último evento, vengan en el orden que vengan", () => {
    const marcar = evento({ id: "a", en: "2026-10-01T10:00:00Z", motivo: "ticket-grande" });
    const quitar = evento({ id: "b", tipo: "quitar", motivo: null, en: "2026-10-10T10:00:00Z" });
    const otraVez = evento({ id: "c", en: "2026-10-20T10:00:00Z", motivo: "interlocutores-dificiles" });
    expect(prioridadDesdeEventos([otraVez, marcar, quitar])?.motivo).toBe("interlocutores-dificiles");
    expect(prioridadDesdeEventos([quitar, marcar])).toBeNull();
    expect(prioridadDesdeEventos([])).toBeNull();
  });

  it("un motivo que no existe no marca (filas raras de la base)", () => {
    expect(prioridadDesdeEventos([evento({ motivo: "vip" })])).toBeNull();
  });

  it("el motivo en palabras: con «otro», la línea es el motivo", () => {
    expect(motivoEnPalabras({ motivo: "smartloop", nota: null })).toBe("SmartLoop");
    expect(motivoEnPalabras({ motivo: "ticket-grande", nota: "renueva 3 hubs" })).toBe("Ticket grande · renueva 3 hubs");
    expect(motivoEnPalabras({ motivo: "otro", nota: "el sponsor se va" })).toBe("el sponsor se va");
  });

  it("lo visible dice quién la marcó, y ordena primero", () => {
    const v = prioridadVisible(prioridadDesdeEventos([evento({})]));
    expect(v).toEqual({ motivo: "smartloop", nota: null, enPalabras: "SmartLoop", quien: "Alexander Vanegas" });
    expect(rangoDePrioridad({ prioritaria: v })).toBeLessThan(rangoDePrioridad({ prioritaria: null }));
  });

  it("la frontera: «otro» pide escribir cuál; un motivo inventado no pasa", () => {
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "smartloop" }).success).toBe(true);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "otro" }).success).toBe(false);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "otro", nota: "el sponsor se va" }).success).toBe(true);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "marcar", motivo: "vip" }).success).toBe(false);
    expect(prioridadDeCuentaSchema.safeParse({ accion: "quitar" }).success).toBe(true);
  });
});
