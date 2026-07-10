/**
 * lib/sessions/session-project-locks.test.ts
 *
 * Matriz de LOCKS POR LINK del clasificador sesión→proyecto (plan "contexto por
 * proyecto"). El invariante que protege: NINGUNA señal humana sobre un link
 * (`manual` / `reviewedAt` / tombstone `included=false` / `handoffOverride`) puede
 * ser pisada ni borrada por la IA — la curación del CSE es DURABLE.
 *
 * Casos:
 *   A) Link virgen de IA (agent, sin revisar, incluido, sin override) → NO lockeado.
 *   B) Cada señal humana lockea POR SÍ SOLA (las 4, de a una).
 *   C) handoffOverride lockea con ambos valores (true y false — la "X" y el "Agregar").
 *   D) Combinaciones: cualquier par de señales sigue lockeando.
 *
 * Correr: `npx vitest run lib/sessions/session-project-locks.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { isLockedLink, type SessionProjectLockFields } from "./session-project-locks";

/** Link virgen de IA: el ÚNICO estado que el clasificador puede modificar/borrar. */
function virginLink(overrides: Partial<SessionProjectLockFields> = {}): SessionProjectLockFields {
  return {
    source: "agent",
    reviewedAt: null,
    included: true,
    handoffOverride: null,
    ...overrides,
  };
}

test("A — link virgen de IA NO está lockeado (la IA puede reconsiderarlo)", () => {
  expect(isLockedLink(virginLink())).toBe(false);
});

test("B — cada señal humana lockea por sí sola", () => {
  // source=manual: el humano creó/ratificó el vínculo
  expect(isLockedLink(virginLink({ source: "manual" }))).toBe(true);
  // reviewedAt: el humano confirmó el link (botón "Confirmar contexto" / toggle del panel)
  expect(isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10") }))).toBe(true);
  // included=false: tombstone — el humano excluyó ESTE proyecto para esta sesión
  expect(isLockedLink(virginLink({ included: false }))).toBe(true);
});

test("C — handoffOverride lockea con AMBOS valores (la 'X' y el 'Agregar' del panel)", () => {
  expect(isLockedLink(virginLink({ handoffOverride: true }))).toBe(true);
  expect(isLockedLink(virginLink({ handoffOverride: false }))).toBe(true);
});

test("D — combinaciones de señales siguen lockeando (ninguna 'des-lockea' a otra)", () => {
  expect(isLockedLink(virginLink({ source: "manual", included: false }))).toBe(true);
  expect(
    isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10"), handoffOverride: false })),
  ).toBe(true);
  // Tombstone re-incluido a mano (reviewedAt estampado, included=true): sigue lockeado
  // por el reviewedAt — la decisión humana de reincluir también es durable.
  expect(isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10"), included: true }))).toBe(true);
});
