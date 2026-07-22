import { describe, it, expect } from "vitest";
import { isDevIntegrationPhaseName } from "./phase-names";

describe("isDevIntegrationPhaseName", () => {
  it("matchea el nombre canónico de la fase técnica", () => {
    expect(isDevIntegrationPhaseName("Desarrollo / Integración")).toBe(true);
  });

  it("tolera variantes (sin acento, sin espacios, minúsculas, solo una palabra)", () => {
    expect(isDevIntegrationPhaseName("desarrollo/integracion")).toBe(true);
    expect(isDevIntegrationPhaseName("  DESARROLLO  ")).toBe(true);
    expect(isDevIntegrationPhaseName("Integración")).toBe(true);
  });

  it("no matchea fases funcionales típicas", () => {
    expect(isDevIntegrationPhaseName("Kick-off")).toBe(false);
    expect(isDevIntegrationPhaseName("Set up de HubSpot")).toBe(false);
    expect(isDevIntegrationPhaseName("Onboarding y adopción")).toBe(false);
    expect(isDevIntegrationPhaseName("Seguimiento")).toBe(false);
  });

  it("maneja null/undefined/vacío", () => {
    expect(isDevIntegrationPhaseName(null)).toBe(false);
    expect(isDevIntegrationPhaseName(undefined)).toBe(false);
    expect(isDevIntegrationPhaseName("")).toBe(false);
  });
});
