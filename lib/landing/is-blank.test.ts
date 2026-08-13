/**
 * lib/landing/is-blank.test.ts
 *
 * `isBlank` decide si una sección se OMITE en la vista del cliente y en el PDF, y no tenía
 * un solo test. Los casos de acá no son inventados: son los tres que estaban saliendo mal.
 *
 * La trampa: el chequeo no corre sobre lo guardado sino sobre el merge con el `empty` de la
 * definición, y cualquier valor que no sea string/array/objeto cuenta como contenido. Un
 * solo campo de PRESENTACIÓN con default volvía la sección permanentemente no-vacía.
 */
import { describe, expect, it } from "vitest";
import { isBlank, NO_CONTENIDO } from "./is-blank";

describe("lo vacío es vacío", () => {
  it("null, undefined y strings en blanco", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
  });

  it("arrays vacíos, y arrays de ítems vacíos", () => {
    expect(isBlank([])).toBe(true);
    expect(isBlank([{ title: "", detail: "" }])).toBe(true);
    expect(isBlank({ items: [{ title: "", detail: "" }] })).toBe(true);
  });

  it("un objeto con todo en blanco", () => {
    expect(isBlank({ intro: "", retos: [], porQueBullets: [], objetivo: "" })).toBe(true);
  });
});

describe("lo que SÍ tiene contenido no se omite", () => {
  it("un solo texto alcanza", () => {
    expect(isBlank({ headline: "algo", subhead: "" })).toBe(false);
  });

  it("un número que ES contenido (una métrica, un precio) cuenta", () => {
    expect(isBlank({ metrics: [{ value: 42, label: "" }] })).toBe(false);
  });
});

describe("los campos de PRESENTACIÓN no cuentan como contenido", () => {
  // Los tres casos reales que hacían salir secciones huecas al papel.

  it("el ancho del bloque recurrente (layout) no salva una sección vacía", () => {
    // La sección de inversión de la propuesta web traía `anchoRecurrente: "normal"` en su
    // `empty`, así que NUNCA se omitía: imprimía título, chip y una tabla sin total.
    expect(
      isBlank({ moneda: "", lineas: [], extras: [], recurrentes: [], nota: "", anchoRecurrente: "normal" }),
    ).toBe(true);
  });

  it("el tamaño del logo tampoco: es un número, y bastaba para resucitar la portada", () => {
    // Ajustar el tamaño del logo hacía reaparecer una portada sin escribir, con el
    // titular en blanco.
    expect(isBlank({ headline: "", subhead: "", tags: [], brands: [], logoScale: 120 })).toBe(true);
  });

  it("ni el idioma del documento", () => {
    expect(isBlank({ headline: "", subhead: "", __lang: "es" })).toBe(true);
  });

  it("pero con contenido de verdad, la presencia del campo de presentación no cambia nada", () => {
    expect(isBlank({ headline: "Hola", logoScale: 120 })).toBe(false);
  });
});

describe("el vocabulario de lo que no es contenido", () => {
  it("está declarado y es corto — agregar una clave es una decisión, no un atajo", () => {
    expect([...NO_CONTENIDO].sort()).toEqual([
      "__lang", "altoEmbed", "anchoRecurrente", "buttonTarget", "logoScale",
    ]);
  });

  it("ningún `empty` de las definiciones trae un default de TEXTO que impida omitir", () => {
    // El CTA del business case traía `buttonLabel: "Agendar siguiente paso"`, así que la
    // sección nunca daba en blanco y el PDF sacaba un botón sin destino. Un default de
    // texto en un `empty` es contenido a los ojos de `isBlank` — y por eso no puede haberlo
    // en una sección que se espera poder vaciar.
    const noVacio = { headline: "", subhead: "", buttonLabel: "Agendar siguiente paso" };
    expect(isBlank(noVacio)).toBe(false); // el comportamiento que había que evitar
    expect(isBlank({ headline: "", subhead: "", buttonLabel: "" })).toBe(true); // el de ahora
  });
});
