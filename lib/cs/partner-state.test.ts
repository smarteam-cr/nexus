import { describe, it, expect } from "vitest";
import {
  resolvePartnerState,
  adoptionRiskScore,
  compareAdoptionRisk,
  isStale,
  PARTNER_STATE_META,
} from "./partner-state";

describe("resolvePartnerState", () => {
  it("ok: la cuenta tiene snapshot, sin importar el resto", () => {
    expect(resolvePartnerState({ hasSnapshot: true, anySnapshots: true, lastSync: null })).toBe("ok");
    expect(resolvePartnerState({ hasSnapshot: true, anySnapshots: false, lastSync: { supported: false } })).toBe("ok");
  });

  it("no_scope: el último sync concluyente devolvió 403", () => {
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: false, lastSync: { supported: false } })).toBe("no_scope");
    // aunque queden snapshots viejos de cuando el scope funcionaba
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: true, lastSync: { supported: false } })).toBe("no_scope");
  });

  it("no_match: el sync corrió bien pero esta cuenta no está vinculada", () => {
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: true, lastSync: { supported: true } })).toBe("no_match");
    // supported aunque ESTA corrida no haya vinculado nada nuevo
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: false, lastSync: { supported: true } })).toBe("no_match");
  });

  it("never_synced: sin rastro de ningún sync", () => {
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: false, lastSync: null })).toBe("never_synced");
  });

  it("fallback pre-lastResult: snapshots ajenos sin status persistido = algún sync corrió", () => {
    expect(resolvePartnerState({ hasSnapshot: false, anySnapshots: true, lastSync: null })).toBe("no_match");
  });

  it("todos los estados vacíos tienen copy", () => {
    expect(PARTNER_STATE_META.no_scope.message).toBeTruthy();
    expect(PARTNER_STATE_META.never_synced.chip).toBeTruthy();
    expect(PARTNER_STATE_META.no_match.message).toBeTruthy();
  });
});

describe("adoptionRiskScore / compareAdoptionRisk", () => {
  it("sin dato = MÁS riesgo que cualquier score real (corrige el ?? 999)", () => {
    expect(adoptionRiskScore({ uusScore: null, uusTrend: null })).toBeLessThan(
      adoptionRiskScore({ uusScore: 0, uusTrend: null }),
    );
  });

  it("tendencia negativa sube posiciones: 50 cayendo -0.18 rankea peor que 40 estable", () => {
    const cayendo = { uusScore: 50, uusTrend: -0.18 }; // 50 - 18 = 32
    const estable = { uusScore: 40, uusTrend: 0 };
    expect(compareAdoptionRisk(cayendo, estable)).toBeLessThan(0);
  });

  it("tendencia positiva NO regala puntos", () => {
    expect(adoptionRiskScore({ uusScore: 30, uusTrend: 0.5 })).toBe(30);
  });

  it("orden completo: null primero, luego por riesgo efectivo ascendente", () => {
    const rows = [
      { id: "sano", uusScore: 80, uusTrend: 0.01 },
      { id: "sinDato", uusScore: null, uusTrend: null },
      { id: "cayendo", uusScore: 55, uusTrend: -0.3 }, // 55 - 30 = 25
      { id: "bajo", uusScore: 30, uusTrend: null },
    ].sort(compareAdoptionRisk);
    expect(rows.map((r) => r.id)).toEqual(["sinDato", "cayendo", "bajo", "sano"]);
  });
});

describe("isStale", () => {
  const now = new Date("2026-07-10T12:00:00Z");

  it("dentro del umbral no es stale", () => {
    expect(isStale(new Date("2026-07-01T12:00:00Z"), 14, now)).toBe(false);
  });

  it("pasado el umbral es stale (acepta Date y string ISO)", () => {
    expect(isStale(new Date("2026-06-01T12:00:00Z"), 14, now)).toBe(true);
    expect(isStale("2026-06-01T12:00:00.000Z", 14, now)).toBe(true);
  });

  it("null o fecha inválida no es stale (es 'sin dato', otro estado)", () => {
    expect(isStale(null, 14, now)).toBe(false);
    expect(isStale("no-es-fecha", 14, now)).toBe(false);
  });

  it("el borde exacto no es stale (> estricto)", () => {
    expect(isStale(new Date("2026-06-26T12:00:00Z"), 14, now)).toBe(false);
  });
});
