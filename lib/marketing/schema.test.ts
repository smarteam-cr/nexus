/**
 * lib/marketing/schema.test.ts
 *
 * Regla de atribución "por equipo": quién puede publicar para Smarteam y cómo se
 * resuelve el destino EFECTIVO de una aceptación (el server manda, no el body).
 */
import { describe, it, expect } from "vitest";
import {
  canPublishForSmarteam,
  resolveUsageTarget,
  runCreateSchema,
  MARKETING_GEN_LIMITS,
} from "./schema";

describe("canPublishForSmarteam", () => {
  it("solo el equipo de MARKETING puede publicar para Smarteam", () => {
    expect(canPublishForSmarteam("MARKETING")).toBe(true);
  });

  it("cualquier otro rol NO puede (incluido SUPER_ADMIN — Marco/Elías quedan personal)", () => {
    for (const role of ["VENTAS", "DEV", "CSE", "CSL", "ADMIN", "SUPER_ADMIN"]) {
      expect(canPublishForSmarteam(role)).toBe(false);
    }
  });

  it("null/undefined (sin sesión resuelta) NO puede", () => {
    expect(canPublishForSmarteam(null)).toBe(false);
    expect(canPublishForSmarteam(undefined)).toBe(false);
  });
});

describe("resolveUsageTarget (el destino efectivo lo decide el server)", () => {
  it("marketing que pide SMARTEAM → SMARTEAM", () => {
    expect(resolveUsageTarget("MARKETING", "SMARTEAM")).toBe("SMARTEAM");
  });

  it("marketing que pide PERSONAL → PERSONAL", () => {
    expect(resolveUsageTarget("MARKETING", "PERSONAL")).toBe("PERSONAL");
  });

  it("marketing sin destino explícito → PERSONAL (no asume Smarteam)", () => {
    expect(resolveUsageTarget("MARKETING", undefined)).toBe("PERSONAL");
  });

  it("no-marketing que intenta SMARTEAM → forzado a PERSONAL (no se puede saltar la regla)", () => {
    expect(resolveUsageTarget("VENTAS", "SMARTEAM")).toBe("PERSONAL");
    expect(resolveUsageTarget("SUPER_ADMIN", "SMARTEAM")).toBe("PERSONAL");
    expect(resolveUsageTarget(null, "SMARTEAM")).toBe("PERSONAL");
  });
});

describe("runCreateSchema (config a medida de la tanda)", () => {
  it("kind solo (sin cantidades) sigue siendo válido — cron y CTAs sin form", () => {
    for (const kind of ["INGEST", "GENERATE", "CHAIN"] as const) {
      const r = runCreateSchema.safeParse({ kind });
      expect(r.success).toBe(true);
    }
  });

  it("acepta cantidades dentro del rango", () => {
    const r = runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: 3, personaCount: 2 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.empresaCount).toBe(3);
      expect(r.data.personaCount).toBe(2);
    }
  });

  it("rechaza cantidades sobre el tope de cada tipo", () => {
    expect(
      runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: MARKETING_GEN_LIMITS.maxEmpresa + 1 })
        .success,
    ).toBe(false);
    expect(
      runCreateSchema.safeParse({ kind: "CHAIN", personaCount: MARKETING_GEN_LIMITS.maxPersona + 1 })
        .success,
    ).toBe(false);
  });

  it("rechaza negativos y no-enteros", () => {
    expect(runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: -1 }).success).toBe(false);
    expect(runCreateSchema.safeParse({ kind: "CHAIN", personaCount: 1.5 }).success).toBe(false);
  });

  it("rechaza 0/0 explícito (no se genera nada), pero acepta 0 en un solo tipo", () => {
    expect(
      runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: 0, personaCount: 0 }).success,
    ).toBe(false);
    expect(
      runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: 5, personaCount: 0 }).success,
    ).toBe(true);
    // un solo campo en 0, sin el otro, cae en la rama "todo undefined salvo este" → 0 no alcanza el mínimo
    expect(runCreateSchema.safeParse({ kind: "CHAIN", empresaCount: 0 }).success).toBe(false);
  });
});
