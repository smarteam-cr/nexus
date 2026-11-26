import { describe, expect, it } from "vitest";
import { limpiarDominio, normalizarDominio, normalizarSigla } from "./siglas-y-dominios";

describe("cómo queda escrita una sigla o un dominio de una ficha", () => {
  it("la sigla va en mayúsculas, sin espacios y de 2 letras o más", () => {
    expect(normalizarSigla(" sas ")).toBe("SAS");
    expect(normalizarSigla("s a s")).toBe("SAS");
    expect(normalizarSigla("x")).toBeNull();
    expect(normalizarSigla("  ")).toBeNull();
  });

  it("el dominio va en minúsculas y sin «@»; si no tiene punto, no es un dominio", () => {
    expect(limpiarDominio(" @StratosphereCorp.com ")).toBe("stratospherecorp.com");
    expect(normalizarDominio("@StratosphereCorp.com")).toBe("stratospherecorp.com");
    expect(normalizarDominio("itcr.ac.cr")).toBe("itcr.ac.cr");
    expect(normalizarDominio("stratosphere")).toBeNull();
    expect(normalizarDominio("ana@empresa.com")).toBeNull();
  });
});
