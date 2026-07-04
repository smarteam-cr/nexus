/**
 * lib/auth/marketing-roles.test.ts
 *
 * Tests del whitelist ÚNICO de roles EDITORES del área Marketing + Contenido
 * (isMarketingEditor). Leer es universal; escribir es SOLO de estos roles —
 * misma clase de fuente única que sales-roles.ts (evita copias inline stale).
 * Casos:
 *   A) Incluye MARKETING, CSL y SUPER_ADMIN.
 *   B) Excluye CSE, VENTAS y DEV (DEV edita Ventas, NO Marketing).
 *   C) Inputs no-rol: null / undefined / "" / basura / casing → false.
 *
 * Correr: `npx vitest run lib/auth/marketing-roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { isMarketingEditor, MARKETING_EDITOR_ROLES } from "./marketing-roles";

test("A — incluye MARKETING, CSL y SUPER_ADMIN", () => {
  expect(isMarketingEditor("MARKETING")).toBe(true);
  expect(isMarketingEditor("CSL")).toBe(true);
  expect(isMarketingEditor("SUPER_ADMIN")).toBe(true);
  // el array exportado es exactamente ese set
  expect([...MARKETING_EDITOR_ROLES].sort()).toEqual(["CSL", "MARKETING", "SUPER_ADMIN"]);
});

test("B — excluye CSE, VENTAS y DEV (DEV ≡ Ventas, no editor de Marketing)", () => {
  expect(isMarketingEditor("CSE")).toBe(false);
  expect(isMarketingEditor("VENTAS")).toBe(false);
  expect(isMarketingEditor("DEV")).toBe(false);
});

test("C — inputs no-rol: null / undefined / vacío / basura / casing → false", () => {
  expect(isMarketingEditor(null)).toBe(false);
  expect(isMarketingEditor(undefined)).toBe(false);
  expect(isMarketingEditor("")).toBe(false);
  expect(isMarketingEditor("EDITOR")).toBe(false);
  expect(isMarketingEditor("marketing")).toBe(false); // case-sensitive a propósito
});
