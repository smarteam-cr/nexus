/**
 * lib/auth/permissions/registry.test.ts
 *
 * Integridad estructural del registry (fuente única de secciones×acciones):
 *   A) Sin claves duplicadas (secciones, y acciones dentro de cada sección).
 *   B) uniformMap/allTrueMap cubren TODA celda del registry (mapas completos).
 *   C) isKnownCell / sectionByKey: celdas reales sí, inventadas no.
 *   D) Toda sección tiene ≥1 acción y labels no vacíos (el modal no muestra vacío).
 *
 * Correr: `npx vitest run lib/auth/permissions/registry.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  PERMISSION_SECTIONS,
  allTrueMap,
  uniformMap,
  isKnownCell,
  sectionByKey,
} from "./registry";

test("A — sin claves duplicadas (secciones y acciones)", () => {
  const sectionKeys = PERMISSION_SECTIONS.map((s) => s.key);
  expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
  for (const s of PERMISSION_SECTIONS) {
    const actionKeys = s.actions.map((a) => a.key);
    expect(new Set(actionKeys).size, `acciones duplicadas en ${s.key}`).toBe(actionKeys.length);
  }
});

test("B — uniformMap/allTrueMap: toda celda del registry, valor uniforme", () => {
  const allFalse = uniformMap(false);
  const allTrue = allTrueMap();
  for (const s of PERMISSION_SECTIONS) {
    for (const a of s.actions) {
      expect(allFalse.sections[s.key][a.key]).toBe(false);
      expect(allTrue.sections[s.key][a.key]).toBe(true);
    }
  }
  // sin secciones de más
  expect(Object.keys(allTrue.sections).sort()).toEqual([...PERMISSION_SECTIONS.map((s) => s.key)].sort());
});

test("C — isKnownCell / sectionByKey", () => {
  expect(isKnownCell("cronograma", "regenerate")).toBe(true);
  expect(isKnownCell("clientes", "viewAll")).toBe(true);
  expect(isKnownCell("cronograma", "inventada")).toBe(false);
  expect(isKnownCell("finanzas", "read")).toBe(false); // módulo aún no registrado
  expect(sectionByKey("equipo")?.label).toBe("Equipo");
  expect(sectionByKey("nope")).toBeUndefined();
});

test("D — secciones con acciones y labels presentes", () => {
  for (const s of PERMISSION_SECTIONS) {
    expect(s.actions.length, `sección ${s.key} sin acciones`).toBeGreaterThan(0);
    expect(s.label.trim().length).toBeGreaterThan(0);
    for (const a of s.actions) expect(a.label.trim().length).toBeGreaterThan(0);
  }
});

test("E — cobranza.write sigue EXIGIÉNDOSE, no solo declarada", () => {
  /* ⚠ `enforced: false` significa «declarada pero ningún guard la consulta», y el switch ni
     aparece en /team (PermissionMatrix.tsx filtra por enforced). Con la celda apagada,
     `guardCobranzaEditor` queda de adorno: cualquiera con acceso de lectura podría revertir
     una factura y deshacer un cobro confirmado, que es el agujero que se vino a cerrar.

     Si alguien la vuelve a apagar, el guard no falla ni tira: simplemente deja pasar a todos.
     Por eso el test mira el registry y no el guard. */
  const cobranza = PERMISSION_SECTIONS.find((s) => s.key === "cobranza");
  expect(cobranza, "desapareció la sección cobranza").toBeDefined();
  const write = cobranza!.actions.find((a) => a.key === "write");
  expect(write, "desapareció la acción cobranza.write").toBeDefined();
  expect(write!.enforced, "cobranza.write volvió a estar apagada").toBe(true);
});
