/**
 * lib/cobranza/sociedades.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/sociedades.test.ts --project unit`.
 *
 * Los nombres son los del libro de Alex y los de las cuentas de Nexus, medidos el 2026-09-12. Cada caso
 * es un par que tiene que encontrarse (o no confundirse) sin que nadie teclee nada.
 */
import { describe, it, expect } from "vitest";
import { candidatasPorNombre, claveSociedad, identidadDelNombre, type SociedadConocida } from "./sociedades";

describe("claveSociedad: la factura y la cuenta dan la misma clave", () => {
  it.each([
    ["Visual Branding, S.A. de C.V", "Visual Branding"],
    ["Real Shipping and Trade, SA DE CV", "Real Shipping & Trade"],
    ["CORPORACION ALMOTEC SOCIEDAD ANONIMA", "Corporación Almotec S.A"],
    ["SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", "Solís Eléctrica S.R.L."],
    ["DESARROLLOS CULTURALES COSTARRICENSES D C C SOCIEDAD ANONIMA", "Desarrollos Culturales Costarricenses DCC, S.A.,"],
    ["INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", "Insider Digital"],
    ["Atom Chat INC", "Atom Chat"],
  ])("«%s» ≡ «%s»", (libro, nexus) => {
    expect(claveSociedad(libro)).toBe(claveSociedad(nexus));
    expect(claveSociedad(libro)).not.toBe("");
  });

  it("no deja adentro la forma jurídica ni la cédula pegada", () => {
    expect(claveSociedad("Atlas Mining & Construction, S.A. I 7208610-6")).toBe("atlas mining construction");
    expect(claveSociedad("Metzger Industrial Supplies, s. a. de c. v I NIT: 0614-030512-103-5 I NRC: 216725-2")).toBe(
      "metzger industrial supplies",
    );
  });

  it("una sociedad sin más nombre que su número se queda con el número", () => {
    expect(claveSociedad("3-101-721431 SOCIEDAD ANONIMA")).toBe("3101721431");
  });

  it("vacío da vacío", () => {
    expect(claveSociedad("")).toBe("");
    expect(claveSociedad(null)).toBe("");
  });
});

describe("identidadDelNombre: lo que el libro pega al nombre", () => {
  it("la cédula detrás de « I »", () => {
    const i = identidadDelNombre("Multiquimica Dominicana, S.A I 1-01-10772-3");
    expect(i.cedula).toBe("101107723");
    expect(i.clave).toBe("multiquimica dominicana");
  });

  it("el paréntesis sin números es el alias; con números, la cédula", () => {
    expect(identidadDelNombre("CONSTRULOGIX S.A (Construtecho)")).toMatchObject({ alias: "Construtecho", cedula: null });
    expect(identidadDelNombre("APPTIVIDAD MEXICO SAPI DE CV (AME190327894)")).toMatchObject({
      alias: null,
      cedula: "190327894",
      clave: "apptividad mexico",
    });
  });

  it("⚠ « I » antes de un nombre no es una cédula: «O4Bi I Rempro» es el cliente de O4Bi", () => {
    expect(identidadDelNombre("O4Bi I Rempro")).toMatchObject({ clave: "o4bi rempro", cedula: null });
  });

  it("el RFC de una persona física cuenta como cédula", () => {
    expect(identidadDelNombre("LUIS ALBERTO CORTES ALVARADO I COAL780221HR9")).toMatchObject({
      clave: "luis alberto cortes alvarado",
      cedula: "7802219",
    });
  });
});

describe("candidatasPorNombre: propone, del escalón más fuerte, y nunca elige entre dos", () => {
  const cuentas: SociedadConocida[] = [
    { id: "alliance", nombres: ["Alliance RH", "LUIS ALBERTO CORTES ALVARADO"], cedula: "COAL780221HR9" },
    { id: "visual", nombres: ["Visual Branding"] },
    { id: "visual-group", nombres: ["Visual Branding Group"] },
    { id: "construtecho", nombres: ["Construtecho"] },
    { id: "oceanica", nombres: ["Clínica Oceanica"] },
    { id: "cav", nombres: ["Club de Amantes del Vino"] },
    { id: "libreria-1", nombres: ["Librería Internacional"], cedula: "3101167504" },
    { id: "libreria-2", nombres: ["Librería Internacional (Desarrollos Culturales Costa Rica)"], cedula: "3-101-167504" },
    { id: "noelito", nombres: ["Ferreteria Noelito"] },
  ];

  it("la cédula manda sobre el nombre", () => {
    expect(candidatasPorNombre("LUIS ALBERTO CORTES ALVARADO I COAL780221HR9", cuentas)).toEqual([{ id: "alliance", via: "CEDULA" }]);
  });

  it("el nombre exacto le gana al parcial", () => {
    expect(candidatasPorNombre("Visual Branding, S.A. de C.V", cuentas)).toEqual([{ id: "visual", via: "NOMBRE" }]);
  });

  it("el alias entre paréntesis encuentra la cuenta", () => {
    expect(candidatasPorNombre("CONSTRULOGIX S.A (Construtecho)", cuentas)).toEqual([{ id: "construtecho", via: "ALIAS" }]);
  });

  it("parcial: «Oceanica» está en «Clínica Oceanica»", () => {
    expect(candidatasPorNombre("Oceanica ", cuentas)).toEqual([{ id: "oceanica", via: "PARCIAL" }]);
  });

  it("siglas: «CAV» es «Club de Amantes del Vino»", () => {
    expect(candidatasPorNombre("CAV", cuentas)).toEqual([{ id: "cav", via: "SIGLAS" }]);
  });

  it("⚠ dos cuentas con el mismo nombre salen las dos: no se elige", () => {
    expect(candidatasPorNombre("Librería Internacional", cuentas).map((c) => c.id)).toEqual(["libreria-1", "libreria-2"]);
  });

  it("la persona que factura no siempre se llama como la empresa: sin candidatas, vacío", () => {
    expect(candidatasPorNombre("Javier Noel López Pravia", cuentas)).toEqual([]);
  });
});
