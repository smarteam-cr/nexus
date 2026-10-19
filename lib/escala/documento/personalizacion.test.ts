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

/** `edicion:celda` → por qué esa celda se lee igual que en la escala general. */
const GENERALES_A_PROPOSITO: Record<string, string> = {};

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
