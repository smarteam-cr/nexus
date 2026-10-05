import { describe, expect, it } from "vitest";
import { cifra, cifrasDe, cifrasPermitidas, cifrasSinRespaldo, porcentaje } from "./cifras";

/**
 * lib/auditoria-portal/cifras.test.ts — UNA SOLA FORMA DE ESCRIBIR NÚMEROS, Y CÓMO SE RECONOCE UNO
 * QUE NO SALE DE LOS DATOS.
 */

describe("cifra y porcentaje", () => {
  it("miles con punto siempre, también con cuatro dígitos, y decimales con coma", () => {
    expect(cifra(1079)).toBe("1.079");
    expect(cifra(13145)).toBe("13.145");
    expect(cifra(999)).toBe("999");
    expect(cifra(46.54, 1)).toBe("46,5");
    expect(cifra(1234567)).toBe("1.234.567");
  });

  it("el porcentaje no muestra 0 % cuando hay algo, ni divide por cero", () => {
    expect(porcentaje(465, 1000)).toBe("46,5 %");
    expect(porcentaje(1, 5000)).toBe("< 0,1 %");
    expect(porcentaje(0, 5000)).toBe("0,0 %");
    expect(porcentaje(3, 0)).toBe("—");
  });
});

describe("cifrasSinRespaldo", () => {
  const permitidas = cifrasPermitidas(["Contactos 13.145 (46,5 %)", "Workflows 37 encendidos"]);

  it("lee las cifras con el formato de la auditoría", () => {
    expect(cifrasDe("13.145 contactos, 46,5 % y 2024-03")).toEqual([13145, 46.5, 2024, 3]);
  });

  it("acepta lo que está en los datos y su redondeo", () => {
    expect(cifrasSinRespaldo("Hay 13.145 contactos y 37 workflows", permitidas)).toEqual([]);
    expect(cifrasSinRespaldo("Casi la mitad: 46 %", permitidas)).toEqual([]);
  });

  it("marca la cifra inventada o calculada", () => {
    expect(cifrasSinRespaldo("Unos 13.000 contactos", permitidas)).toEqual([13000]);
    expect(cifrasSinRespaldo("Sobran 7.000 registros", permitidas)).toEqual([7000]);
  });

  it("los números chicos no cuentan: aparecen en cualquier frase", () => {
    expect(cifrasSinRespaldo("Revisa 3 workflows en 2 semanas", permitidas)).toEqual([]);
  });
});
