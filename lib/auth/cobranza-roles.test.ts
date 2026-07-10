/**
 * lib/auth/cobranza-roles.test.ts
 *
 * Tests del whitelist ÚNICO del módulo Cobranza (isCobranzaRole). La cartera de
 * cobros es info sensible de Finanzas: SOLO ADMIN (asistente administrativo) y
 * SUPER_ADMIN. Casos:
 *   A) Incluye ADMIN y SUPER_ADMIN — y nada más (set exacto).
 *   B) Excluye TODOS los demás roles reales (CSE, VENTAS, DEV, CSL, MARKETING).
 *   C) Inputs no-rol: null / undefined / "" / basura / casing → false.
 *
 * Correr: `npx vitest run lib/auth/cobranza-roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { isCobranzaRole, COBRANZA_ROLES } from "./cobranza-roles";

test("A — incluye ADMIN y SUPER_ADMIN, set exacto", () => {
  expect(isCobranzaRole("ADMIN")).toBe(true);
  expect(isCobranzaRole("SUPER_ADMIN")).toBe(true);
  expect([...COBRANZA_ROLES].sort()).toEqual(["ADMIN", "SUPER_ADMIN"]);
});

test("B — excluye todos los demás roles reales", () => {
  expect(isCobranzaRole("CSE")).toBe(false);
  expect(isCobranzaRole("VENTAS")).toBe(false);
  expect(isCobranzaRole("DEV")).toBe(false);
  expect(isCobranzaRole("CSL")).toBe(false);
  expect(isCobranzaRole("MARKETING")).toBe(false);
});

test("C — inputs no-rol: null / undefined / vacío / basura / casing → false", () => {
  expect(isCobranzaRole(null)).toBe(false);
  expect(isCobranzaRole(undefined)).toBe(false);
  expect(isCobranzaRole("")).toBe(false);
  expect(isCobranzaRole("admin")).toBe(false); // case-sensitive a propósito (enum exacto)
  expect(isCobranzaRole("ADMIN ")).toBe(false); // sin trims mágicos
  expect(isCobranzaRole("FINANZAS")).toBe(false);
});
