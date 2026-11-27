/**
 * lib/clients/crear-empresa.test.ts — el plan para poner la empresa arriba de sus unidades (2026-11-26).
 *
 * Correr: `npx vitest run lib/clients/crear-empresa.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { ID_DE_LA_EMPRESA_NUEVA, fichasConLaEmpresa, planDeLaEmpresa, type FichaParaLaEmpresa } from "./crear-empresa";

const TAE: FichaParaLaEmpresa = { id: "tae", name: "TEC · TAE", kind: "CLIENTE", company: "tec.ac.cr", emailDomains: ["tec.ac.cr", "itcr.ac.cr"], hubspotCompanyId: "59180429929", comparteDominioConId: null };
const AE: FichaParaLaEmpresa = { id: "ae", name: "TEC · AE", kind: "CLIENTE", company: "TEC- AE", emailDomains: [], hubspotCompanyId: null, comparteDominioConId: "tae" };
const CR: FichaParaLaEmpresa = { id: "cr", name: "Cemaco · Costa Rica", kind: "CLIENTE", company: "Cemaco Internacional", emailDomains: ["cemaco.co.cr"], hubspotCompanyId: "59033632123", comparteDominioConId: null };
const EC: FichaParaLaEmpresa = { id: "ec", name: "Cemaco · Ecuador", kind: "CLIENTE", company: null, emailDomains: ["sukasa.com", "comohogar.com"], hubspotCompanyId: null, comparteDominioConId: "cr" };

const TEC_CFG = { clave: "tec", nombre: "TEC", unidades: ["tae", "ae"], desde: "tae", dominiosCompartidos: ["tec.ac.cr", "itcr.ac.cr"], empresaDeHubspot: "59180429929" };

describe("el TEC", () => {
  const r = planDeLaEmpresa(TEC_CFG, [TAE, AE]);

  it("la empresa se lleva los dominios, el company que es un dominio y la empresa de HubSpot; TAE queda como AE", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.crear).toEqual({ name: "TEC", kind: "EMPRESA", company: "tec.ac.cr", emailDomains: ["tec.ac.cr", "itcr.ac.cr"], hubspotCompanyId: "59180429929", source: "manual" });
    expect(r.plan.cambios.find((c) => c.id === "tae")!.data).toEqual({ comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA, emailDomains: [], company: null, hubspotCompanyId: null });
    expect(r.plan.cambios.find((c) => c.id === "ae")!.data).toEqual({ comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA });
  });

  it("en memoria, para el simulacro: la empresa al final y las unidades con sus campos nuevos", () => {
    if (!r.ok) throw new Error("plan");
    const fichas = fichasConLaEmpresa(r.plan, [TAE, AE]);
    expect(fichas.map((f) => f.id)).toEqual(["tae", "ae", ID_DE_LA_EMPRESA_NUEVA]);
    expect(fichas[0]).toMatchObject({ emailDomains: [], hubspotCompanyId: null, comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA });
    expect(fichas[2]).toMatchObject({ kind: "EMPRESA", hubspotCompanyId: "59180429929" });
  });

  it("la segunda vez dice que ya está", () => {
    const tec = { ...TAE, id: "tec", name: "TEC", kind: "EMPRESA" };
    const r2 = planDeLaEmpresa(TEC_CFG, [tec, { ...TAE, comparteDominioConId: "tec" }, { ...AE, comparteDominioConId: "tec" }]);
    expect(r2.ok && r2.plan.yaEsta).toEqual({ id: "tec" });
  });

  it("un dominio o una empresa de HubSpot que no son de la ficha de origen no se mueven", () => {
    const r2 = planDeLaEmpresa({ ...TEC_CFG, dominiosCompartidos: ["otro.com"], empresaDeHubspot: "1" }, [TAE, AE]);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errores.join(" ")).toMatch(/otro\.com/);
    expect(r2.errores.join(" ")).toMatch(/HubSpot 1/);
  });
});

describe("Cemaco", () => {
  it("sube la empresa de HubSpot, el dominio de Costa Rica se queda y Ecuador toma Sukasa", () => {
    const r = planDeLaEmpresa({ clave: "cemaco", nombre: "Cemaco", unidades: ["cr", "ec"], desde: "cr", empresaDeHubspot: "59033632123", propiasDeHubspot: { ec: "60198830904" } }, [CR, EC]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.crear).toMatchObject({ name: "Cemaco", emailDomains: [], hubspotCompanyId: "59033632123", company: null });
    expect(r.plan.cambios.find((c) => c.id === "cr")!.data).toEqual({ comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA, hubspotCompanyId: null });
    expect(r.plan.cambios.find((c) => c.id === "ec")!.data).toEqual({ comparteDominioConId: ID_DE_LA_EMPRESA_NUEVA, hubspotCompanyId: "60198830904" });
  });

  it("una empresa de HubSpot propia que ya es de otra ficha no se toma (R7b)", () => {
    const otra = { ...AE, id: "x", name: "Sukasa vieja", hubspotCompanyId: "60198830904", comparteDominioConId: null };
    const r = planDeLaEmpresa({ clave: "cemaco", nombre: "Cemaco", unidades: ["cr", "ec"], propiasDeHubspot: { ec: "60198830904" } }, [CR, EC, otra]);
    expect(r.ok).toBe(false);
  });
});

describe("lo que no vale", () => {
  it("una sola unidad, una unidad de otra empresa o una que ya es empresa", () => {
    expect(planDeLaEmpresa({ clave: "x", nombre: "X", unidades: ["tae"] }, [TAE]).ok).toBe(false);
    expect(planDeLaEmpresa({ clave: "x", nombre: "X", unidades: ["ae", "cr"] }, [TAE, AE, CR]).ok).toBe(false);
    expect(planDeLaEmpresa({ clave: "x", nombre: "X", unidades: ["tae", "cr"] }, [{ ...TAE, kind: "EMPRESA" }, CR]).ok).toBe(false);
  });
});
