/**
 * lib/auth/roles.test.ts
 *
 * Tests de la matriz de PERMISOS por rol (hasCapability / capabilitiesFor /
 * roleRank / roleAtLeast — solo lo puro; los require* son async+DB y quedan
 * fuera de alcance). Casos:
 *   A) DEV ≡ VENTAS en capacidades (invariante del rol DEV, 2026-06-30).
 *   B) SUPER_ADMIN tiene TODAS las capacidades; manageTeam es exclusiva suya.
 *   C) CSE solo editTimeline (borra → suspende: NUNCA deleteTimeline).
 *   D) Spot-checks de la matriz: createHandoff / shareClients / deleteClients.
 *   E) Ranking lineal: CSE < VENTAS=DEV < CSL=MARKETING < SUPER_ADMIN.
 *   F) roleAtLeast: reflexivo, empates de rango en ambas direcciones, y gates.
 *   G) Rol desconocido en runtime (cast): defensivos ?? → false / [] / 0.
 *
 * NOTA: se mockea ./supabase (vi.mock) SOLO para cortar el import transitivo
 * de @/lib/db/prisma que arrastra roles.ts vía requireCapability/requireRole.
 * No se testea nada del mock — las funciones bajo test son puras.
 *
 * Correr: `npx vitest run lib/auth/roles.test.ts --project unit`.
 */
import { test, expect, vi } from "vitest";
import type { TeamRole } from "@prisma/client";

vi.mock("./supabase", () => ({
  requireInternalUser: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));

import {
  hasCapability,
  capabilitiesFor,
  roleRank,
  roleAtLeast,
  type Capability,
} from "./roles";

const ALL_CAPS: Capability[] = [
  "seeAllClients",
  "handoffAnywhere",
  "shareClients",
  "deleteClients",
  "manageTeam",
  "createHandoff",
  "editTimeline",
  "deleteTimeline",
];

const ALL_ROLES: TeamRole[] = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"];

test("A — DEV ≡ VENTAS: mismas capacidades, capacidad por capacidad", () => {
  for (const cap of ALL_CAPS) {
    expect(hasCapability("DEV", cap)).toBe(hasCapability("VENTAS", cap));
  }
  // y el set completo coincide (mismo contenido, sin extras ocultos)
  expect([...capabilitiesFor("DEV")].sort()).toEqual([...capabilitiesFor("VENTAS")].sort());
});

test("B — SUPER_ADMIN tiene TODAS; manageTeam es exclusiva suya", () => {
  for (const cap of ALL_CAPS) {
    expect(hasCapability("SUPER_ADMIN", cap)).toBe(true);
  }
  for (const role of ALL_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
    expect(hasCapability(role, "manageTeam")).toBe(false);
  }
});

test("B2 — ADMIN (Finanzas): CERO capacidades de la matriz — su acceso es SOLO Cobranza (whitelist)", () => {
  expect(capabilitiesFor("ADMIN")).toEqual([]);
  for (const cap of ALL_CAPS) {
    expect(hasCapability("ADMIN", cap)).toBe(false);
  }
});

test("C — CSE: solo editTimeline (nunca borra, suspende)", () => {
  expect(capabilitiesFor("CSE")).toEqual(["editTimeline"]);
  expect(hasCapability("CSE", "editTimeline")).toBe(true);
  expect(hasCapability("CSE", "deleteTimeline")).toBe(false);
  expect(hasCapability("CSE", "seeAllClients")).toBe(false);
});

test("D — spot-checks de la matriz: createHandoff / shareClients / deleteClients", () => {
  // createHandoff: VENTAS, DEV y SUPER_ADMIN sí; CSL y MARKETING no
  expect(hasCapability("VENTAS", "createHandoff")).toBe(true);
  expect(hasCapability("DEV", "createHandoff")).toBe(true);
  expect(hasCapability("CSL", "createHandoff")).toBe(false);
  expect(hasCapability("MARKETING", "createHandoff")).toBe(false);
  // shareClients: CSL, MARKETING y SUPER_ADMIN sí; VENTAS/DEV no
  expect(hasCapability("CSL", "shareClients")).toBe(true);
  expect(hasCapability("MARKETING", "shareClients")).toBe(true);
  expect(hasCapability("VENTAS", "shareClients")).toBe(false);
  expect(hasCapability("DEV", "shareClients")).toBe(false);
  // deleteClients: SOLO CSL y SUPER_ADMIN (MARKETING NO — difiere de CSL acá)
  expect(hasCapability("CSL", "deleteClients")).toBe(true);
  expect(hasCapability("MARKETING", "deleteClients")).toBe(false);
});

test("E — ranking lineal: CSE < VENTAS=DEV < CSL=MARKETING < SUPER_ADMIN", () => {
  expect(roleRank("CSE")).toBe(1);
  expect(roleRank("VENTAS")).toBe(2);
  expect(roleRank("DEV")).toBe(2); // DEV empata con VENTAS
  expect(roleRank("CSL")).toBe(3);
  expect(roleRank("MARKETING")).toBe(3); // MARKETING empata con CSL
  expect(roleRank("SUPER_ADMIN")).toBe(4);
  expect(roleRank("CSE")).toBeLessThan(roleRank("VENTAS"));
  expect(roleRank("DEV")).toBeLessThan(roleRank("CSL"));
  expect(roleRank("MARKETING")).toBeLessThan(roleRank("SUPER_ADMIN"));
});

test("F — roleAtLeast: reflexivo, empates en ambas direcciones, gates", () => {
  // reflexivo
  expect(roleAtLeast("VENTAS", "VENTAS")).toBe(true);
  // empate de rango: DEV pasa un gate de VENTAS y viceversa
  expect(roleAtLeast("DEV", "VENTAS")).toBe(true);
  expect(roleAtLeast("VENTAS", "DEV")).toBe(true);
  expect(roleAtLeast("MARKETING", "CSL")).toBe(true); // mismo rango 3
  // gates que cortan
  expect(roleAtLeast("CSE", "VENTAS")).toBe(false);
  expect(roleAtLeast("DEV", "CSL")).toBe(false);
  expect(roleAtLeast("CSL", "SUPER_ADMIN")).toBe(false);
  // SUPER_ADMIN pasa cualquier gate
  for (const min of ALL_ROLES) {
    expect(roleAtLeast("SUPER_ADMIN", min)).toBe(true);
  }
});

test("G — rol desconocido en runtime: defensivos → false / [] / 0", () => {
  // Simula un enum viejo en el client Prisma vs DB nueva (caso real del deploy DEV)
  const bogus = "INTERN" as TeamRole;
  expect(hasCapability(bogus, "editTimeline")).toBe(false);
  expect(capabilitiesFor(bogus)).toEqual([]);
  expect(roleRank(bogus)).toBe(0);
  expect(roleAtLeast(bogus, "CSE")).toBe(false); // 0 < 1
});
