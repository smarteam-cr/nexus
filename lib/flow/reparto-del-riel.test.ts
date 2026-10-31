import { describe, expect, it } from "vitest";
import { estadoEnElRiel, repartirElRiel } from "./reparto-del-riel";

const fila = (slug: string, o: { estado?: string; oculta?: boolean; esCopia?: boolean } = {}) => ({ slug, estado: "generada", ...o });

describe("el reparto de la barra lateral", () => {
  it("⛔ desanclar la pieza abierta la saca de la vista, y no se queda abajo: «tiene que irse de verdad»", () => {
    const r = repartirElRiel([fila("exploration", { oculta: true }), fila("planning")]);
    expect(r.existentes.map((f) => f.slug)).toEqual(["planning"]);
    expect(r.ocultasALaVista).toEqual([]);
    expect(r.plegadas).toBe(1);
  });

  it("lo desanclado se ve al abrir «Ver N sin anclar»", () => {
    const filas = [fila("kickoff", { oculta: true }), fila("planning", { oculta: true })];
    expect(repartirElRiel(filas, true).ocultasALaVista.map((f) => f.slug)).toEqual(["kickoff", "planning"]);
  });

  it("⛔ por defecto solo salen el cronograma y el kickoff: lo vacío o sin documento no sale ni pide «Activar»", () => {
    expect(estadoEnElRiel({ slug: "kickoff", state: "por_activar" })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "timeline", state: "por_activar" })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "delivery", state: "por_activar" })).toBe("sin_crear");
    expect(estadoEnElRiel({ slug: "diagnosis", state: "vacia" })).toBe("sin_crear");
    expect(estadoEnElRiel({ slug: "kickoff", state: "generada" })).toBe("generada");
    expect(repartirElRiel([fila("delivery", { estado: "sin_crear" })]).plegadas).toBe(0);
  });

  it("lo que alguien creó se queda aunque esté vacío: la copia, el de nombre propio y el canvas suelto", () => {
    expect(estadoEnElRiel({ slug: "copia:a", state: "vacia", esCopia: true })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "diagnosis", state: "vacia", conNombre: true })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "custom:a", state: "vacia" })).toBe("pendiente");
  });

  it("la vacía que se está mirando se ve; sin mirarla no sale, tampoco en un servicio recurrente (Elías, 31 oct)", () => {
    expect(estadoEnElRiel({ slug: "diagnosis", state: "vacia" }, { activa: true })).toBe("pendiente");
    expect(estadoEnElRiel({ slug: "diagnosis", state: "vacia" })).toBe("sin_crear");
    expect(estadoEnElRiel({ slug: "diagnosis", state: "generada" })).toBe("generada");
  });

  it("una copia no se desancla: se archiva desde su barra", () => {
    const r = repartirElRiel([fila("copia:a", { esCopia: true }), fila("planning")]);
    expect(r.ocultables.map((f) => f.slug)).toEqual(["planning"]);
  });
});
