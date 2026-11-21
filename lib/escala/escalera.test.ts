/**
 * lib/escala/escalera.test.ts — LA ESCALERA de los cinco niveles (lib/escala/escalera.ts): dónde está hoy, a dónde lo
 * llevamos (Funcional casi siempre; desde Funcional, el siguiente; la que elige quien presenta, si está por encima) y que el
 * dibujo marque los dos y el tramo entre ellos.
 */
import { describe, expect, it } from "vitest";
import { ALTO_DE_LA_ESCALERA, ANCHO_DE_LA_ESCALERA, dibujoDeLaEscalera, lecturaDeLaEscalera, metaDeLaEscalera, metaPorDefecto, metasPosibles } from "./escalera";

const NIVELES = [
  { letra: "D" as const, nombre: "Deficiente" },
  { letra: "I" as const, nombre: "Inicial" },
  { letra: "F" as const, nombre: "Funcional" },
  { letra: "E" as const, nombre: "Eficiente" },
  { letra: "O" as const, nombre: "Óptimo" },
];

describe("a dónde lo llevamos", () => {
  it("Funcional desde abajo; desde Funcional o más arriba, el nivel siguiente; en Óptimo, ninguno", () => {
    expect(metaPorDefecto("D")).toBe("F");
    expect(metaPorDefecto("I")).toBe("F");
    expect(metaPorDefecto("F")).toBe("E");
    expect(metaPorDefecto("E")).toBe("O");
    expect(metaPorDefecto("O")).toBeNull();
    expect(metaPorDefecto(null)).toBeNull();
  });

  it("la que elige quien presenta vale solo si está por encima de hoy; si no, la de siempre", () => {
    expect(metaDeLaEscalera("D", "E")).toBe("E");
    expect(metaDeLaEscalera("I", "i")).toBe("F");
    // Los niveles subieron y la elegida quedó igual o abajo: vuelve la de siempre.
    expect(metaDeLaEscalera("F", "F")).toBe("E");
    expect(metaDeLaEscalera("E", "F")).toBe("O");
    expect(metaDeLaEscalera("I", "Z")).toBe("F");
    expect(metaDeLaEscalera("I", "")).toBe("F");
    expect(metaDeLaEscalera(null, "F")).toBeNull();
  });

  it("solo se puede elegir un nivel de arriba", () => {
    expect(metasPosibles("I")).toEqual(["F", "E", "O"]);
    expect(metasPosibles("O")).toEqual([]);
    expect(metasPosibles(null)).toEqual([]);
  });
});

describe("el dibujo", () => {
  it("cinco niveles numerados de izquierda a derecha y de abajo arriba, dentro del lienzo", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.marcas.map((m) => `${m.numero} ${m.nombre}`)).toEqual(["1 Deficiente", "2 Inicial", "3 Funcional", "4 Eficiente", "5 Óptimo"]);
    for (let i = 1; i < d.marcas.length; i++) {
      expect(d.marcas[i].x).toBeGreaterThan(d.marcas[i - 1].x);
      expect(d.marcas[i].y).toBeLessThan(d.marcas[i - 1].y);
    }
    for (const m of d.marcas) {
      expect(m.x).toBeGreaterThan(0);
      expect(m.x).toBeLessThan(ANCHO_DE_LA_ESCALERA);
      // La etiqueta «Hoy»/«Meta» va 76 px arriba del centro: no se puede salir por arriba.
      expect(m.y - 76).toBeGreaterThan(0);
      expect(m.y).toBeLessThan(ALTO_DE_LA_ESCALERA);
    }
  });

  it("marca hoy y la meta, con el tramo entre los dos", () => {
    const d = dibujoDeLaEscalera(NIVELES, "I", "F");
    expect(d.marcas.filter((m) => m.es === "hoy").map((m) => m.letra)).toEqual(["I"]);
    expect(d.marcas.filter((m) => m.es === "meta").map((m) => m.letra)).toEqual(["F"]);
    expect(d.tramo).toMatch(/^M/);
    expect(d.areaDelTramo).toMatch(/Z$/);
    // El tramo arranca en hoy y termina en la meta.
    const [x0] = d.tramo!.slice(1).split(" ").map(Number);
    expect(x0).toBe(d.marcas[1].x);
  });

  it("sin meta (Óptimo) o sin nivel, no hay tramo; sin nivel, nadie es «hoy»", () => {
    expect(dibujoDeLaEscalera(NIVELES, "O", null).tramo).toBeNull();
    const sin = dibujoDeLaEscalera(NIVELES, null, null);
    expect(sin.tramo).toBeNull();
    expect(sin.marcas.some((m) => m.es)).toBe(false);
  });

  it("lo que lee un lector de pantalla", () => {
    expect(lecturaDeLaEscalera("Ventas", { nombre: "Inicial" }, { nombre: "Funcional" })).toBe("Los cinco niveles de la escala: Ventas está hoy en Inicial y la meta es llevarla a Funcional.");
    expect(lecturaDeLaEscalera("Ventas", { nombre: "Óptimo" }, null)).toContain("el nivel más alto");
    expect(lecturaDeLaEscalera("Ventas", null, null)).toContain("en medición");
  });
});
