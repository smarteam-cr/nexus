import { describe, it, expect } from "vitest";
import { resolveRunResultUrl, type RunUrlInput } from "./run-url";

const base: RunUrlInput = { clientId: null, projectId: null, businessCaseId: null, canvasId: null };

describe("resolveRunResultUrl", () => {
  it("lleva al canvas exacto cuando hay proyecto y canvas", () => {
    expect(resolveRunResultUrl({ ...base, clientId: "cli1", projectId: "pro1", canvasId: "can1" })).toBe(
      "/clients/cli1?tab=pro1&canvas=can1",
    );
  });

  it("lleva a la pestaña del proyecto cuando no se sabe el canvas", () => {
    expect(resolveRunResultUrl({ ...base, clientId: "cli1", projectId: "pro1" })).toBe(
      "/clients/cli1?tab=pro1",
    );
  });

  it("el caso de negocio gana sobre todo lo demás (tiene página propia)", () => {
    expect(
      resolveRunResultUrl({ ...base, clientId: "cli1", projectId: "pro1", businessCaseId: "bc1" }),
    ).toBe("/business-cases/bc1");
  });

  it("cae al cliente cuando la corrida no está anclada a un proyecto", () => {
    expect(resolveRunResultUrl({ ...base, clientId: "cli1" })).toBe("/clients/cli1");
  });

  it("una corrida sin cliente es un reporte de cartera → Cobranza", () => {
    expect(resolveRunResultUrl(base)).toBe("/cobranza");
  });

  it("ignora el proyecto si no hay cliente (la ruta cuelga del cliente)", () => {
    expect(resolveRunResultUrl({ ...base, projectId: "pro1", canvasId: "can1" })).toBe("/cobranza");
  });

  it("siempre devuelve una ruta navegable, nunca vacío", () => {
    const casos: RunUrlInput[] = [
      base,
      { ...base, clientId: "c" },
      { ...base, clientId: "c", projectId: "p" },
      { ...base, businessCaseId: "b" },
    ];
    for (const c of casos) expect(resolveRunResultUrl(c)).toMatch(/^\/[a-z]/);
  });

  it("escapa los ids en la query (no rompe la URL)", () => {
    const url = resolveRunResultUrl({ ...base, clientId: "cli1", projectId: "a b&c", canvasId: "x=y" });
    expect(url).toBe("/clients/cli1?tab=a+b%26c&canvas=x%3Dy");
  });
});
