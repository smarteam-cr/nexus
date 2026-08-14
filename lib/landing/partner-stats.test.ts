/**
 * lib/landing/partner-stats.test.ts
 *
 * Esto parte un texto que el cliente LEE en la propuesta, así que la regla que se congela acá
 * es la conservadora: cada fragmento sale completo y el número grande es un adorno opcional.
 * Nada se recorta, nada se reordena y nada se inventa cuando el texto no tiene la forma
 * esperada — el default de la def ("+200 proyectos, +8 países LATAM") es UN caso, no EL caso.
 */
import { describe, expect, it } from "vitest";
import { statsDeExperiencia } from "./partner-stats";

describe("el valor por defecto de la def, que es el que trae casi toda propuesta", () => {
  it('"+200 proyectos, +8 países LATAM" da dos fichas con su número aparte', () => {
    expect(statsDeExperiencia("+200 proyectos, +8 países LATAM")).toEqual([
      { valor: "+200", etiqueta: "proyectos" },
      { valor: "+8", etiqueta: "países LATAM" },
    ]);
  });
});

describe("formas de número que aparecen escribiendo a mano", () => {
  it("separador de miles, porcentaje y sin signo", () => {
    expect(statsDeExperiencia("+3.000 usuarios capacitados")).toEqual([
      { valor: "+3.000", etiqueta: "usuarios capacitados" },
    ]);
    expect(statsDeExperiencia("95% de retención")).toEqual([{ valor: "95%", etiqueta: "de retención" }]);
    expect(statsDeExperiencia("12 años en el mercado")).toEqual([{ valor: "12", etiqueta: "años en el mercado" }]);
  });

  it("acepta punto medio y barra como separadores, no solo la coma", () => {
    expect(statsDeExperiencia("+200 proyectos · +8 países")).toHaveLength(2);
    expect(statsDeExperiencia("+200 proyectos | +8 países")).toHaveLength(2);
  });
});

describe("lo que no tiene forma de número NO se fuerza", () => {
  it("un fragmento sin número va entero como etiqueta, sin número grande", () => {
    expect(statsDeExperiencia("Equipo senior certificado")).toEqual([
      { valor: "", etiqueta: "Equipo senior certificado" },
    ]);
  });

  it("un número suelto no es una ficha: no dice de qué", () => {
    expect(statsDeExperiencia("+200")).toEqual([{ valor: "", etiqueta: "+200" }]);
  });

  it("un número en medio de la frase no se saca de contexto", () => {
    // "Más de 200 proyectos" NO se convierte en «200 · proyectos»: reordenar lo que alguien
    // escribió es inventarle una frase que no dijo.
    expect(statsDeExperiencia("Más de 200 proyectos")).toEqual([
      { valor: "", etiqueta: "Más de 200 proyectos" },
    ]);
  });

  it("vacío, nulo y solo separadores no producen fichas fantasma", () => {
    expect(statsDeExperiencia("")).toEqual([]);
    expect(statsDeExperiencia(null)).toEqual([]);
    expect(statsDeExperiencia(undefined)).toEqual([]);
    expect(statsDeExperiencia("  , ,  ")).toEqual([]);
  });
});

describe("la banda no se desborda", () => {
  it("corta en cuatro fichas: con más, cada una se vuelve ilegible", () => {
    const seis = "+1 a, +2 b, +3 c, +4 d, +5 e, +6 f";
    expect(statsDeExperiencia(seis)).toHaveLength(4);
    expect(statsDeExperiencia(seis).map((s) => s.valor)).toEqual(["+1", "+2", "+3", "+4"]);
  });
});
