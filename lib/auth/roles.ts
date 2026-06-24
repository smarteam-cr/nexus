/**
 * lib/auth/roles.ts
 *
 * Fuente de verdad de PERMISOS por rol (eje `roleEnum`). El otro eje, `area`,
 * es solo para análisis de sesiones y NO se decide acá.
 *
 * Matriz de capacidades:
 *   | capacidad        | CSE | VENTAS | CSL | MARKETING | SUPER_ADMIN |
 *   | seeAllClients    |  ✗  |   ✓    |  ✓  |     ✓     |      ✓      |
 *   | handoffAnywhere  |  ✗  |   ✓    |  ✓  |     ✓     |      ✓      |
 *   | shareClients     |  ✗  |   ✗    |  ✓  |     ✓     |      ✓      |
 *   | deleteClients    |  ✗  |   ✗    |  ✓  |     ✗     |      ✓      |
 *   | manageTeam       |  ✗  |   ✗    |  ✗  |     ✗     |      ✓      |
 *
 * CSE es el único "scoped" (ve solo sus clientes asignados + compartidos).
 * MARKETING ≡ CSL en capacidades (etiqueta distinta). SUPER_ADMIN es el único
 * que gestiona el equipo.
 */
import type { TeamRole } from "@prisma/client";
import { requireInternalUser, ForbiddenError } from "./supabase";

export type Capability =
  | "seeAllClients"
  | "handoffAnywhere"
  | "shareClients"
  | "deleteClients"
  | "manageTeam"
  | "createHandoff";

const CAPABILITIES: Record<TeamRole, ReadonlyArray<Capability>> = {
  CSE: [],
  VENTAS: ["seeAllClients", "handoffAnywhere", "createHandoff"],
  CSL: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients"],
  MARKETING: ["seeAllClients", "handoffAnywhere", "shareClients"],
  SUPER_ADMIN: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients", "manageTeam", "createHandoff"],
};

/** Rango lineal — para gates simples de "rol mínimo". */
export const ROLE_RANK: Record<TeamRole, number> = {
  CSE: 1,
  VENTAS: 2,
  CSL: 3,
  MARKETING: 3,
  SUPER_ADMIN: 4,
};

/** Etiqueta legible para UI. */
export const ROLE_LABEL: Record<TeamRole, string> = {
  CSE: "CSE",
  VENTAS: "Ventas",
  CSL: "CSL",
  MARKETING: "Marketing",
  SUPER_ADMIN: "Super Admin",
};

export function hasCapability(role: TeamRole, cap: Capability): boolean {
  return CAPABILITIES[role]?.includes(cap) ?? false;
}

/** Lista de capacidades del rol (para exponer al cliente, ej. /api/me). */
export function capabilitiesFor(role: TeamRole): ReadonlyArray<Capability> {
  return CAPABILITIES[role] ?? [];
}

export function roleRank(role: TeamRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function roleAtLeast(role: TeamRole, min: TeamRole): boolean {
  return roleRank(role) >= roleRank(min);
}

/**
 * Exige un usuario interno con la capacidad dada. Lanza ForbiddenError (403).
 * Devuelve el bundle de requireInternalUser ({ user, teamMember, role }).
 */
export async function requireCapability(cap: Capability) {
  const ctx = await requireInternalUser();
  if (!hasCapability(ctx.role, cap)) {
    throw new ForbiddenError(`Tu rol (${ctx.role}) no tiene el permiso requerido`);
  }
  return ctx;
}

/** Exige un rol mínimo (por rango). Lanza ForbiddenError (403). */
export async function requireRole(min: TeamRole) {
  const ctx = await requireInternalUser();
  if (!roleAtLeast(ctx.role, min)) {
    throw new ForbiddenError(`Se requiere un rol de al menos ${min}`);
  }
  return ctx;
}
