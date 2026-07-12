/**
 * lib/auth/cobranza-roles.test.ts
 *
 * Tests del whitelist ÚNICO del módulo Cobranza (isCobranzaRole). La cartera de
 * cobros es info sensible de Finanzas: SOLO ADMIN (asistente administrativo) y
 * SUPER_ADMIN. Casos:
 *   A) Incluye ADMIN y SUPER_ADMIN — y nada más (set exacto).
 *   B) Excluye TODOS los demás roles reales (CSE, VENTAS, DEV, CSL, MARKETING).
 *   C) Inputs no-rol: null / undefined / "" / basura / casing → false.
 *   D) COSTOS_ROLES (fase 4 — salarios): SOLO SUPER_ADMIN; ADMIN explícitamente
 *      excluido (la barrera de privacidad es este whitelist — RLS no aplica);
 *      subconjunto de COBRANZA_ROLES (coherencia con el gate de la página).
 *
 * Correr: `npx vitest run lib/auth/cobranza-roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { isCobranzaRole, COBRANZA_ROLES, isCostosRole, COSTOS_ROLES } from "./cobranza-roles";

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

test("D — COSTOS_ROLES: solo SUPER_ADMIN; ADMIN excluido; subconjunto de COBRANZA_ROLES", () => {
  // Set exacto: SOLO dirección.
  expect([...COSTOS_ROLES]).toEqual(["SUPER_ADMIN"]);
  expect(isCostosRole("SUPER_ADMIN")).toBe(true);
  // El ADMIN (asistente de Finanzas) NO ve salarios ni caja neta — esta línea
  // ES la barrera de privacidad (Prisma bypassa RLS): si este test se rompe,
  // se rompió la privacidad.
  expect(isCostosRole("ADMIN")).toBe(false);
  for (const r of ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "", "super_admin", "SUPER_ADMIN "]) {
    expect(isCostosRole(r), r).toBe(false);
  }
  expect(isCostosRole(null)).toBe(false);
  expect(isCostosRole(undefined)).toBe(false);
  // Coherencia: quien ve costos tiene que poder ENTRAR al módulo (el redirect
  // de la página gatea por COBRANZA_ROLES antes que nada).
  for (const r of COSTOS_ROLES) {
    expect((COBRANZA_ROLES as readonly string[]).includes(r), r).toBe(true);
  }
});
