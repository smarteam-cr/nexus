/**
 * lib/auth/permissions/defaults.test.ts
 *
 * DEFAULT_MATRIX + computeEffective (el corazón puro del engine):
 *   A) DEFAULT_MATRIX: los 7 roles presentes y cada mapa COMPLETO (toda celda).
 *   B) Precedencia: default ← plantilla ← override (el override gana; la
 *      plantilla pisa el default; celdas ausentes heredan).
 *   C) Anti-lockout: SUPER_ADMIN = all-true aunque plantilla/overrides digan false.
 *   D) Rol desconocido en runtime (enum viejo) → all-false defensivo.
 *   E) Capas null (fila ausente / Json inválido ya parseado a null) → default puro.
 *   F) computeEffective no muta DEFAULT_MATRIX (clone real).
 *
 * Correr: `npx vitest run lib/auth/permissions/defaults.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import type { TeamRole } from "@prisma/client";
import type { PermissionMap } from "./types";
import { PERMISSION_SECTIONS } from "./registry";
import { DEFAULT_MATRIX, computeEffective } from "./defaults";

const ALL_ROLES: TeamRole[] = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"];

test("A — DEFAULT_MATRIX: 7 roles, mapas completos (toda celda explícita)", () => {
  expect(Object.keys(DEFAULT_MATRIX).sort()).toEqual([...ALL_ROLES].sort());
  for (const role of ALL_ROLES) {
    const map = DEFAULT_MATRIX[role];
    expect(map.v).toBe(1);
    for (const s of PERMISSION_SECTIONS) {
      for (const a of s.actions) {
        expect(
          typeof map.sections[s.key]?.[a.key],
          `${role}.${s.key}.${a.key} debe ser boolean explícito`,
        ).toBe("boolean");
      }
    }
  }
});

test("B — precedencia default ← plantilla ← override", () => {
  // CSE por default: cronograma.write=true, cronograma.regenerate=false, handoff.write=false
  const template: PermissionMap = {
    v: 1,
    sections: { cronograma: { write: false }, handoff: { write: true } },
  };
  const override: PermissionMap = {
    v: 1,
    sections: { cronograma: { write: true, regenerate: true } },
  };

  // Solo plantilla: pisa el default en sus celdas, hereda el resto.
  const conPlantilla = computeEffective("CSE", template, null);
  expect(conPlantilla.sections.cronograma.write).toBe(false); // plantilla pisó
  expect(conPlantilla.sections.handoff.write).toBe(true); // plantilla pisó
  expect(conPlantilla.sections.cronograma.generate).toBe(true); // heredado del default
  expect(conPlantilla.sections.clientes.viewAll).toBe(false); // heredado del default

  // Plantilla + override: el override gana sobre la plantilla.
  const conAmbas = computeEffective("CSE", template, override);
  expect(conAmbas.sections.cronograma.write).toBe(true); // override ganó a la plantilla
  expect(conAmbas.sections.cronograma.regenerate).toBe(true); // override pineó
  expect(conAmbas.sections.handoff.write).toBe(true); // plantilla (override no la tocó)
});

test("C — anti-lockout: SUPER_ADMIN es all-true pase lo que pase", () => {
  const malicioso: PermissionMap = {
    v: 1,
    sections: { equipo: { manage: false }, clientes: { viewAll: false } },
  };
  const eff = computeEffective("SUPER_ADMIN", malicioso, malicioso);
  for (const s of PERMISSION_SECTIONS) {
    for (const a of s.actions) {
      expect(eff.sections[s.key][a.key], `SA.${s.key}.${a.key}`).toBe(true);
    }
  }
});

test("D — rol desconocido (enum viejo en runtime) → all-false", () => {
  const bogus = "INTERN" as TeamRole;
  const eff = computeEffective(bogus, { v: 1, sections: { equipo: { manage: true } } }, null);
  for (const s of PERMISSION_SECTIONS) {
    for (const a of s.actions) expect(eff.sections[s.key][a.key]).toBe(false);
  }
});

test("E — capas null → default puro (deploy-safe con tabla vacía)", () => {
  const eff = computeEffective("VENTAS", null, null);
  expect(eff).toEqual(DEFAULT_MATRIX.VENTAS);
});

test("F — computeEffective NO muta DEFAULT_MATRIX", () => {
  const antes = structuredClone(DEFAULT_MATRIX.CSE);
  computeEffective("CSE", { v: 1, sections: { cronograma: { write: false } } }, null);
  expect(DEFAULT_MATRIX.CSE).toEqual(antes);
});
