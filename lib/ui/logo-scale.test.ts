/**
 * lib/ui/logo-scale.test.ts
 *
 * Lo que se congela acá es el modo de falla catastrófico: la variable CSS va SIN UNIDAD.
 * `height: calc(30px * var(--logo-scale, 1))` con un `"120%"` adentro se invalida entero,
 * `height` cae a `auto` y el logo se pinta a su resolución natural en una propuesta que el
 * cliente está mirando. Ninguna otra capa lo atrapa: es CSS válido sintácticamente, el
 * navegador lo descarta en silencio y tsc no ve strings.
 */
import { describe, it, expect } from "vitest";
import {
  clampLogoScale,
  logoHeightCalc,
  logoScaleStyle,
  resolveLogoScale,
  LOGO_SCALE_DEFAULT,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  LOGO_SCALE_VAR,
} from "./logo-scale";

describe("la variable CSS nunca lleva unidad", () => {
  it("es un número pelado, no un porcentaje", () => {
    expect(logoScaleStyle(150)).toEqual({ [LOGO_SCALE_VAR]: "1.5" });
    expect(logoScaleStyle(50)).toEqual({ [LOGO_SCALE_VAR]: "0.5" });
  });

  it("ningún valor del rango produce un string con unidad o notación científica", () => {
    for (let pct = LOGO_SCALE_MIN; pct <= LOGO_SCALE_MAX; pct += 5) {
      const style = logoScaleStyle(pct) as Record<string, string> | undefined;
      if (!style) continue; // el 100% no emite nada a propósito
      const v = style[LOGO_SCALE_VAR];
      expect(v, `${pct}% produjo "${v}"`).toMatch(/^\d+(\.\d+)?$/);
    }
  });

  it("el 100% no ensucia el DOM: el fallback del CSS ya lo da", () => {
    expect(logoScaleStyle(LOGO_SCALE_DEFAULT)).toBeUndefined();
  });

  it("el calc de las superficies con alto propio queda armable", () => {
    expect(logoHeightCalc(40)).toBe("calc(40px * var(--logo-scale, 1))");
  });
});

describe("clamp: la DB y los Json de canvas traen cualquier cosa", () => {
  it("recorta fuera de rango en vez de rechazar", () => {
    expect(clampLogoScale(10)).toBe(LOGO_SCALE_MIN);
    expect(clampLogoScale(5000)).toBe(LOGO_SCALE_MAX);
  });

  it("null/undefined/basura → null, y null NO es 0", () => {
    // 0 sería un logo invisible; null significa "no hay valor", que resuelve a 100.
    expect(clampLogoScale(null)).toBeNull();
    expect(clampLogoScale(undefined)).toBeNull();
    expect(clampLogoScale("ancho")).toBeNull();
    expect(clampLogoScale({})).toBeNull();
    expect(clampLogoScale(NaN)).toBeNull();
    expect(clampLogoScale(0)).toBe(LOGO_SCALE_MIN); // un 0 explícito se sube al piso
  });

  it("un string numérico (input de formulario) se acepta", () => {
    expect(clampLogoScale("130")).toBe(130);
  });

  it("redondea: la barra manda enteros pero un Json viejo puede traer decimales", () => {
    expect(clampLogoScale(122.4)).toBe(122);
  });
});

describe("resolver: el ajuste del canvas PISA a la base, no la multiplica", () => {
  it("base 120 + canvas 150 = 150, no 180", () => {
    expect(resolveLogoScale(120, 150)).toBe(150);
  });

  it("sin ajuste manda la base del cliente", () => {
    expect(resolveLogoScale(120, undefined)).toBe(120);
    expect(resolveLogoScale(120, null)).toBe(120);
  });

  it("sin nada, 100", () => {
    expect(resolveLogoScale(null)).toBe(LOGO_SCALE_DEFAULT);
    expect(resolveLogoScale(undefined, undefined)).toBe(LOGO_SCALE_DEFAULT);
  });

  it("un ajuste basura no rompe: cae a la base", () => {
    expect(resolveLogoScale(130, "sí")).toBe(130);
  });
});
