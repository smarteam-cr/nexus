/**
 * lib/sessions/propuesta-de-empresa.test.ts — la empresa que propone Nexus para una reunión sin dueña (T3) es la que dice
 * el resolver único, y la decide quien estuvo.
 */
import { describe, expect, it } from "vitest";
import type { CategorizeContext } from "./categorize";
import { mensajeDespuesDeDecidir, mismaPropuesta, opcionDeLaPropuesta, porQueLaPropone, proponerEmpresa, puedeDecidirLaEmpresa } from "./propuesta-de-empresa";

const ctx = (): CategorizeContext => ({
  clients: [
    { id: "wherex", name: "Wherex", company: "wherex.com", emailDomains: [] },
    { id: "honda", name: "Honda Costa Rica", company: null, emailDomains: ["honda.cr"] },
  ],
  categories: [{ id: "casa", name: "Smarteam", slug: "smarteam", domains: ["smarteamcr.com"], kind: "internal", color: null }],
  hubspotCompaniesByDomain: new Map([
    ["facocr.com", { id: "hs-faco", name: "FACO", domain: "facocr.com" }],
    ["ligada.com", { id: "hs-ligada", name: "La ligada", domain: "ligada.com" }],
  ]),
  internalDomains: new Set(["smarteamcr.com"]),
  clientsByHubspotCompanyId: new Map([["hs-ligada", { id: "honda", name: "Honda Costa Rica", company: null }]]),
});
const reunion = (participants: string[], title = "Revisión del pipeline") => ({ title, participants, manualClientId: null });

describe("proponerEmpresa: lo que dice el resolver, con las empresas de HubSpot que Nexus no tiene", () => {
  it("una empresa de HubSpot del dominio que no está en Nexus → crearla como prospecto", () => {
    expect(proponerEmpresa(reunion(["liz@smarteamcr.com", "ana@facocr.com"]), ctx())).toEqual({
      tipo: "HUBSPOT",
      clientId: null,
      nombre: "FACO",
      hubspotCompanyId: "hs-faco",
      dominio: "facocr.com",
    });
  });
  it("una empresa que ya está (por el dominio, por HubSpot ligado o por el título) → esa", () => {
    expect(proponerEmpresa(reunion(["liz@smarteamcr.com", "x@wherex.com"]), ctx())).toMatchObject({ tipo: "CLIENTE", clientId: "wherex" });
    expect(proponerEmpresa(reunion(["liz@smarteamcr.com", "x@ligada.com"]), ctx())).toMatchObject({ tipo: "CLIENTE", clientId: "honda" });
    expect(proponerEmpresa(reunion(["liz@smarteamcr.com", "x@gmail.com"], "Wherex | Kickoff"), ctx())).toMatchObject({ tipo: "CLIENTE", clientId: "wherex" });
  });
  it("un correo personal y un título sin empresa → ninguna (se elige a mano)", () => {
    expect(proponerEmpresa(reunion(["liz@smarteamcr.com", "x@gmail.com"], "Entrevista"), ctx())).toBeNull();
  });
  it("la misma propuesta no se reescribe; otra sí", () => {
    const p = proponerEmpresa(reunion(["ana@facocr.com"]), ctx())!;
    expect(mismaPropuesta({ tipo: "HUBSPOT", clientId: null, hubspotCompanyId: "hs-faco" }, p)).toBe(true);
    expect(mismaPropuesta({ tipo: "CLIENTE", clientId: "honda", hubspotCompanyId: null }, p)).toBe(false);
  });
  it("lo dice en palabras", () => {
    expect(porQueLaPropone({ tipo: "HUBSPOT", nombre: "FACO", dominio: "facocr.com" })).toMatch(/@facocr\.com.*«FACO».*prospecto/);
    expect(opcionDeLaPropuesta({ tipo: "HUBSPOT", nombre: "FACO" })).toMatch(/crear como prospecto/);
    expect(opcionDeLaPropuesta({ tipo: "CLIENTE", nombre: "Wherex" })).toBe("Wherex");
  });
});

describe("quién decide", () => {
  const r = { organizador: "Liz@SmarteamCR.com", participantes: ["marco@smarteamcr.com", "ana@facocr.com"] };
  it("quien la organizó o estuvo invitado, y la líder de CS o dirección", () => {
    expect(puedeDecidirLaEmpresa(r, { email: "liz@smarteamcr.com", veTodo: false })).toBe(true);
    expect(puedeDecidirLaEmpresa(r, { email: "marco@smarteamcr.com", veTodo: false })).toBe(true);
    expect(puedeDecidirLaEmpresa(r, { email: "otro@smarteamcr.com", veTodo: false })).toBe(false);
    expect(puedeDecidirLaEmpresa(r, { email: "otro@smarteamcr.com", veTodo: true })).toBe(true);
    expect(puedeDecidirLaEmpresa(r, { email: "", veTodo: false })).toBe(false);
  });
});

describe("después de decidir", () => {
  const ahora = new Date("2026-10-25T12:00:00Z");
  it("una fresca se lee sola; una de más de 14 días va por el lote de lo atrasado", () => {
    expect(mensajeDespuesDeDecidir("FACO", new Date("2026-10-22T12:00:00Z"), ahora, true)).toMatch(/se creó «FACO» como prospecto.*lee en unos minutos/);
    expect(mensajeDespuesDeDecidir("Wherex", new Date("2026-08-01T12:00:00Z"), ahora, false)).toMatch(/más de 14 días.*por lote/);
  });
});
