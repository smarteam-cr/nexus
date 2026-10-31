import { describe, expect, it } from "vitest";
import { kickoffSinTocar, mismoDato } from "./kickoff-sin-tocar";

const base = { publicado: false, plantillaAnotada: false, conContenido: false, sembrados: [{ data: { a: 1, b: [2] }, semilla: { b: [2], a: 1 } }] };

describe("el kickoff sin tocar", () => {
  it("recién nacido: abre el selector, aunque las claves vengan en otro orden", () => {
    expect(kickoffSinTocar(base)).toBe(true);
  });

  it("⛔ publicado, aunque nadie le haya escrito: abre el documento", () => {
    expect(kickoffSinTocar({ ...base, publicado: true })).toBe(false);
  });

  it("⛔ lo escrito a mano en una sección sembrada cuenta: es lo que `hasContent` no ve", () => {
    expect(kickoffSinTocar({ ...base, sembrados: [{ data: { a: 2, b: [2] }, semilla: { a: 1, b: [2] } }] })).toBe(false);
  });

  it("con plantilla anotada o con contenido: abre el documento", () => {
    expect(kickoffSinTocar({ ...base, plantillaAnotada: true })).toBe(false);
    expect(kickoffSinTocar({ ...base, conContenido: true })).toBe(false);
  });

  it("mismoDato compara el contenido, no la forma de escribirlo", () => {
    expect(mismoDato({ x: { y: 1, z: 2 } }, { x: { z: 2, y: 1 } })).toBe(true);
    expect(mismoDato([1, 2], [2, 1])).toBe(false);
    expect(mismoDato(undefined, null)).toBe(true);
  });
});
