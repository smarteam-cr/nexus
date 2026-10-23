/**
 * lib/exploraciones/propuesto-al-documento.test.ts — lo que la exploración propuso y llega al diagnóstico como supuesto.
 */
import { describe, it, expect } from "vitest";
import type { ItemPropuesto } from "./contenido";
import { itemsPropuestosAlDocumento, propuestoSinDecidir } from "./propuesto-al-documento";

const item = (id: string, clave: string, valor: unknown): ItemPropuesto =>
  ({ id, destino: { tipo: "casilla", clave }, valor, fuentes: [], corridaId: null, en: "2026-10-20T00:00:00.000Z" }) as ItemPropuesto;

describe("lo propuesto que llega al documento", () => {
  const items: ItemPropuesto[] = [
    item("a", "retos", [{ texto: "Los datos viven en tres sistemas" }]),
    item("b", "metas", { que: "Crecer en ventas", actual: "base 2025", objetivo: "5 %", para: "diciembre" }),
    item("c", "particularidades", "Tres marcas sobre un mismo ERP"),
    item("d", "noExplorado", ["Cuánto cuesta la pauta"]), // la libreta del CSE: no va
    item("e", "siguientePaso", { que: "Demo" }), // interno: no va
    item("f", "obstaculos", [{ texto: "Descartado por el CSE" }]),
    { id: "g", destino: { tipo: "nivel", dimensionId: "1.1" }, valor: "F", fuentes: [], corridaId: null, en: "" } as ItemPropuesto,
  ];

  it("solo lo que dice el cliente y lo propio de su cuenta, sin lo descartado", () => {
    const r = itemsPropuestosAlDocumento({ descartadas: ["f"] }, items).map((i) => i.id);
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("en líneas, con el nombre de la tarjeta y la meta en cifras", () => {
    const lineas = propuestoSinDecidir({ descartadas: ["f"] }, items);
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toMatch(/: Los datos viven en tres sistemas$/);
    expect(lineas[1]).toContain("Crecer en ventas · hoy: base 2025 · meta: 5 % · para: diciembre");
    expect(lineas[2]).toBe("Particularidades: Tres marcas sobre un mismo ERP");
  });
});
