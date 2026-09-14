import { describe, expect, it } from "vitest";
import { ANCHO_DEL_ARBOL, acotarAncho, anchoDesdeCookie } from "./ancho-del-arbol";

describe("ancho del panel de páginas", () => {
  it("sin cookie, o con una que no se entiende, abre con el ancho de siempre", () => {
    for (const valor of [undefined, "", "   ", "abc", "-300", "300px", "NaN", "Infinity"]) {
      expect(anchoDesdeCookie(valor)).toBe(ANCHO_DEL_ARBOL.porDefecto);
    }
  });

  it("respeta el ancho guardado, redondeado", () => {
    expect(anchoDesdeCookie("320")).toBe(320);
    expect(anchoDesdeCookie("300.6")).toBe(301);
  });

  it("un valor fuera de rango no deja el panel invisible ni tapando la página", () => {
    expect(anchoDesdeCookie("12")).toBe(ANCHO_DEL_ARBOL.minimo);
    expect(anchoDesdeCookie("99999")).toBe(ANCHO_DEL_ARBOL.maximo);
    expect(acotarAncho(-50)).toBe(ANCHO_DEL_ARBOL.minimo);
    expect(acotarAncho(Number.NaN)).toBe(ANCHO_DEL_ARBOL.porDefecto);
  });

  it("el de siempre está dentro del rango", () => {
    expect(acotarAncho(ANCHO_DEL_ARBOL.porDefecto)).toBe(ANCHO_DEL_ARBOL.porDefecto);
  });
});
