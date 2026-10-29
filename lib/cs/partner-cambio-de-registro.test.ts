import { describe, it, expect } from "vitest";
import {
  activoEnHubspot,
  matchPorEvidencia,
  mensajeSinElegir,
  planearCambiosDeRegistro,
  type RegistroDePartner,
} from "./partner-cambio-de-registro";

const reg = (id: string, activo: boolean | null, companies: string[] = [], domain: string | null = null): RegistroDePartner => ({
  id,
  activo,
  associatedCompanyIds: companies,
  domain,
});

/* Los dos casos medidos el 2026-10-07 en producción. */
const KAIZEN = "cl-kaizen";
const KJ = "cl-kj";
const porCompany = new Map([
  ["58556731410", KAIZEN],
  ["34645026564", KJ],
]);
const porDominio = new Map([
  ["kaizenkapital.com", KAIZEN],
  ["kjpublicidad.com", KJ],
]);

describe("activoEnHubspot", () => {
  it("lee hs_is_active sin confundir «no dice» con «no»", () => {
    expect(activoEnHubspot({ hs_is_active: "true" })).toBe(true);
    expect(activoEnHubspot({ hs_is_active: " TRUE " })).toBe(true);
    expect(activoEnHubspot({ hs_is_active: "false" })).toBe(false);
    expect(activoEnHubspot({ hs_is_active: null })).toBeNull();
    expect(activoEnHubspot({ hs_is_active: "" })).toBeNull();
    expect(activoEnHubspot({})).toBeNull();
  });
});

describe("matchPorEvidencia", () => {
  it("la company asociada manda sobre el dominio, como en el bucle del sync", () => {
    const otro = new Map([["otro.com", KJ]]);
    expect(matchPorEvidencia(reg("x", true, ["58556731410"], "otro.com"), porCompany, otro)).toEqual({
      clientId: KAIZEN,
      via: "company",
    });
  });

  it("toma la primera company que es de un cliente", () => {
    expect(matchPorEvidencia(reg("x", true, ["999", "34645026564", "58556731410"]), porCompany, porDominio)).toEqual({
      clientId: KJ,
      via: "company",
    });
  });

  it("sin company de un cliente, cae al dominio", () => {
    expect(matchPorEvidencia(reg("x", true, ["999"], "kjpublicidad.com"), porCompany, porDominio)).toEqual({
      clientId: KJ,
      via: "domain",
    });
  });

  it("sin evidencia no hay match", () => {
    expect(matchPorEvidencia(reg("x", true, ["999"], "nadie.com"), porCompany, porDominio)).toBeNull();
    expect(matchPorEvidencia(reg("x", true), porCompany, porDominio)).toBeNull();
  });
});

describe("planearCambiosDeRegistro", () => {
  const base = { porCompany, porDominio, asociacionesConfiables: true };

  it("los dos casos de producción: el cliente pasa del registro inactivo al activo", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [
        reg("432818549540", false, [], "kaizenkapital.com"),
        reg("593040862051", true, ["58556731410"], "kaizenkapital.com"),
        reg("438943077260", false, ["34645026564"], "kjpublicidad.com"),
        reg("440586231970", true, ["34645026564"], "kjpublicidad.com"),
      ],
      vinculos: new Map([
        ["432818549540", KAIZEN],
        ["438943077260", KJ],
      ]),
    });
    expect(plan.cambios).toEqual([
      { clientId: KAIZEN, desde: "432818549540", hacia: "593040862051", via: "company" },
      { clientId: KJ, desde: "438943077260", hacia: "440586231970", via: "company" },
    ]);
    expect(plan.sinElegir).toEqual([]);
  });

  it("también con evidencia por dominio", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("viejo", false), reg("nuevo", true, [], "kaizenkapital.com")],
      vinculos: new Map([["viejo", KAIZEN]]),
    });
    expect(plan.cambios).toEqual([{ clientId: KAIZEN, desde: "viejo", hacia: "nuevo", via: "domain" }]);
  });

  it("por dominio no se lleva al cliente a un registro cuya empresa de HubSpot es de otra ficha", () => {
    const registros = [reg("viejo", false), reg("nuevo", true, ["999"], "kaizenkapital.com")];
    const vinculos = new Map([["viejo", KAIZEN]]);
    // La company 999 es de un prospecto (fuera de `porCompany`): el portal es de otra empresa con el mismo dominio.
    const plan = planearCambiosDeRegistro({ ...base, registros, vinculos, duenoDeLaEmpresa: new Map([["999", "cl-prospecto"]]) });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
    // Si la company es del mismo cliente, sí pasa.
    const delMismo = planearCambiosDeRegistro({ ...base, registros, vinculos, duenoDeLaEmpresa: new Map([["999", KAIZEN]]) });
    expect(delMismo.cambios).toEqual([{ clientId: KAIZEN, desde: "viejo", hacia: "nuevo", via: "domain" }]);
  });

  it("corrida «partial» (asociaciones no confiables): no se re-matchea nada", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      asociacionesConfiables: false,
      registros: [reg("viejo", false), reg("nuevo", true, ["58556731410"], "kaizenkapital.com")],
      vinculos: new Map([["viejo", KAIZEN]]),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("dos registros activos para el mismo cliente: no se elige, se reporta", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("actual", true, ["58556731410"]), reg("otro", true, ["58556731410"])],
      vinculos: new Map([["actual", KAIZEN]]),
    });
    expect(plan.cambios).toEqual([]);
    expect(plan.sinElegir).toEqual([{ clientId: KAIZEN, motivo: "dos-activos", actual: "actual", candidatos: ["otro"] }]);
  });

  it("inactivo con dos activos que coinciden: no se elige, se reporta", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [
        reg("viejo", false),
        reg("b-activo", true, ["58556731410"]),
        reg("a-activo", true, [], "kaizenkapital.com"),
      ],
      vinculos: new Map([["viejo", KAIZEN]]),
    });
    expect(plan.cambios).toEqual([]);
    expect(plan.sinElegir).toEqual([
      { clientId: KAIZEN, motivo: "varios-activos", actual: "viejo", candidatos: ["a-activo", "b-activo"] },
    ]);
  });

  it("sin dato de si el registro actual está activo: no se mueve, se reporta", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("actual", null), reg("nuevo", true, ["58556731410"])],
      vinculos: new Map([["actual", KAIZEN]]),
    });
    expect(plan.cambios).toEqual([]);
    expect(plan.sinElegir[0]).toMatchObject({ motivo: "actual-sin-dato", actual: "actual", candidatos: ["nuevo"] });
  });

  it("el candidato tiene que decir que está activo: inactivo o sin dato no reemplaza a nadie", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("viejo", false), reg("otro-inactivo", false, ["58556731410"]), reg("sin-dato", null, ["58556731410"])],
      vinculos: new Map([["viejo", KAIZEN]]),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("un registro que ya tiene otro cliente no se le quita (FUENTE #0)", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      // «ajeno» coincide con KAIZEN por company, pero hoy está vinculado a otro cliente.
      registros: [reg("viejo", false), reg("ajeno", true, ["58556731410"])],
      vinculos: new Map([
        ["viejo", KAIZEN],
        ["ajeno", "cl-otro"],
      ]),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("un cliente sin registro no es un cambio: lo vincula el bucle del sync", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("nuevo", true, ["58556731410"])],
      vinculos: new Map(),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("si el registro actual no vino en la corrida, no se cambia (lo suelta la reconciliación)", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("nuevo", true, ["58556731410"])],
      vinculos: new Map([["borrado-en-hubspot", KAIZEN]]),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("un cliente con registro activo y sin otro candidato no aparece", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [reg("actual", true, ["58556731410"]), reg("viejo-suelto", false, ["58556731410"])],
      vinculos: new Map([["actual", KAIZEN]]),
    });
    expect(plan).toEqual({ cambios: [], sinElegir: [] });
  });

  it("nunca deja a un cliente sin registro ni da un registro a dos clientes", () => {
    const plan = planearCambiosDeRegistro({
      ...base,
      registros: [
        reg("k-viejo", false),
        reg("k-nuevo", true, ["58556731410"]),
        reg("j-viejo", false),
        reg("j-nuevo", true, [], "kjpublicidad.com"),
      ],
      vinculos: new Map([
        ["k-viejo", KAIZEN],
        ["j-viejo", KJ],
      ]),
    });
    for (const c of plan.cambios) expect(c.hacia).not.toBe(c.desde);
    const hacia = plan.cambios.map((c) => c.hacia);
    expect(new Set(hacia).size).toBe(hacia.length);
    const clientes = plan.cambios.map((c) => c.clientId);
    expect(new Set(clientes).size).toBe(clientes.length);
  });
});

describe("mensajeSinElegir", () => {
  it("nombra al cliente y los registros, y dice con cuál sigue", () => {
    const m = mensajeSinElegir({ clientId: KAIZEN, motivo: "dos-activos", actual: "A", candidatos: ["B"] }, "KAIZEN KAPITAL");
    expect(m).toContain("KAIZEN KAPITAL");
    expect(m).toContain("A y B");
    expect(m).toContain("sigue con A");
  });

  it("sin nombre, usa el id del cliente", () => {
    const m = mensajeSinElegir({ clientId: KAIZEN, motivo: "varios-activos", actual: "A", candidatos: ["B", "C"] }, null);
    expect(m).toContain(`el cliente ${KAIZEN}`);
    expect(m).toContain("coinciden 2 registros activos (B, C)");
  });
});
