/**
 * lib/auth/roles.ts
 *
 * Capa LEGACY de permisos por rol (eje `roleEnum`) — hoy es una FACHADA sobre el
 * sistema de permisos sección×acción de lib/auth/permissions/ (registry + engine
 * + plantillas editables en /team). El otro eje, `area`, es solo para análisis
 * de sesiones y NO se decide acá.
 *
 * Cómo funciona desde la migración PERM (2026-07):
 *   - `requireCapability` (y sus wrappers guardCapability/withCapability, ~70
 *     call sites) consulta el mapa EFECTIVO del engine — DEFAULT_MATRIX (código)
 *     ← RolePermission (plantilla por rol, DB) ← TeamMember.permissionOverrides —
 *     traduciendo la capability a su celda vía CAPABILITY_TO_PERMISSION (compat.ts).
 *   - `hasCapability`/`capabilitiesFor` (sync) quedan @deprecated: miran SOLO el
 *     DEFAULT de código (no ven plantillas de DB ni overrides por usuario). Para
 *     decisiones reales usar el engine (can/requirePermission); para gating
 *     cosmético en UI usar useMe().permissions.
 *
 * La matriz default por rol vive en lib/auth/permissions/defaults.ts
 * (DEFAULT_MATRIX) — equivale celda a celda al comportamiento histórico; el test
 * de compat la congela.
 */
import type { TeamRole } from "@prisma/client";
import { requireInternalUser, ForbiddenError } from "./supabase";
import { CAPABILITY_TO_PERMISSION, capabilitiesFromPermissions } from "./permissions/compat";
import { DEFAULT_MATRIX } from "./permissions/defaults";
import { canCell } from "./permissions/engine";

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
  | "deleteTimeline"
  // REGENERAR/cambiar el cronograma CON IA una vez ya generado (agente de detalle /
  // "Pedir cambio con IA"). Por default CSL + SUPER_ADMIN. El resto (incluido el CSE)
  // genera el cronograma la PRIMERA vez y lo edita a MANO (editTimeline).
  | "regenerateTimeline";

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

/**
 * Etiqueta legible para UI. OJO: los VALORES del enum de DB no cambian (lección
 * REANCHOR: enum nuevo en filas rompe el prod viejo) — solo la etiqueta.
 */
export const ROLE_LABEL: Record<TeamRole, string> = {
  CSE: "CSE",
  VENTAS: "Sales",
  DEV: "Dev",
  CSL: "CSL",
  MARKETING: "Marketing",
  ADMIN: "Asistente administrativo",
  SUPER_ADMIN: "Super Admin",
};

/**
 * @deprecated Mira SOLO el DEFAULT de código — NO ve plantillas de DB ni
 * overrides por usuario. Para decisiones de acceso reales usar el engine
 * (lib/auth/permissions/engine.ts). Se conserva para checks sync legacy.
 */
export function hasCapability(role: TeamRole, cap: Capability): boolean {
  const cell = CAPABILITY_TO_PERMISSION[cap];
  if (!cell) return false;
  return DEFAULT_MATRIX[role]?.sections[cell.section]?.[cell.action] === true;
}

/**
 * @deprecated Derivadas del DEFAULT de código (sin DB/overrides). /api/me ya
 * expone las capacidades EFECTIVAS — esto queda para usos sync legacy.
 */
export function capabilitiesFor(role: TeamRole): ReadonlyArray<Capability> {
  const map = DEFAULT_MATRIX[role];
  return map ? capabilitiesFromPermissions(map) : [];
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
 * Consulta el mapa EFECTIVO (default ← plantilla DB ← overrides) vía compat.
 */
export async function requireCapability(cap: Capability) {
  const ctx = await requireInternalUser();
  const cell = CAPABILITY_TO_PERMISSION[cap];
  const ok = cell ? await canCell(ctx.teamMember, cell) : false;
  if (!ok) {
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
