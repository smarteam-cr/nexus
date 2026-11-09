/**
 * «Planificar con una empresa» con empresas de varias unidades (9 nov): una opción por ficha, cada una por su puerta,
 * y la búsqueda por el nombre de una unidad que HubSpot no conoce.
 */
import { describe, expect, it } from "vitest";
import { armarOpciones, laBusquedaNombraALaFicha, sumarPagina, type EmpresaEnLaLista, type FichaDeLaLista } from "./unidades-en-la-lista";

const ficha = (f: Partial<FichaDeLaLista> & Pick<FichaDeLaLista, "id" | "name">): FichaDeLaLista => ({
  kind: "CLIENTE",
  hubspotCompanyId: null,
  comparteDominioConId: null,
  siglas: [],
  emailDomains: [],
  industry: null,
  exploracionId: null,
  ...f,
});

const CEMACO_HS: EmpresaEnLaLista = {
  id: "59033632123",
  nombre: "Cemaco Internacional",
  dominio: "cemaco.co.cr",
  industria: "Retail",
  pais: "Costa Rica",
  ultimaActividad: "2026-11-05T10:00:00Z",
};
const OTRA_HS: EmpresaEnLaLista = { id: "111", nombre: "Cementos del Norte", dominio: "cdn.com", industria: null, pais: null, ultimaActividad: null };

const CR = ficha({ id: "c-cr", name: "Cemaco · Costa Rica", hubspotCompanyId: "59033632123", emailDomains: ["cemaco.co.cr"], exploracionId: "exp-cr", siglas: ["CR"] });
const EC = ficha({ id: "c-ec", name: "Cemaco · Ecuador", comparteDominioConId: "c-cr", emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], industry: "RETAIL" });
const TAE = ficha({ id: "c-tae", name: "TEC · TAE", hubspotCompanyId: "222", emailDomains: ["itcr.ac.cr"] });
const AE = ficha({ id: "c-ae", name: "TEC · AE", comparteDominioConId: "c-tae", siglas: ["AE"] });
const FICHAS = [CR, EC, TAE, AE];

describe("armarOpciones", () => {
  it("una empresa con unidades trae la principal con su nombre de Nexus y debajo cada unidad", () => {
    const ops = armarOpciones({ empresas: [CEMACO_HS, OTRA_HS], fichas: FICHAS, q: "cema", primeraPagina: true });
    expect(ops.map((o) => o.nombre)).toEqual(["Cemaco · Costa Rica", "Cemaco · Ecuador", "Cementos del Norte"]);
    const [cr, ec] = ops;
    expect(cr).toMatchObject({ companyId: "59033632123", clientId: null, enHubspot: "Cemaco Internacional", conUnidades: true, unidadDe: null, exploracionId: "exp-cr" });
    expect(ec).toMatchObject({ companyId: null, clientId: "c-ec", sinEmpresaPropia: true, unidadDe: "Cemaco · Costa Rica", exploracionId: null });
  });

  it("«Ver más» no repite un grupo que la primera página trajo por nombre", () => {
    const primera = armarOpciones({ empresas: [], fichas: FICHAS, q: "tec", primeraPagina: true });
    const tecHs: EmpresaEnLaLista = { id: "222", nombre: "Instituto Tecnológico de Costa Rica", dominio: "itcr.ac.cr", industria: null, pais: null, ultimaActividad: null };
    const segunda = armarOpciones({ empresas: [tecHs, OTRA_HS], fichas: FICHAS, q: "tec", primeraPagina: false });
    expect(sumarPagina(primera, segunda).map((o) => o.clave)).toEqual(["c-tae", "c-ae", "hs:111"]);
  });

  it("la unidad se abre por SU ficha, nunca por la empresa de HubSpot de la principal (invariante 1)", () => {
    const ops = armarOpciones({ empresas: [CEMACO_HS], fichas: FICHAS, q: "", primeraPagina: true });
    const ec = ops.find((o) => o.nombre === "Cemaco · Ecuador")!;
    expect(ec.companyId).not.toBe("59033632123");
    expect(ec.clientId).toBe("c-ec");
    // Ni la preventa ni los datos de HubSpot de la principal se le prestan a la unidad.
    expect(ec.exploracionId).toBeNull();
    expect(ec.pais).toBeNull();
    expect(ec.ultimaActividad).toBeNull();
    expect(ec.dominio).toBe("sukasa.com");
  });

  it("buscar por el nombre de la unidad la encuentra aunque HubSpot no devuelva nada", () => {
    const ops = armarOpciones({ empresas: [], fichas: FICHAS, q: "Ecuador", primeraPagina: true });
    expect(ops.map((o) => o.clave)).toEqual(["c-cr", "c-ec"]);
    const ae = armarOpciones({ empresas: [], fichas: FICHAS, q: "AE", primeraPagina: true });
    expect(ae.map((o) => o.nombre)).toEqual(["TEC · TAE", "TEC · AE"]);
  });

  it("los grupos encontrados por nombre van solo en la primera página y no se repiten", () => {
    expect(armarOpciones({ empresas: [], fichas: FICHAS, q: "Ecuador", primeraPagina: false })).toEqual([]);
    const ops = armarOpciones({ empresas: [CEMACO_HS], fichas: FICHAS, q: "cemaco", primeraPagina: true });
    expect(ops.map((o) => o.clave)).toEqual(["c-cr", "c-ec"]);
  });

  it("una unidad con empresa propia también se abre por su ficha (si su empresa se fusiona, la puerta de la empresa daría la principal) y no duplica el grupo", () => {
    const ecPropia = { ...EC, hubspotCompanyId: "333" };
    const sukasa: EmpresaEnLaLista = { id: "333", nombre: "Sukasa", dominio: "sukasa.com", industria: null, pais: "Ecuador", ultimaActividad: null };
    const ops = armarOpciones({ empresas: [sukasa, CEMACO_HS], fichas: [CR, ecPropia], q: "", primeraPagina: true });
    expect(ops.map((o) => o.clave)).toEqual(["c-cr", "c-ec"]);
    expect(ops[1]).toMatchObject({ companyId: null, clientId: "c-ec", sinEmpresaPropia: false, enHubspot: "Sukasa", pais: "Ecuador" });
    // La principal lleva los datos de SU empresa de HubSpot, no los de la unidad.
    expect(ops[0]).toMatchObject({ companyId: "59033632123", enHubspot: "Cemaco Internacional", pais: "Costa Rica" });
  });

  it("si en la página solo está la empresa de la unidad, la principal no hereda sus datos", () => {
    const ecPropia = { ...EC, hubspotCompanyId: "333" };
    const sukasa: EmpresaEnLaLista = { id: "333", nombre: "Sukasa", dominio: "sukasa.com", industria: null, pais: "Ecuador", ultimaActividad: null };
    const ops = armarOpciones({ empresas: [sukasa], fichas: [CR, ecPropia], q: "", primeraPagina: true });
    expect(ops[0]).toMatchObject({ clave: "c-cr", enHubspot: null, pais: null, dominio: "cemaco.co.cr" });
  });

  it("una empresa sin unidades sigue como antes: el nombre de HubSpot", () => {
    const sola = ficha({ id: "c-x", name: "X en Nexus", hubspotCompanyId: "111", kind: "PROSPECTO", exploracionId: "exp-x" });
    const [op] = armarOpciones({ empresas: [OTRA_HS], fichas: [sola, ...FICHAS], q: "", primeraPagina: true });
    expect(op).toMatchObject({ clave: "c-x", companyId: "111", clientId: null, nombre: "Cementos del Norte", esCliente: false, exploracionId: "exp-x", conUnidades: false });
  });

  it("una principal sin empresa de HubSpot no da opción propia (la puerta por ficha es solo de unidades)", () => {
    const sinHs = { ...TAE, hubspotCompanyId: null };
    const ops = armarOpciones({ empresas: [], fichas: [sinHs, AE], q: "tec", primeraPagina: true });
    expect(ops.map((o) => o.clave)).toEqual(["c-ae"]);
  });
});

describe("laBusquedaNombraALaFicha", () => {
  it("por palabra del nombre o sigla, sin tildes; un pedazo de otra palabra no cuenta", () => {
    expect(laBusquedaNombraALaFicha("ecua", EC)).toBe(true);
    expect(laBusquedaNombraALaFicha("costa ri", CR)).toBe(true);
    expect(laBusquedaNombraALaFicha("ae", AE)).toBe(true);
    expect(laBusquedaNombraALaFicha("ae", TAE)).toBe(false);
    expect(laBusquedaNombraALaFicha("ec", EC)).toBe(true);
    expect(laBusquedaNombraALaFicha("e", EC)).toBe(false);
    expect(laBusquedaNombraALaFicha("kolbi", ficha({ id: "k", name: "kölbi" }))).toBe(true);
  });
});
