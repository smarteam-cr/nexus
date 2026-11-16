/**
 * lib/external/siguiente-area.test.ts — `siguienteArea` (components/external/test/ArribaDeLaEscala.tsx): el área que abre
 * «Ver diagnóstico de …» al final de la página de un área de la escala (15 nov). Va en el orden de las pestañas, da la
 * vuelta, y nunca es el Resumen ni un equipo sin sesiones (afuera no se abre).
 */
import { describe, expect, it } from "vitest";
import { PESTANA_DEL_RESUMEN, siguienteArea, type PestanaDeLaEscala } from "@/components/external/test/ArribaDeLaEscala";

const p = (id: string, porExplorar = false): PestanaDeLaEscala => ({ id, nombre: `Área ${id}`, href: `/e?area=${id}`, ...(porExplorar ? { porExplorar } : {}) });
const RESUMEN = { id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: "/e" };

describe("siguienteArea", () => {
  it("la que sigue en el orden de las pestañas, sin pasar por el Resumen", () => {
    expect(siguienteArea([RESUMEN, p("1"), p("2"), p("3")], "1")?.id).toBe("2");
    expect(siguienteArea([RESUMEN, p("1"), p("2"), p("3")], "2")?.id).toBe("3");
  });

  it("da la vuelta: después de la última, la primera (no el Resumen)", () => {
    expect(siguienteArea([RESUMEN, p("1"), p("2"), p("3")], "3")?.id).toBe("1");
  });

  it("salta los equipos sin sesiones, que van al final de las pestañas", () => {
    // Las pestañas ponen al final al equipo sin sesiones: después de 1 viene 3, y después de 3, la vuelta a 1.
    const pestanas = [RESUMEN, p("1"), p("2", true), p("3")];
    expect(siguienteArea(pestanas, "1")?.id).toBe("3");
    expect(siguienteArea(pestanas, "3")?.id).toBe("1");
  });

  it("null si no hay otra área que se abra", () => {
    expect(siguienteArea([RESUMEN, p("1")], "1")).toBeNull();
    expect(siguienteArea([RESUMEN, p("1"), p("2", true)], "1")).toBeNull();
    expect(siguienteArea([], "1")).toBeNull();
  });
});
