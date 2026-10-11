import { describe, expect, it } from "vitest";
import {
  accionesDeSolicitud,
  conEntrada,
  estadoDeSolicitud,
  laConfirma,
  leerAlta,
  leerCambio,
  leerHistorial,
} from "./solicitudes-fuera-de-alcance";

describe("las solicitudes fuera de alcance", () => {
  it("un estado desconocido se lee como «por revisar»", () => {
    expect(estadoDeSolicitud("RARO")).toBe("PEDIDO");
    expect(estadoDeSolicitud("COTIZADO")).toBe("COTIZADO");
  });

  it("avisa una sola vez: al confirmarla, no al seguir avanzando", () => {
    expect(laConfirma("PEDIDO", "CONFIRMADO")).toBe(true);
    expect(laConfirma("PEDIDO", "COTIZADO")).toBe(true);
    expect(laConfirma("DESCARTADO", "CONFIRMADO")).toBe(true);
    expect(laConfirma("CONFIRMADO", "COTIZADO")).toBe(false);
    expect(laConfirma("PEDIDO", "DESCARTADO")).toBe(false);
    expect(laConfirma("PEDIDO", "INCLUIDO")).toBe(false);
  });

  it("por revisar se confirma o se descarta; lo cerrado se puede volver a revisar", () => {
    expect(accionesDeSolicitud("PEDIDO").map((a) => a.estado)).toEqual(["CONFIRMADO", "INCLUIDO", "DESCARTADO"]);
    expect(accionesDeSolicitud("CONFIRMADO").map((a) => a.estado)).toEqual(["COTIZADO", "APROBADO", "RECHAZADO"]);
    expect(accionesDeSolicitud("APROBADO").map((a) => a.estado)).toEqual(["PEDIDO"]);
  });

  it("el historial descarta lo que no reconoce y guarda las últimas 40", () => {
    expect(leerHistorial([{ estado: "X", por: "a", en: "b" }, { estado: "CONFIRMADO", por: "cse@x", en: "2026-10-07" }])).toEqual([
      { estado: "CONFIRMADO", por: "cse@x", en: "2026-10-07" },
    ]);
    const largo = Array.from({ length: 45 }, (_, i) => ({ estado: "PEDIDO", por: "a", en: String(i) }));
    const h = conEntrada(largo, { estado: "CONFIRMADO", por: "b", en: "z" });
    expect(h).toHaveLength(40);
    expect(h.at(-1)?.estado).toBe("CONFIRMADO");
  });

  it("un cambio lee solo lo que reconoce; un estado inválido o un pedido vacío no entra", () => {
    expect(leerCambio({ estado: "CONFIRMADO", nota: " la cotizó Andrés ", otra: 1 })).toEqual({ estado: "CONFIRMADO", nota: "la cotizó Andrés" });
    expect(leerCambio({ estado: "NADA" })).toBeNull();
    expect(leerCambio({ pedido: "  " })).toBeNull();
    expect(leerCambio({})).toBeNull();
    expect(leerCambio({ projectId: null })).toEqual({ projectId: null });
  });

  it("un alta a mano exige lo que pidió", () => {
    expect(leerAlta({ pedido: "" })).toBeNull();
    expect(leerAlta({ pedido: "Integrar con SAP", monto: "US$3.000" })).toMatchObject({ pedido: "Integrar con SAP", monto: "US$3.000", projectId: null });
  });
});
