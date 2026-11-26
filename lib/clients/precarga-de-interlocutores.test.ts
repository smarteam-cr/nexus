/**
 * lib/clients/precarga-de-interlocutores.test.ts — las piezas puras de la precarga desde un mapa (revisión del 26 nov):
 * el cambio de las fichas, la deriva y la huella de todo lo que se escribe.
 */
import { describe, expect, it } from "vitest";
import { ajustarConLosCambios, fichasQueCambian, huellaDeLaPrecarga, separarLaDeriva } from "./precarga-de-interlocutores";

const TEAMNET = { id: "teamnet", name: "Teamnet", siglas: [] as string[], emailDomains: ["teamnet.com.mx", "@StratosphereCorp.com "] };
const STRATO = { id: "strato", name: "Stratosphere", siglas: ["sas"], emailDomains: ["stratosphere.com.mx"] };
const CREDIX = { id: "credix", name: "Credix", siglas: [] as string[], emailDomains: ["credix.com"] };
const cambios = { siglas: [["strato", "SAS"]] as const, dominios: [["strato", "stratospherecorp.com"]] as const };

describe("el cambio de las fichas en memoria", () => {
  const ajustar = ajustarConLosCambios({ siglas: [...cambios.siglas], dominios: [...cambios.dominios] });
  it("la sigla no se repite (sin distinguir mayúsculas) y el dominio pasa, quitándolo de la otra aunque esté escrito distinto", () => {
    const [t, s, c] = ajustar([TEAMNET, STRATO, CREDIX]);
    expect(t!.emailDomains).toEqual(["teamnet.com.mx"]);
    expect(s).toMatchObject({ name: "Stratosphere", siglas: ["sas"], emailDomains: ["stratosphere.com.mx", "stratospherecorp.com"] });
    expect(c).toBe(CREDIX);
  });
  it("una sigla nueva se suma a su ficha", () => {
    const [s] = ajustarConLosCambios({ siglas: [["strato", "STR"]], dominios: [] })([STRATO]);
    expect(s!.siglas).toEqual(["sas", "STR"]);
  });
  it("las fichas que cambian son solo las tocadas, como están hoy", () => {
    expect(fichasQueCambian([TEAMNET, STRATO, CREDIX], ajustar).map((f) => f.id)).toEqual(["teamnet", "strato"]);
    expect(fichasQueCambian([TEAMNET, STRATO, CREDIX], ajustar)[0]).toBe(TEAMNET);
  });
});

describe("la deriva", () => {
  const r = (sessionId: string, de: string | null, a: string | null) => ({ sessionId, de, a });
  // Hoy ya dan distinto: x1 (de la gente del mapa), y1 (de otra gente), z1 (el cambio la manda a otro lado).
  const hoy = [r("x1", "teamnet", "strato"), r("y1", "credix", null), r("z1", "teamnet", null)];
  const con = [r("m1", "teamnet", "strato"), r("x1", "teamnet", "strato"), r("y1", "credix", null), r("z1", "teamnet", "strato")];
  it("lo del mapa y la deriva de su gente se aprueban; la de otra gente no", () => {
    const d = separarLaDeriva({ hoy, con, deLaGente: new Set(["x1"]) });
    expect(d.porElMapa.map((c) => c.sessionId)).toEqual(["m1", "z1"]);
    expect(d.derivaPropia.map((c) => c.sessionId)).toEqual(["x1"]);
    expect(d.derivaAjena.map((c) => c.sessionId)).toEqual(["y1"]);
    expect(d.aprobadas.map((c) => c.sessionId)).toEqual(["m1", "z1", "x1"]);
  });
  it("--con-la-deriva la suma; --completar suma solo lo que la corrida anterior aprobó con esa misma ficha", () => {
    expect(separarLaDeriva({ hoy, con, deLaGente: new Set(), conLaDeriva: true }).aprobadas.map((c) => c.sessionId)).toContain("y1");
    const otraFicha = separarLaDeriva({ hoy, con, deLaGente: new Set(), yaAprobadas: new Map([["y1", "credix"]]) });
    expect(otraFicha.aprobadas.map((c) => c.sessionId)).not.toContain("y1");
    const misma = separarLaDeriva({ hoy, con, deLaGente: new Set(), yaAprobadas: new Map([["y1", null]]) });
    expect(misma.deLaCorridaAnterior.map((c) => c.sessionId)).toEqual(["y1"]);
    expect(misma.aprobadas.map((c) => c.sessionId)).toContain("y1");
  });
});

describe("la huella cubre todo lo que se escribe", () => {
  const base = {
    aprobadas: [{ sessionId: "s1", de: "teamnet", a: "strato" }],
    personas: [{ correo: "laura@teamnet.com.mx", confirmadaEn: ["teamnet", "strato"], sugeridaEn: [] }],
    cambios: { siglas: [["strato", "SAS"] as const], dominios: [] },
    sueltan: ["s1>p1:ia"],
  };
  const h = huellaDeLaPrecarga(base);
  it("no depende del orden", () => {
    expect(huellaDeLaPrecarga({ ...base, personas: [{ correo: "laura@teamnet.com.mx", confirmadaEn: ["strato", "teamnet"], sugeridaEn: [] }] })).toBe(h);
    expect(h).toMatch(/^1-[0-9a-f]+$/);
  });
  it("cambia con un rol que pisa el mapa, con un vínculo que una persona eligió y con otro cambio de fichas", () => {
    expect(huellaDeLaPrecarga({ ...base, personas: [{ ...base.personas[0]!, rol: "decide" }] })).not.toBe(h);
    expect(huellaDeLaPrecarga({ ...base, sueltan: ["s1>p1:elegida para handoff"] })).not.toBe(h);
    expect(huellaDeLaPrecarga({ ...base, cambios: { siglas: [["strato", "STR"] as const], dominios: [] } })).not.toBe(h);
    // «Sin cambio» no es lo mismo que «borrar el rol».
    expect(huellaDeLaPrecarga({ ...base, personas: [{ ...base.personas[0]!, rol: null }] })).not.toBe(h);
  });
});
