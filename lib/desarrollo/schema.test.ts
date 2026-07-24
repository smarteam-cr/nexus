/**
 * lib/desarrollo/schema.test.ts — el guardarraíl de la estimación.
 *
 * Lo único con lógica real del slice es el refine "al menos horas o fecha": sin él, un
 * POST vacío crearía una fila que se vuelve la VIGENTE (es la más reciente) y tapa la
 * estimación buena sin borrar nada — un dato que desaparece de la vista sin rastro.
 * queries/mutations son Prisma directo (se verifican en el E2E, no acá).
 */
import { describe, expect, it } from "vitest";
import { devEstimateCreateSchema } from "./schema";

describe("devEstimateCreateSchema", () => {
  it("acepta solo horas", () => {
    expect(devEstimateCreateSchema.safeParse({ hours: 40 }).success).toBe(true);
  });

  it("acepta solo fecha", () => {
    expect(devEstimateCreateSchema.safeParse({ estimatedDate: "2026-08-01" }).success).toBe(true);
  });

  it("acepta ambas + nota", () => {
    const r = devEstimateCreateSchema.safeParse({
      hours: 90,
      estimatedDate: "2026-09-15",
      note: "El cliente sumó la sincronización de facturas",
    });
    expect(r.success).toBe(true);
  });

  it("RECHAZA sin horas ni fecha (el guardarraíl)", () => {
    const r = devEstimateCreateSchema.safeParse({ note: "algo" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("al menos");
  });

  it("RECHAZA la fecha en blanco como si fuera fecha", () => {
    // `estimatedDate: ""` llega del input date vacío — no puede pasar por "hay fecha".
    expect(devEstimateCreateSchema.safeParse({ estimatedDate: "" }).success).toBe(false);
  });

  it("RECHAZA horas no positivas o fraccionarias", () => {
    expect(devEstimateCreateSchema.safeParse({ hours: 0 }).success).toBe(false);
    expect(devEstimateCreateSchema.safeParse({ hours: -8 }).success).toBe(false);
    expect(devEstimateCreateSchema.safeParse({ hours: 7.5 }).success).toBe(false);
  });

  it("acepta null explícito en los opcionales (lo que manda el form al dejarlos vacíos)", () => {
    expect(
      devEstimateCreateSchema.safeParse({ hours: 24, estimatedDate: null, note: null }).success,
    ).toBe(true);
  });
});
