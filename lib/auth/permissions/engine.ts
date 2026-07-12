/**
 * lib/auth/permissions/engine.ts — resolución EFECTIVA de permisos. SERVER-ONLY
 * (importa Prisma; no importar desde Client Components — el registry/types/
 * compat son los archivos client-safe).
 *
 * Precedencia: DEFAULT_MATRIX (código) ← RolePermission (plantilla DB, cache
 * in-process TTL 60s) ← TeamMember.permissionOverrides (sparse, viene gratis
 * en la fila que ya carga requireInternalUser → +0 queries). SUPER_ADMIN =
 * all-true hardcodeado ANTES de mirar DB/overrides (anti-lockout).
 *
 * Costo: +1 query amortizada (TTL) por rol para la plantilla. Cache stale entre
 * instancias (dual-PC / prod multi-replica): ventana acotada de 60s, aceptable
 * para cambios de permisos; `invalidateRolePermissionCache` cubre la instancia
 * que escribe.
 */
import { prisma } from "@/lib/db/prisma";
import type { TeamRole } from "@prisma/client";
import { requireInternalUser, ForbiddenError } from "../supabase";
import type { PermissionMap } from "./types";
import { computeEffective } from "./defaults";
import { parsePermissionMapLoose } from "./schema";
import type { ActionKeyOf, PermissionCell, SectionKey } from "./registry";

/** Lo mínimo que el engine necesita del TeamMember (la fila completa lo cumple). */
export type PermissionSubject = {
  roleEnum: TeamRole;
  permissionOverrides?: unknown;
};

const TTL_MS = 60_000;
const templateCache = new Map<TeamRole, { at: number; map: PermissionMap | null }>();

/**
 * Plantilla del rol desde DB (cacheada TTL 60s). Fila ausente, Json inválido o
 * DB caída → null (el engine cae al DEFAULT de código — deploy-safe).
 */
export async function getRoleTemplate(role: TeamRole): Promise<PermissionMap | null> {
  const hit = templateCache.get(role);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;
  try {
    const row = await prisma.rolePermission.findUnique({ where: { role } });
    // findUnique NO lanza si la fila no existe (devuelve null) → cachear ese null es
    // correcto (rol sin plantilla = default puro). SOLO se cachean lecturas EXITOSAS.
    const map = row ? parsePermissionMapLoose(row.permissions) : null;
    templateCache.set(role, { at: Date.now(), map });
    return map;
  } catch (e) {
    // Error transitorio de DB: NO cachear. Cachear el null-por-error apagaría los
    // RECORTES de plantilla (ej. DEV solo-lectura) durante 60s = fail-open en authz.
    // Servimos el último valor bueno aunque esté vencido; si no hay, null puntual y
    // el próximo request reintenta.
    console.error("[permissions] fallo leyendo la plantilla del rol:", e);
    return hit ? hit.map : null;
  }
}

/** Invalida el cache de plantillas (de un rol o todo) — llamar tras escribir RolePermission. */
export function invalidateRolePermissionCache(role?: TeamRole) {
  if (role) templateCache.delete(role);
  else templateCache.clear();
}

/** Mapa EFECTIVO del usuario: default ← plantilla ← overrides (SA = all-true). */
export async function getEffectivePermissions(tm: PermissionSubject): Promise<PermissionMap> {
  if (tm.roleEnum === "SUPER_ADMIN") return computeEffective("SUPER_ADMIN", null, null);
  const template = await getRoleTemplate(tm.roleEnum);
  const overrides = parsePermissionMapLoose(tm.permissionOverrides ?? null);
  return computeEffective(tm.roleEnum, template, overrides);
}

/** ¿El usuario tiene la celda sección.acción concedida? (tipado contra el registry) */
export async function can<S extends SectionKey>(
  tm: PermissionSubject,
  section: S,
  action: ActionKeyOf<S>,
): Promise<boolean> {
  const eff = await getEffectivePermissions(tm);
  return eff.sections[section]?.[action] === true;
}

/** Variante para celdas dinámicas (compat, gates por agentGroup). */
export async function canCell(tm: PermissionSubject, cell: PermissionCell): Promise<boolean> {
  const eff = await getEffectivePermissions(tm);
  return eff.sections[cell.section]?.[cell.action] === true;
}

/**
 * Exige un usuario interno con la celda concedida. Lanza ForbiddenError (403).
 * Devuelve el bundle de requireInternalUser ({ user, teamMember, role }).
 */
export async function requirePermission<S extends SectionKey>(
  section: S,
  action: ActionKeyOf<S>,
) {
  const ctx = await requireInternalUser();
  if (!(await can(ctx.teamMember, section, action))) {
    throw new ForbiddenError(
      `Tu rol (${ctx.role}) no tiene el permiso requerido (${section}.${String(action)})`,
    );
  }
  return ctx;
}
