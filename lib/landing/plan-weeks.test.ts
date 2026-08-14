/**
 * lib/landing/plan-weeks.test.ts
 *
 * Los casos NO son inventados: salen de un dump de solo lectura de las 28 secciones
 * `cronograma` que hay en la base, 4 de ellas dentro de propuestas ya PUBLICADAS. Si el
 * parser se relaja, la barra de una fase se corre y el cliente lee una fecha que nadie
 * acordó — por eso lo ilegible tiene que seguir devolviendo null, no un número plausible.
 */
import { describe, expect, it } from "vitest";
import { parseDuracion, parseSemanas, rangoDeFase, spanDelPlan } from "./plan-weeks";

describe("las formas que están escritas en la base", () => {
  it("plural con guion común — la mayoría de los valores", () => {
    expect(parseDuracion("Semanas 1-2")).toEqual({ inicio: 1, fin: 2 });
    expect(parseDuracion("Semanas 6-10")).toEqual({ inicio: 6, fin: 10 });
    expect(parseDuracion("Semanas 12-14")).toEqual({ inicio: 12, fin: 14 });
  });

  it("EN DASH (U+2013): 9 valores reales lo usan y a ojo es idéntico al guion", () => {
    expect(parseDuracion("Semanas 1–2")).toEqual({ inicio: 1, fin: 2 });
    expect(parseDuracion("Semanas 13–16")).toEqual({ inicio: 13, fin: 16 });
    expect(parseDuracion("Semanas 10–12")).toEqual({ inicio: 10, fin: 12 });
  });

  it("singular = una sola semana", () => {
    expect(parseDuracion("Semana 8")).toEqual({ inicio: 8, fin: 8 });
    expect(parseDuracion("Semana 1")).toEqual({ inicio: 1, fin: 1 });
  });

  it("SINGULAR CON RANGO: el singular no implica una sola semana", () => {
    // "Semana 1-2" y "Semana 13–16" están escritos así en propuestas reales. Un parser que
    // asuma que el singular es una semana suelta les recortaría la barra.
    expect(parseDuracion("Semana 1-2")).toEqual({ inicio: 1, fin: 2 });
    expect(parseDuracion("Semana 13–16")).toEqual({ inicio: 13, fin: 16 });
  });

  it("tolera ruido alrededor y mayúsculas", () => {
    expect(parseDuracion("SEMANAS 3-5")).toEqual({ inicio: 3, fin: 5 });
    expect(parseDuracion("Semanas 1-2 (kickoff)")).toEqual({ inicio: 1, fin: 2 });
  });
});

describe("lo que NO se puede leer devuelve null, y no se aproxima", () => {
  it('"Mes 4" — está en una propuesta PUBLICADA y no se convierte a semanas', () => {
    // Nadie escribió que un mes son 4 semanas. Convertirlo sería inventar una fecha en un
    // documento que el cliente firma; la fase sale marcada "sin semanas" y Ventas la corrige.
    expect(parseDuracion("Mes 4")).toBeNull();
    expect(parseDuracion("Meses 2-3")).toBeNull();
  });

  it("texto sin números, vacío y nulos", () => {
    expect(parseDuracion("A convenir")).toBeNull();
    expect(parseDuracion("")).toBeNull();
    expect(parseDuracion("   ")).toBeNull();
    expect(parseDuracion(null)).toBeNull();
    expect(parseDuracion(undefined)).toBeNull();
  });

  it("un rango invertido es un typo, no un rango", () => {
    expect(parseDuracion("Semanas 8-3")).toBeNull();
  });

  it("la semana 0 no existe y el techo de cordura corta lo absurdo", () => {
    expect(parseDuracion("Semana 0")).toBeNull();
    expect(parseDuracion("Semanas 1-500")).toBeNull();
  });
});

describe("el override del vendedor es ESTRICTO", () => {
  it('acepta "6-10" y "8"', () => {
    expect(parseSemanas("6-10")).toEqual({ inicio: 6, fin: 10 });
    expect(parseSemanas("8")).toEqual({ inicio: 8, fin: 8 });
    expect(parseSemanas(" 12 – 16 ")).toEqual({ inicio: 12, fin: 16 });
  });

  it("no acepta prosa: para eso está el texto libre", () => {
    // Si el override tolerara "Semanas 6-10" volvería a ser el mismo campo ambiguo que vino
    // a corregir, y nadie sabría cuál de los dos manda.
    expect(parseSemanas("Semanas 6-10")).toBeNull();
    expect(parseSemanas("Mes 4")).toBeNull();
    expect(parseSemanas("")).toBeNull();
  });
});

describe("rangoDeFase: el override corrige al texto libre", () => {
  it("sin override, manda `duration`", () => {
    expect(rangoDeFase({ duration: "Semanas 3-5" })).toEqual({ inicio: 3, fin: 5 });
  });

  it("con override, manda el override — incluso si `duration` era legible", () => {
    expect(rangoDeFase({ duration: "Semanas 3-5", semanas: "6-9" })).toEqual({ inicio: 6, fin: 9 });
  });

  it("el override rescata lo que el texto libre no puede decir", () => {
    expect(rangoDeFase({ duration: "Mes 4" })).toBeNull();
    expect(rangoDeFase({ duration: "Mes 4", semanas: "13-16" })).toEqual({ inicio: 13, fin: 16 });
  });

  it("un override ilegible no borra la lectura del texto libre", () => {
    // Alguien escribe "a definir" en el campo de corrección: cae al texto libre, que sí sirve.
    expect(rangoDeFase({ duration: "Semanas 3-5", semanas: "a definir" })).toEqual({ inicio: 3, fin: 5 });
  });
});

describe("spanDelPlan: el eje del Gantt", () => {
  it("va del mínimo inicio al máximo fin", () => {
    expect(
      spanDelPlan([{ duration: "Semanas 1-2" }, { duration: "Semanas 3-5" }, { duration: "Semana 8" }]),
    ).toEqual({ inicio: 1, fin: 8 });
  });

  it("SOLAPES: dos fases en paralelo son legales y no se normalizan", () => {
    // Caso real: "Semanas 5-7" y "Semanas 5-9" en la misma propuesta.
    expect(spanDelPlan([{ duration: "Semanas 5-7" }, { duration: "Semanas 5-9" }])).toEqual({
      inicio: 5,
      fin: 9,
    });
  });

  it("las fases ilegibles NO arrastran el eje, pero tampoco lo rompen", () => {
    expect(spanDelPlan([{ duration: "Semanas 1-2" }, { duration: "Mes 4" }])).toEqual({
      inicio: 1,
      fin: 2,
    });
  });

  it("sin una sola fase legible no hay Gantt que dibujar", () => {
    expect(spanDelPlan([{ duration: "Mes 4" }, { duration: "A convenir" }])).toBeNull();
    expect(spanDelPlan([])).toBeNull();
  });
});
