/**
 * lib/db/esquema.test.ts — la guarda que evita el 500 entre el deploy y la migración.
 *
 * Correr: `npx vitest run lib/db/esquema.test.ts --project unit`.
 *
 * ── EL ACCIDENTE QUE ESTE ARCHIVO CUIDA ──────────────────────────────────────
 * El 2026-08-23 el módulo SICOP ya se cuidaba de la tabla ausente (P2021) y la pantalla
 * reventó igual: la segunda migración agregaba COLUMNAS a una tabla que sí existía, y eso es
 * P2022. La guarda parcial es peor que ninguna, porque da la sensación de estar cubierto
 * justo para el caso más común — agregarle un campo a algo que ya está.
 *
 * Lo segundo que se congela es el DUCK-TYPING. Con `@prisma/adapter-pg` puede haber dos
 * copias del client en memoria y `instanceof PrismaClientKnownRequestError` dar false para un
 * error que sí lo es; el `code` no miente.
 */
import { describe, expect, it } from "vitest";
import { esquemaDesactualizado, modeloDisponible } from "./esquema";

/** Como llega de verdad: un objeto con `code`, sin ser instancia de nada reconocible acá. */
const conCodigo = (code: string) => Object.assign(new Error("boom"), { code });

describe("esquemaDesactualizado", () => {
  it("⛔ reconoce la COLUMNA ausente, no solo la tabla", () => {
    /* La edición que la pone en rojo: dejar solo P2021. Es exactamente el bug del 2026-08-23. */
    expect(esquemaDesactualizado(conCodigo("P2022"))).toBe(true);
    expect(esquemaDesactualizado(conCodigo("42703"))).toBe(true);
  });

  it("reconoce la tabla ausente en sus dos códigos", () => {
    expect(esquemaDesactualizado(conCodigo("P2021"))).toBe(true);
    expect(esquemaDesactualizado(conCodigo("42P01"))).toBe(true);
  });

  it("⚠ NO usa instanceof: un objeto pelado con `code` alcanza", () => {
    // Con driver adapters el error puede no ser instancia del error de Prisma que conoce
    // este proceso. Si la guarda dependiera de eso, fallaría en producción y solo ahí.
    expect(esquemaDesactualizado({ code: "P2021" })).toBe(true);
  });

  it("⛔ NO se traga cualquier error de base", () => {
    /* Lo importante del otro lado: un unique violation o un timeout NO pueden degradar en
       silencio como "falta la migración". Eso escondería un bug real detrás de un cartel que
       manda a correr un script que no hace falta. */
    for (const code of ["P2002", "P2025", "P1001", "23505", "40001"]) {
      expect(esquemaDesactualizado(conCodigo(code)), code).toBe(false);
    }
    expect(esquemaDesactualizado(new Error("connection terminated"))).toBe(false);
    expect(esquemaDesactualizado(null)).toBe(false);
    expect(esquemaDesactualizado(undefined)).toBe(false);
    expect(esquemaDesactualizado("un string")).toBe(false);
  });

  it("red de último recurso: el mensaje, cuando el `code` se perdió al cruzar el adapter", () => {
    expect(
      esquemaDesactualizado(new Error("The column `x` does not exist in the current database.")),
    ).toBe(true);
    expect(esquemaDesactualizado(new Error('no existe la relación "SicopAdjunto"'))).toBe(true);
  });
});

describe("modeloDisponible — el OTRO lado: el cliente atrás del schema", () => {
  it("⛔ un delegado `undefined` NO se usa: se degrada", () => {
    /* El accidente del 2026-08-23: la migración aplicada, los invariantes verdes, y la
       pantalla igual en 500 — el dev server corría con un client generado antes del modelo, y
       `prisma.sicopAdjunto` era undefined. Eso no tira error de Prisma: tira un TypeError
       pelado, así que `esquemaDesactualizado` no lo veía nunca. */
    expect(modeloDisponible(undefined)).toBe(false);
    expect(modeloDisponible(null)).toBe(false);
    expect(modeloDisponible({})).toBe(false);
  });

  it("un delegado de verdad pasa", () => {
    expect(modeloDisponible({ findMany: () => [], create: () => ({}) })).toBe(true);
  });

  it("⚠ no alcanza con que la propiedad exista: tiene que ser el delegado", () => {
    // Un `{ findMany: true }` no es un modelo; llamarlo reventaría igual.
    expect(modeloDisponible({ findMany: true })).toBe(false);
  });
});
