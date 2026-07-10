/**
 * lib/auth/roles.ts
 *
 * Fuente de verdad de PERMISOS por rol (eje `roleEnum`). El otro eje, `area`,
 * es solo para análisis de sesiones y NO se decide acá.
 *
 * Matriz de capacidades (fuente real = el objeto CAPABILITIES más abajo):
 *   | capacidad        | CSE | VENTAS | DEV | CSL | MARKETING | ADMIN | SUPER_ADMIN |
 *   | seeAllClients    |  ✗  |   ✓    |  ✓  |  ✓  |     ✓     |   ✗   |      ✓      |
 *   | handoffAnywhere  |  ✗  |   ✓    |  ✓  |  ✓  |     ✓     |   ✗   |      ✓      |
 *   | createHandoff    |  ✗  |   ✓    |  ✓  |  ✗  |     ✗     |   ✗   |      ✓      |
 *   | shareClients     |  ✗  |   ✗    |  ✗  |  ✓  |     ✓     |   ✗   |      ✓      |
 *   | deleteClients    |  ✗  |   ✗    |  ✗  |  ✓  |     ✗     |   ✗   |      ✓      |
 *   | manageTeam       |  ✗  |   ✗    |  ✗  |  ✗  |     ✗     |   ✗   |      ✓      |
 *   | editTimeline     |  ✓  |   ✓    |  ✓  |  ✓  |     ✓     |   ✗   |      ✓      |
 *   | deleteTimeline   |  ✗  |   ✓    |  ✓  |  ✓  |     ✓     |   ✗   |      ✓      |
 *
 * CSE es el único "scoped" (ve solo sus clientes asignados + compartidos).
 * MARKETING ≡ CSL en capacidades (etiqueta distinta). DEV ≡ VENTAS en capacidades
 * (rol técnico: ve todo + cronogramas + handoffs; + acceso al área de Ventas).
 * ADMIN (asistente administrativo de Finanzas) tiene CERO capacidades de esta
 * matriz: su ÚNICO acceso es el módulo Cobranza, gateado por la whitelist
 * lib/auth/cobranza-roles.ts (no por capability — mismo patrón que el área Ventas).
 * SUPER_ADMIN es el único que gestiona el equipo.
 */
import type { TeamRole } from "@prisma/client";
import { requireInternalUser, ForbiddenError } from "./supabase";

export type Capability =
  | "seeAllClients"
  | "handoffAnywhere"
  | "shareClients"
  | "deleteClients"
  | "manageTeam"
  | "createHandoff"
  // editar/mover/agregar tareas y estructura del cronograma. La tiene TODO interno
  // (incluido el CSE). Lo único que el CSE NO puede es BORRAR (ver `deleteTimeline`):
  // borra → suspende.
  | "editTimeline"
  // BORRAR tareas/fases/cronograma. El CSE NO la tiene (solo suspende). CSL = como super admin.
  | "deleteTimeline";

const CAPABILITIES: Record<TeamRole, ReadonlyArray<Capability>> = {
  CSE: ["editTimeline"],
  VENTAS: ["seeAllClients", "handoffAnywhere", "createHandoff", "editTimeline", "deleteTimeline"],
  // DEV (equipo técnico) = mismas capacidades que VENTAS. Ver la matriz arriba.
  DEV: ["seeAllClients", "handoffAnywhere", "createHandoff", "editTimeline", "deleteTimeline"],
  CSL: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients", "editTimeline", "deleteTimeline"],
  MARKETING: ["seeAllClients", "handoffAnywhere", "shareClients", "editTimeline", "deleteTimeline"],
  // ADMIN (Finanzas): CERO capacidades de la matriz — su único acceso es Cobranza,
  // gateado por COBRANZA_ROLES (lib/auth/cobranza-roles.ts), no por capability.
  ADMIN: [],
  SUPER_ADMIN: ["seeAllClients", "handoffAnywhere", "shareClients", "deleteClients", "manageTeam", "createHandoff", "editTimeline", "deleteTimeline"],
};

/** Rango lineal — para gates simples de "rol mínimo". */
export const ROLE_RANK: Record<TeamRole, number> = {
  ADMIN: 1, // scoped a Cobranza — no "supera" a nadie en los gates por rango
  CSE: 1,
  VENTAS: 2,
  DEV: 2,
  CSL: 3,
  MARKETING: 3,
  SUPER_ADMIN: 4,
};

/** Etiqueta legible para UI. */
export const ROLE_LABEL: Record<TeamRole, string> = {
  CSE: "CSE",
  VENTAS: "Ventas",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  ADMIN: "Admin",
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
