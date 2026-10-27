/**
 * Cada edición dice cada celda (dimensión × nivel) con las palabras de su industria: al menos un
 * criterio reescrito o propio por celda. Las que quedan generales a propósito van en `GENERALES_A_PROPOSITO`
 * con su porqué (y en docs/escala/personalizacion-de-las-ediciones.md). La lista solo encoge.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { MINI_ESCALA_CON_EDICION } from "./mini-escala.fixture";
import { parsearEscala } from "./parsear";
import { celdasDeLaEdicion, celdasSinPersonalizar, estaPersonalizada } from "./personalizacion";

/**
 * La 9.0.0 (27 oct) cambió o sacó criterios generales, y lo que cada edición decía de ellos con sus palabras se soltó
 * (lib/escala/nueve): se publicó así, con la decisión provisional de reescribirlas en la versión siguiente.
 */
const NUEVE_CERO = "9.0.0: su texto propio se soltó al cambiar el criterio general; se reescribe en la versión siguiente (decisión provisional del 27 oct).";

/** `edicion:celda` → por qué esa celda se lee igual que en la escala general. */
const GENERALES_A_PROPOSITO: Record<string, string> = {
  "ecommerce-retail:1.1.O": NUEVE_CERO,
  "ecommerce-retail:1.2.I": NUEVE_CERO,
  "ecommerce-retail:1.4.O": NUEVE_CERO,
  "ecommerce-retail:2.1.E": NUEVE_CERO,
  "ecommerce-retail:2.3.E": NUEVE_CERO,
  "ecommerce-retail:2.4.O": NUEVE_CERO,
  "ecommerce-retail:2.8.E": NUEVE_CERO,
  "ecommerce-retail:3.1.O": NUEVE_CERO,
  "ecommerce-retail:3.4.O": NUEVE_CERO,
  "ecommerce-retail:3.6.E": NUEVE_CERO,
  "banca:1.4.O": NUEVE_CERO,
  "banca:1.8.O": NUEVE_CERO,
  "banca:2.1.E": NUEVE_CERO,
  "banca:2.4.O": NUEVE_CERO,
  "banca:2.5.O": NUEVE_CERO,
  "banca:2.6.E": NUEVE_CERO,
  "banca:2.8.E": NUEVE_CERO,
  "banca:3.2.F": NUEVE_CERO,
  "banca:3.6.E": NUEVE_CERO,
  "banca:3.7.O": NUEVE_CERO,
  "banca:3.8.E": NUEVE_CERO,
  "educacion:2.3.E": NUEVE_CERO,
  "educacion:2.4.O": NUEVE_CERO,
  "educacion:2.5.F": NUEVE_CERO,
  "educacion:2.5.O": NUEVE_CERO,
  "educacion:2.8.E": NUEVE_CERO,
  "educacion:3.4.O": NUEVE_CERO,
  "educacion:3.6.E": NUEVE_CERO,
  "inmobiliaria:1.1.O": NUEVE_CERO,
  "inmobiliaria:1.4.O": NUEVE_CERO,
  "inmobiliaria:1.7.O": NUEVE_CERO,
  "inmobiliaria:2.1.E": NUEVE_CERO,
  "inmobiliaria:2.1.O": NUEVE_CERO,
  "inmobiliaria:2.3.E": NUEVE_CERO,
  "inmobiliaria:2.3.O": NUEVE_CERO,
  "inmobiliaria:2.4.O": NUEVE_CERO,
  "inmobiliaria:2.5.O": NUEVE_CERO,
  "inmobiliaria:2.6.O": NUEVE_CERO,
  "inmobiliaria:2.8.E": NUEVE_CERO,
  "inmobiliaria:3.2.F": NUEVE_CERO,
  "inmobiliaria:3.2.E": NUEVE_CERO,
  "inmobiliaria:3.6.E": NUEVE_CERO,
  "turismo:1.1.E": NUEVE_CERO,
  "turismo:1.1.O": NUEVE_CERO,
  "turismo:1.4.O": NUEVE_CERO,
  "turismo:1.7.O": NUEVE_CERO,
  "turismo:2.1.E": NUEVE_CERO,
  "turismo:2.1.O": NUEVE_CERO,
  "turismo:2.2.O": NUEVE_CERO,
  "turismo:2.3.E": NUEVE_CERO,
  "turismo:2.3.O": NUEVE_CERO,
  "turismo:2.4.O": NUEVE_CERO,
  "turismo:2.5.O": NUEVE_CERO,
  "turismo:2.6.E": NUEVE_CERO,
  "turismo:2.8.E": NUEVE_CERO,
  "turismo:3.1.O": NUEVE_CERO,
  "turismo:3.2.F": NUEVE_CERO,
  "turismo:3.4.O": NUEVE_CERO,
  "turismo:3.5.E": NUEVE_CERO,
  "turismo:3.6.E": NUEVE_CERO,
  "turismo:3.7.O": NUEVE_CERO,
  "turismo:3.8.E": NUEVE_CERO,
  "automotriz:1.1.E": NUEVE_CERO,
  "automotriz:1.1.O": NUEVE_CERO,
  "automotriz:1.4.O": NUEVE_CERO,
  "automotriz:1.6.O": NUEVE_CERO,
  "automotriz:1.7.O": NUEVE_CERO,
  "automotriz:1.8.O": NUEVE_CERO,
  "automotriz:2.1.E": NUEVE_CERO,
  "automotriz:2.1.O": NUEVE_CERO,
  "automotriz:2.2.O": NUEVE_CERO,
  "automotriz:2.3.E": NUEVE_CERO,
  "automotriz:2.3.O": NUEVE_CERO,
  "automotriz:2.4.O": NUEVE_CERO,
  "automotriz:2.5.E": NUEVE_CERO,
  "automotriz:2.5.O": NUEVE_CERO,
  "automotriz:2.6.E": NUEVE_CERO,
  "automotriz:2.8.E": NUEVE_CERO,
  "automotriz:3.1.O": NUEVE_CERO,
  "automotriz:3.4.O": NUEVE_CERO,
  "automotriz:3.5.E": NUEVE_CERO,
  "automotriz:3.6.E": NUEVE_CERO,
  "automotriz:3.7.O": NUEVE_CERO,
};

describe("la medición, sobre una edición de juguete", () => {
  const escala = parsearEscala(MINI_ESCALA_CON_EDICION);
  const celdas = celdasDeLaEdicion(escala, "tiendas");
  const celda = (id: string) => celdas.find((c) => c.id === id)!;

  it("cuenta reescritos, propios y los que se leen igual", () => {
    expect(celda("1.2.D")).toMatchObject({ reescritos: 1, propios: 0, generales: 0 });
    expect(celda("1.2.F")).toMatchObject({ reescritos: 1, propios: 1, generales: 1 });
    expect(celda("1.2.O")).toMatchObject({ reescritos: 0, propios: 0, generales: 1, idsGenerales: ["1.2.O1"] });
  });

  it("una celda sin nada de la edición queda pendiente; una sin criterios, no", () => {
    expect(estaPersonalizada(celda("1.2.O"))).toBe(false);
    expect(estaPersonalizada(celda("1.1.F"))).toBe(false);
    expect(estaPersonalizada(celda("1.2.I"))).toBe(true);
  });

  it("sin edición no hay celdas", () => {
    expect(celdasDeLaEdicion(escala, "no-existe")).toEqual([]);
  });
});

describe("las ediciones de la escala del repo", () => {
  const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
  const sin = celdasSinPersonalizar(escala).map((c) => `${c.edicion}:${c.id}`);

  it("cada celda dice algo con las palabras de su industria", () => {
    const nuevas = sin.filter((k) => !(k in GENERALES_A_PROPOSITO));
    expect(nuevas, "estas celdas se leen enteras con la escala general: reescribe al menos un criterio o anótala con su porqué").toEqual([]);
  });

  it("la lista de celdas generales a propósito no se queda vieja", () => {
    const sobran = Object.keys(GENERALES_A_PROPOSITO).filter((k) => !sin.includes(k));
    expect(sobran, "estas celdas ya están personalizadas: sácalas de GENERALES_A_PROPOSITO").toEqual([]);
  });
});
