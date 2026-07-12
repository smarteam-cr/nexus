/**
 * lib/auth/permissions/compat.test.ts
 *
 * CONGELA la migración capabilities → matriz de permisos (el test anti-regresión
 * central de PERM-F2):
 *   A) Las 9 equivalencias de CAPABILITY_TO_PERMISSION, literal por literal.
 *   B) PARIDAD EXACTA: DEFAULT_MATRIX visto a través de compat === la matriz
 *      CAPABILITIES histórica (copia congelada acá — si alguien cambia el
 *      default de código, este test lo denuncia; el delta operativo va en la
 *      SEMILLA de DB, nunca en el default).
 *   C) capabilitiesFromPermissions: deriva bien desde un mapa efectivo.
 *
 * Correr: `npx vitest run lib/auth/permissions/compat.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import type { TeamRole } from "@prisma/client";
import type { Capability } from "../roles";
import { CAPABILITY_TO_PERMISSION, capabilitiesFromPermissions } from "./compat";
import { DEFAULT_MATRIX } from "./defaults";

test("A — las 9 equivalencias capability → celda, congeladas", () => {
  expect(CAPABILITY_TO_PERMISSION).toEqual({
    seeAllClients: { section: "clientes", action: "viewAll" },
    shareClients: { section: "clientes", action: "share" },
    deleteClients: { section: "clientes", action: "delete" },
    createHandoff: { section: "handoff", action: "create" },
    handoffAnywhere: { section: "handoff", action: "write" },
    editTimeline: { section: "cronograma", action: "write" },
    deleteTimeline: { section: "cronograma", action: "delete" },
    regenerateTimeline: { section: "cronograma", action: "regenerate" },
    manageTeam: { section: "equipo", action: "manage" },
  });
});

// Copia CONGELADA de la matriz CAPABILITIES histórica (lib/auth/roles.ts hasta
// la migración PERM 2026-07). Si este test falla, el DEFAULT de código dejó de
// ser compat exacta con el comportamiento pre-migración — averiguar por qué.
const FROZEN_CAPABILITIES: Record<TeamRole, Capability[]> = {
  CSE: ["editTimeline"],
  VENTAS: ["seeAllClients", "handoffAnywhere", "createHandoff", "editTimeline", "deleteTimeline"],
  DEV: ["seeAllClients", "handoffAnywhere", "createHandoff", "editTimeline", "deleteTimeline"],
  CSL: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients", "editTimeline", "deleteTimeline", "regenerateTimeline"],
  MARKETING: ["seeAllClients", "handoffAnywhere", "shareClients", "editTimeline", "deleteTimeline"],
  ADMIN: [],
  SUPER_ADMIN: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients", "manageTeam", "createHandoff", "editTimeline", "deleteTimeline", "regenerateTimeline"],
};

test("B — paridad exacta: DEFAULT_MATRIX vía compat === CAPABILITIES congelada", () => {
  const roles = Object.keys(FROZEN_CAPABILITIES) as TeamRole[];
  const caps = Object.keys(CAPABILITY_TO_PERMISSION) as Capability[];
  for (const role of roles) {
    for (const cap of caps) {
      const { section, action } = CAPABILITY_TO_PERMISSION[cap];
      const nuevo = DEFAULT_MATRIX[role].sections[section]?.[action] === true;
      const viejo = FROZEN_CAPABILITIES[role].includes(cap);
      expect(nuevo, `${role}.${cap} (${section}.${action})`).toBe(viejo);
    }
  }
});

test("C — capabilitiesFromPermissions deriva desde el mapa", () => {
  expect(capabilitiesFromPermissions(DEFAULT_MATRIX.CSE)).toEqual(["editTimeline"]);
  expect(capabilitiesFromPermissions(DEFAULT_MATRIX.ADMIN)).toEqual([]);
  expect([...capabilitiesFromPermissions(DEFAULT_MATRIX.CSL)].sort()).toEqual(
    [...FROZEN_CAPABILITIES.CSL].sort(),
  );
  // mapa sparse: solo lo concedido cuenta
  expect(
    capabilitiesFromPermissions({ v: 1, sections: { equipo: { manage: true } } }),
  ).toEqual(["manageTeam"]);
});
