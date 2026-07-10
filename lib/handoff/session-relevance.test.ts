/**
 * lib/handoff/session-relevance.test.ts
 *
 * Las DOS capas de "qué alimenta el handoff":
 *   1. `linkFeedsHandoff` — política del LINK sesión↔proyecto (primario / secundario
 *      con confianza ≥ HANDOFF_MIN_SECONDARY_CONFIDENCE / forzado a mano). Es lo que
 *      evita que dos handoffs del mismo cliente repitan las mismas sesiones.
 *   2. `classifyHandoffSession` — relevancia de la sesión (EXCLUDE título gana >
 *      INCLUDE handoff/kickoff > Ventas en la sala > excluir).
 *
 * Correr: `npx vitest run lib/handoff/session-relevance.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  classifyHandoffSession,
  linkFeedsHandoff,
  HANDOFF_MIN_SECONDARY_CONFIDENCE,
} from "./session-relevance";

function link(overrides: Partial<Parameters<typeof linkFeedsHandoff>[0]> = {}) {
  return { isPrimary: false, confidence: null, handoffOverride: null, ...overrides };
}

test("linkFeedsHandoff — override=false gana SIEMPRE (incluso primario con regla)", () => {
  expect(linkFeedsHandoff(link({ isPrimary: true, handoffOverride: false }), true)).toBe(false);
});

test("linkFeedsHandoff — override=true gana SIEMPRE (incluso secundario sin regla)", () => {
  expect(linkFeedsHandoff(link({ handoffOverride: true }), false)).toBe(true);
});

test("linkFeedsHandoff — primario: decide la regla de relevancia", () => {
  expect(linkFeedsHandoff(link({ isPrimary: true }), true)).toBe(true);
  expect(linkFeedsHandoff(link({ isPrimary: true }), false)).toBe(false);
});

test("linkFeedsHandoff — secundario: solo con confianza ≥ umbral (y regla)", () => {
  expect(linkFeedsHandoff(link({ confidence: HANDOFF_MIN_SECONDARY_CONFIDENCE - 0.01 }), true)).toBe(false);
  expect(linkFeedsHandoff(link({ confidence: HANDOFF_MIN_SECONDARY_CONFIDENCE }), true)).toBe(true);
  // Con confianza alta pero regla que excluye (ej. título "Implementación") → no alimenta
  expect(linkFeedsHandoff(link({ confidence: 0.9 }), false)).toBe(false);
});

test("linkFeedsHandoff — secundario manual/legacy sin confidence NO alimenta salvo forzado", () => {
  expect(linkFeedsHandoff(link({ confidence: null }), true)).toBe(false);
  expect(linkFeedsHandoff(link({ confidence: null, handoffOverride: true }), false)).toBe(true);
});

// ── classifyHandoffSession (la regla de relevancia, hoy sin tests) ──

const SALES = new Set(["msalas@smarteamcr.com"]);

test("classifyHandoffSession — EXCLUDE por título gana aunque haya Ventas en sala", () => {
  const r = classifyHandoffSession("Implementación semana 3", ["msalas@smarteamcr.com"], null, SALES);
  expect(r.include).toBe(false);
});

test("classifyHandoffSession — insensible a acentos ('Revisión' matchea 'revision')", () => {
  const r = classifyHandoffSession("Revisión de auditoría", [], null, SALES);
  expect(r.include).toBe(false);
});

test("classifyHandoffSession — kickoff INCLUYE por título (sin Ventas en sala)", () => {
  expect(classifyHandoffSession("Kick Off | Cliente & Smarteam", [], null, SALES).include).toBe(true);
});

test("classifyHandoffSession — título neutro: decide Ventas en la sala (participants u organizer)", () => {
  expect(classifyHandoffSession("Casos RCI", ["MSalas@smarteamcr.com"], null, SALES).include).toBe(true);
  expect(classifyHandoffSession("Casos RCI", [], "msalas@smarteamcr.com", SALES).include).toBe(true);
  expect(classifyHandoffSession("Casos RCI", ["cliente@rc.com"], null, SALES).include).toBe(false);
});
