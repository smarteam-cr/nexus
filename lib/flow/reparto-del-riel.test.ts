import { describe, expect, it } from "vitest";
import { estadoEnElRiel, repartirElRiel } from "./reparto-del-riel";

const fila = (slug: string, o: { estado?: string; oculta?: boolean; activa?: boolean; esCopia?: boolean } = {}) => ({ slug, estado: "generada", activa: false, ...o });

describe("el reparto del riel", () => {
  it("⛔ ocultar la pieza abierta la saca de la vista: era lo que hacía parecer que ocultar no funcionaba", () => {
    const r = repartirElRiel([fila("kickoff", { oculta: true, activa: true }), fila("planning")]);
    expect(r.existentes.map((f) => f.slug)).toEqual(["planning"]);
    expect(r.ocultas.map((f) => f.slug)).toEqual(["kickoff"]);
    expect(r.plegadas).toBe(1);
  });

  it("⛔ el kickoff no pide «Activar»: las demás piezas sí", () => {
    expect(estadoEnElRiel({ slug: "kickoff", state: "por_activar" })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "delivery", state: "por_activar" })).toBe("por_activar");
    expect(estadoEnElRiel({ slug: "kickoff", state: "generada" })).toBe("generada");
  });

  it("⛔ la oculta que está abierta sigue a la vista con «Ver más» cerrado; las demás ocultas, no", () => {
    const filas = [fila("kickoff", { oculta: true, activa: true }), fila("planning", { oculta: true })];
    expect(repartirElRiel(filas).ocultasALaVista.map((f) => f.slug)).toEqual(["kickoff"]);
    expect(repartirElRiel(filas, true).ocultasALaVista.map((f) => f.slug)).toEqual(["kickoff", "planning"]);
  });

  it("lo que no existe queda por activar y cuenta en «Ver N piezas más»", () => {
    const r = repartirElRiel([fila("delivery", { estado: "por_activar" }), fila("planning", { oculta: true })]);
    expect(r.porActivar.map((f) => f.slug)).toEqual(["delivery"]);
    expect(r.plegadas).toBe(2);
  });

  it("una copia no se oculta: se archiva desde su barra", () => {
    const r = repartirElRiel([fila("copia:a", { esCopia: true }), fila("planning")]);
    expect(r.ocultables.map((f) => f.slug)).toEqual(["planning"]);
  });
});
