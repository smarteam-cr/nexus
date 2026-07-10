/**
 * lib/auth/sales-roles.test.ts
 *
 * Tests del whitelist ÚNICO del área de Ventas / Business Cases
 * (isSalesAreaRole). Este whitelist estuvo duplicado inline en ~6 sitios que
 * quedaron stale al sumar el rol DEV → mal-autorización UI vs API; el test
 * fija la fuente única para que no vuelva a divergir. Casos:
 *   A) Incluye VENTAS, DEV, CSL y SUPER_ADMIN.
 *   B) Excluye CSE y MARKETING.
 *   C) Inputs no-rol: null / undefined / "" / basura / casing → false.
 *
 * Correr: `npx vitest run lib/auth/sales-roles.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import { isSalesAreaRole, SALES_AREA_ROLES } from "./sales-roles";

test("A — incluye VENTAS, DEV, CSL y SUPER_ADMIN", () => {
  expect(isSalesAreaRole("VENTAS")).toBe(true);
  expect(isSalesAreaRole("DEV")).toBe(true); // el que quedó afuera en las 6 copias stale
  expect(isSalesAreaRole("CSL")).toBe(true);
  expect(isSalesAreaRole("SUPER_ADMIN")).toBe(true);
  // el array exportado es exactamente ese set (nadie le metió extras)
  expect([...SALES_AREA_ROLES].sort()).toEqual(["CSL", "DEV", "SUPER_ADMIN", "VENTAS"]);
});

test("B — excluye CSE, MARKETING y ADMIN (Finanzas: solo Cobranza)", () => {
  expect(isSalesAreaRole("CSE")).toBe(false);
  expect(isSalesAreaRole("MARKETING")).toBe(false);
  expect(isSalesAreaRole("ADMIN")).toBe(false); // rol de Finanzas — no ve el área de Ventas
});

test("C — inputs no-rol: null / undefined / vacío / basura / casing → false", () => {
  expect(isSalesAreaRole(null)).toBe(false);
  expect(isSalesAreaRole(undefined)).toBe(false);
  expect(isSalesAreaRole("")).toBe(false);
  expect(isSalesAreaRole("ventas")).toBe(false); // case-sensitive a propósito (enum exacto)
  expect(isSalesAreaRole("VENTAS ")).toBe(false); // sin trims mágicos
});
