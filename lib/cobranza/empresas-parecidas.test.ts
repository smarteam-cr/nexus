/**
 * lib/cobranza/empresas-parecidas.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/empresas-parecidas.test.ts --project unit`.
 *
 * Los cuatro pares son reales: la misma empresa dada de alta dos veces, medido en la base el 2026-09-13
 * (nombres, tipos y dominios tal cual). Cada uno tiene que frenarse en las dos direcciones.
 */
import { describe, it, expect } from "vitest";
import { claveSuelta, dominioDelTexto, empresasParecidas, type EmpresaExistente } from "./empresas-parecidas";

const BLUESAT: EmpresaExistente = { id: "bluesat", nombre: "BLUESAT", kind: "CLIENTE", dominios: ["revify.cr", "bluesat.cr"], cuentaId: "cta-bluesat" };
const BLUESAT_CR: EmpresaExistente = { id: "bluesat-cr", nombre: "bluesat.cr", kind: "CLIENTE", dominios: ["bluesat.cr"], cuentaId: null };
const AREYA: EmpresaExistente = { id: "areya", nombre: "Areyá", kind: "CLIENTE", dominios: ["areya.com.mx"], cuentaId: null };
const AREYAS: EmpresaExistente = { id: "areyas", nombre: "Areyas", kind: "PROSPECTO", dominios: [], cuentaId: null };
const EURO_STONE: EmpresaExistente = { id: "euro-stone", nombre: "Euro Stone CR", kind: "CLIENTE", dominios: ["eurostonecr.com"], cuentaId: null };
const EUROSTONE: EmpresaExistente = { id: "eurostone", nombre: "Eurostone", kind: "CLIENTE", dominios: [], cuentaId: "cta-eurostone" };
const MINEC: EmpresaExistente = { id: "minec", nombre: "Ministerio de Economía", kind: "CLIENTE", dominios: ["economia.gob.sv", "minec.gob.sv"], cuentaId: null };
const MINEC_2: EmpresaExistente = { id: "minec-2", nombre: "Ministerio de Economía (MINEC)", kind: "CLIENTE", dominios: ["minec.gob.sv"], cuentaId: null };

/** Otras empresas de la base que NO son ninguna de las ocho: el ruido contra el que se busca. */
const RESTO: EmpresaExistente[] = [
  { id: "teamnet", nombre: "Teamnet", kind: "CLIENTE", dominios: ["stratospherecorp.com", "teamnet.com.mx"], cuentaId: "cta-teamnet" },
  { id: "libreria", nombre: "Librería Internacional", kind: "CLIENTE", dominios: ["libreriainternacional.com"], cuentaId: "cta-libreria" },
  { id: "judesur", nombre: "JUDESUR", kind: "CLIENTE", dominios: ["judesur.go.cr"], cuentaId: "cta-judesur" },
  { id: "releva", nombre: "RELEVA ABOGADOS", kind: "CLIENTE", dominios: ["relevaabogados.com"], cuentaId: null },
];

const ids = (alta: { nombre: string; dominio: string | null }, existentes: EmpresaExistente[]) =>
  empresasParecidas(alta, existentes).map((p) => `${p.id}:${p.via}`);

describe("claveSuelta: la misma empresa escrita de dos formas da la misma clave", () => {
  it.each([
    ["Areyas", "Areyá"],
    ["bluesat.cr", "BLUESAT"],
    ["Euro Stone CR", "Eurostone"],
    ["Ministerio de Economía (MINEC)", "Ministerio de Economía"],
    ["Eurostone, S.A.", "EURO STONE"],
  ])("«%s» ≡ «%s»", (a, b) => {
    expect(claveSuelta(a)).toBe(claveSuelta(b));
    expect(claveSuelta(a)).not.toBe("");
  });

  it("⚠ dos sociedades distintas de verdad no se confunden", () => {
    /* Los grupos que hay que PREGUNTARLE a Alex (hallazgo H10): parecerse no es ser la misma. */
    expect(claveSuelta("Saxum Agua")).not.toBe(claveSuelta("Saxum Consultora"));
    expect(claveSuelta("Transportes Refrigerados HL")).not.toBe(claveSuelta("HL Cargo Solutions"));
    expect(claveSuelta("Visual Branding")).not.toBe(claveSuelta("Visual Branding Group"));
  });

  it("un nombre sin letras suficientes no da clave: chocaría con cualquiera", () => {
    expect(claveSuelta("S.A.")).toBe("");
    expect(claveSuelta("")).toBe("");
    expect(claveSuelta(null)).toBe("");
  });
});

describe("dominioDelTexto", () => {
  it("reconoce un dominio entero, con o sin protocolo", () => {
    expect(dominioDelTexto("bluesat.cr")).toBe("bluesat.cr");
    expect(dominioDelTexto("https://www.EuroStoneCR.com/contacto")).toBe("eurostonecr.com");
    expect(dominioDelTexto("minec.gob.sv")).toBe("minec.gob.sv");
  });

  it("una forma jurídica o un nombre no son dominios", () => {
    expect(dominioDelTexto("S.A.")).toBeNull();
    expect(dominioDelTexto("S.R.L")).toBeNull();
    expect(dominioDelTexto("BLUESAT")).toBeNull();
    expect(dominioDelTexto(null)).toBeNull();
  });
});

describe("⭐ los cuatro pares reales se frenan antes de crear el segundo", () => {
  it("BLUESAT: dar de alta «bluesat.cr» encuentra a BLUESAT por el dominio que lleva de nombre", () => {
    expect(ids({ nombre: "bluesat.cr", dominio: null }, [BLUESAT, ...RESTO])).toEqual(["bluesat:DOMINIO"]);
    expect(ids({ nombre: "BLUESAT", dominio: null }, [BLUESAT_CR, ...RESTO])).toEqual(["bluesat-cr:NOMBRE"]);
  });

  it("Areyá: el prospecto también cuenta, aunque no sea cartera", () => {
    expect(ids({ nombre: "Areyá", dominio: "areya.com.mx" }, [AREYAS, ...RESTO])).toEqual(["areyas:NOMBRE"]);
    expect(ids({ nombre: "Areyas", dominio: null }, [AREYA, ...RESTO])).toEqual(["areya:NOMBRE"]);
  });

  it("Euro Stone: el país pegado al final y el espacio no la vuelven otra", () => {
    expect(ids({ nombre: "Eurostone", dominio: null }, [EURO_STONE, ...RESTO])).toEqual(["euro-stone:NOMBRE"]);
    expect(ids({ nombre: "Euro Stone CR", dominio: "eurostonecr.com" }, [EUROSTONE, ...RESTO])).toEqual(["eurostone:NOMBRE"]);
  });

  it("MINEC: se detecta por el dominio aunque el nombre traiga la sigla", () => {
    expect(ids({ nombre: "MINEC", dominio: "minec.gob.sv" }, [MINEC, ...RESTO])).toEqual(["minec:DOMINIO"]);
    expect(ids({ nombre: "Ministerio de Economía (MINEC)", dominio: "minec.gob.sv" }, [MINEC, ...RESTO])).toEqual(["minec:DOMINIO"]);
    expect(ids({ nombre: "Ministerio de Economía", dominio: null }, [MINEC_2, ...RESTO])).toEqual(["minec-2:NOMBRE"]);
  });

  it("una empresa nueva de verdad no trae ninguna parecida", () => {
    expect(ids({ nombre: "Grupo INB", dominio: "grupoinb.com" }, [BLUESAT, AREYA, EURO_STONE, MINEC, ...RESTO])).toEqual([]);
  });

  it("con las dos del par ya cargadas, salen las dos: la cartera primero y el dominio antes que el nombre", () => {
    expect(ids({ nombre: "Areyas", dominio: "areya.com.mx" }, [AREYAS, AREYA, ...RESTO])).toEqual(["areya:DOMINIO", "areyas:NOMBRE"]);
    expect(ids({ nombre: "BLUESAT", dominio: null }, [BLUESAT_CR, BLUESAT, ...RESTO])).toEqual(["bluesat:NOMBRE", "bluesat-cr:NOMBRE"]);
  });
});
