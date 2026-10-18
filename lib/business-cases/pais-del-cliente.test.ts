import { describe, expect, it } from "vitest";
import { esCostaRica, paisDelCliente } from "./pais-del-cliente";

describe("esCostaRica", () => {
  it("reconoce las formas en que aparece", () => {
    for (const t of ["Costa Rica", "costa rica", "COSTA RICA", "CR", "cri", "Costa Rica (San José)", "Cósta Rica"]) {
      expect(esCostaRica(t)).toBe(true);
    }
  });
  it("otro país es false; vacío es no se sabe", () => {
    expect(esCostaRica("Guatemala")).toBe(false);
    expect(esCostaRica("Puerto Rico")).toBe(false);
    expect(esCostaRica("")).toBeNull();
    expect(esCostaRica(null)).toBeNull();
  });
});

describe("paisDelCliente", () => {
  it("la cuenta de cobro configurada manda", () => {
    expect(paisDelCliente({ cuenta: { tipo: "NACIONAL", estadoCuenta: "ACTIVA" }, hubspot: "Guatemala" }))
      .toEqual({ costaRica: true, fuente: "cuenta", pais: "Costa Rica" });
    expect(paisDelCliente({ cuenta: { tipo: "INTERNACIONAL", fuente: "sheet" }, hubspot: "Costa Rica" }).costaRica)
      .toBe(false);
  });

  it("una cuenta en el default de fábrica no dice nada: NACIONAL es el default", () => {
    const r = paisDelCliente({ cuenta: { tipo: "NACIONAL", estadoCuenta: "PENDIENTE_DATOS" }, hubspot: "México" });
    expect(r).toEqual({ costaRica: false, fuente: "hubspot", pais: "México" });
  });

  it("sin cuenta, HubSpot y después la preventa", () => {
    expect(paisDelCliente({ hubspot: "Costa Rica" }).fuente).toBe("hubspot");
    expect(paisDelCliente({ hubspot: "", preventa: "Costa Rica" })).toEqual({ costaRica: true, fuente: "preventa", pais: "Costa Rica" });
  });

  it("sin nada, no se sabe", () => {
    expect(paisDelCliente({})).toEqual({ costaRica: null, fuente: null, pais: null });
    expect(paisDelCliente({ cuenta: { tipo: "NACIONAL" } }).costaRica).toBeNull();
  });
});
