/**
 * lib/hubspot/entidades-en-la-copia.test.ts — quién copia cada proyecto cuando dos fichas comparten empresa.
 *
 * Correr: `npx vitest run lib/hubspot/entidades-en-la-copia.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { empresaDeLaDuena, laCopiaLoSalta } from "./entidades-en-la-copia";

const DUENA = { hubspotCompanyId: "59180429929", comparteDominioConId: null };

describe("empresaDeLaDuena", () => {
  it("una entidad copia de la empresa de su dueña; una ficha normal, de la suya", () => {
    expect(empresaDeLaDuena({ id: "ae", comparteDominioConId: "tae", comparteDominioCon: DUENA })).toBe("59180429929");
    expect(empresaDeLaDuena({ id: "x", comparteDominioConId: null, comparteDominioCon: null })).toBeNull();
  });

  it("sin cadenas ni ficha que se apunte a sí misma: el mismo criterio del resolver", () => {
    expect(empresaDeLaDuena({ id: "ae", comparteDominioConId: "ae", comparteDominioCon: DUENA })).toBeNull();
    expect(empresaDeLaDuena({ id: "ae", comparteDominioConId: "tae", comparteDominioCon: { ...DUENA, comparteDominioConId: "otra" } })).toBeNull();
  });
});

describe("laCopiaLoSalta", () => {
  const nada = new Set<string>();

  it("la entidad solo toca los suyos: un proyecto nuevo del instituto no nace en ella", () => {
    const alcance = { propios: new Set(["p-ae"]), deSusEntidades: nada };
    expect(laCopiaLoSalta("p-ae", alcance)).toBe(false);
    expect(laCopiaLoSalta("p-tae", alcance)).toBe(true);
    expect(laCopiaLoSalta("p-nuevo", alcance)).toBe(true);
  });

  it("la dueña toca todo menos lo de sus entidades, también un proyecto borrado allá", () => {
    const alcance = { propios: null, deSusEntidades: new Set(["p-ae", "p-ae-borrado"]) };
    expect(laCopiaLoSalta("p-tae", alcance)).toBe(false);
    expect(laCopiaLoSalta("p-nuevo", alcance)).toBe(false);
    expect(laCopiaLoSalta("p-ae", alcance)).toBe(true);
    expect(laCopiaLoSalta("p-ae-borrado", alcance)).toBe(true);
  });

  it("una ficha sin grupo no se salta nada", () => {
    expect(laCopiaLoSalta("p", { propios: null, deSusEntidades: nada })).toBe(false);
  });
});
