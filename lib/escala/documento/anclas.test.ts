/**
 * lib/escala/documento/anclas.test.ts — a qué apunta cada identificador, y qué texto se congela.
 */
import { describe, expect, it } from "vitest";
import {
  dimensionDeAncla,
  estaEnLaCelda,
  letraDeAncla,
  resolverAncla,
  textosPorAncla,
  tipoDeAncla,
} from "./anclas";
import { MINI_ESCALA } from "./mini-escala.fixture";
import { parsearEscala } from "./parsear";

const e = parsearEscala(MINI_ESCALA);

describe("resolverAncla", () => {
  it("una dimensión: nombre, pregunta y costo", () => {
    const a = resolverAncla(e, "1.2")!;
    expect(a.tipo).toBe("dimension");
    expect(a.ruta).toBe("Ventas · Tracción del Deal");
    expect(a.texto).toBe(
      "Tracción del Deal\n¿Qué pasa cuando un negocio se enfría?\nCosto de quedarse: Los negocios mueren en silencio.",
    );
  });

  it("un nivel: descripción y, desde Funcional, el resultado", () => {
    expect(resolverAncla(e, "1.1.D")!.texto).toBe("Sin proceso.");
    const f = resolverAncla(e, "1.1.F")!;
    expect(f.tipo).toBe("nivel");
    expect(f.ruta).toBe("Ventas · Procesos y Rutinas · Funcional");
    expect(f.texto).toBe("Maquinaria base.\nResultado: Nada depende de una persona.");
  });

  it("un criterio: su texto, sin la etiqueta", () => {
    const c = resolverAncla(e, "1.1.F2")!;
    expect(c.tipo).toBe("criterio");
    expect(c.texto).toBe("La definición se aplica igual.");
    expect(c.criterio?.habito).toBe(true);
  });

  it("lo que no existe o no tiene la forma, null", () => {
    for (const id of ["1.9", "1.1.F9", "4.1", "1.1.X", "1", "", "1.1.F1 ", "1.1.f1"]) {
      if (id === "1.1.F1 ") continue; // se recorta: es válido
      expect(resolverAncla(e, id), id).toBeNull();
    }
    expect(resolverAncla(e, "1.1.F1 ")?.id).toBe("1.1.F1");
  });
});

describe("las piezas de un ancla", () => {
  it("tipo, dimensión y letra", () => {
    expect(tipoDeAncla("1.7")).toBe("dimension");
    expect(tipoDeAncla("1.7.F")).toBe("nivel");
    expect(tipoDeAncla("1.7.F12")).toBe("criterio");
    expect(tipoDeAncla("1.7.Z1")).toBeNull();
    expect(dimensionDeAncla("3.8.O2")).toBe("3.8");
    expect(letraDeAncla("3.8.O2")).toBe("O");
    expect(letraDeAncla("3.8")).toBeNull();
  });

  it("qué cae en una celda (dimensión × nivel)", () => {
    expect(estaEnLaCelda("1.7.F", "1.7", "F")).toBe(true);
    expect(estaEnLaCelda("1.7.F3", "1.7", "F")).toBe(true);
    expect(estaEnLaCelda("1.7", "1.7", "F")).toBe(false);
    expect(estaEnLaCelda("1.7.E1", "1.7", "F")).toBe(false);
    expect(estaEnLaCelda("1.1.F1", "1.1", "F")).toBe(true);
    expect(estaEnLaCelda("1.10.F1", "1.1", "F")).toBe(false);
  });

  it("textosPorAncla cubre dimensiones, niveles y criterios", () => {
    const t = textosPorAncla(e);
    expect(t.get("1.1")).toContain("Procesos y Rutinas");
    expect(t.get("1.2.O")).toBe("El sistema detecta fricción.\nResultado: Ayuda justo a tiempo.");
    expect(t.get("1.2.O1")).toBe("La distribución se autoajusta.");
    // 2 dimensiones + 10 niveles + 15 criterios (9 en 1.1, 6 en 1.2)
    expect(t.size).toBe(2 + 10 + 15);
  });
});
