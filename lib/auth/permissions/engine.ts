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
 * Costo: la plantilla se cachea por rol y se valida contra una ÉPOCA global =
 * max(RolePermission.updatedAt), a su vez cacheada ~10s. Al editar cualquier
 * plantilla, su updatedAt sube → la época sube → TODAS las instancias (dual-PC /
 * prod multi-replica) invalidan sus plantillas cacheadas dentro de ~10s (no 60s),
 * con ≤1 query de agregación cada 10s por instancia (indep. del volumen de authz).
 * `invalidateRolePermissionCache` cubre inmediato la instancia que escribe.
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

// Cada entrada de plantilla se marca con la ÉPOCA global vigente al leerla; se considera
// fresca mientras la época no cambie. La época se refresca de la DB como mucho cada EPOCH_TTL.
const EPOCH_TTL_MS = 10_000;
const templateCache = new Map<TeamRole, { epoch: number; map: PermissionMap | null }>();
let epochCache: { at: number; value: number } = { at: 0, value: 0 };

/**
 * Época global de permisos = max(RolePermission.updatedAt) en ms (0 si no hay filas).
 * Cacheada EPOCH_TTL_MS para no pegarle a la DB en cada authz. Al escribir cualquier
 * plantilla su updatedAt sube → la época sube → todas las instancias re-leen sus plantillas.
 * DB caída → sirve el último valor conocido (no rompe authz; misma plantilla cacheada sigue).
 */
async function getPermissionsEpoch(): Promise<number> {
  if (Date.now() - epochCache.at < EPOCH_TTL_MS) return epochCache.value;
  try {
    const agg = await prisma.rolePermission.aggregate({ _max: { updatedAt: true } });
    const value = agg._max.updatedAt ? agg._max.updatedAt.getTime() : 0;
    epochCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[permissions] fallo leyendo la época de permisos:", e);
    return epochCache.value; // último valor conocido; NO invalida las plantillas cacheadas
  }
}

/**
 * Plantilla del rol desde DB, cacheada y validada contra la época global. Fila ausente,
 * Json inválido o DB caída → null (el engine cae al DEFAULT de código — deploy-safe).
 */
export async function getRoleTemplate(role: TeamRole): Promise<PermissionMap | null> {
  const epoch = await getPermissionsEpoch();
  const hit = templateCache.get(role);
  if (hit && hit.epoch === epoch) return hit.map;
  try {
    const row = await prisma.rolePermission.findUnique({ where: { role } });
    // findUnique NO lanza si la fila no existe (devuelve null) → cachear ese null es
    // correcto (rol sin plantilla = default puro). SOLO se cachean lecturas EXITOSAS.
    const map = row ? parsePermissionMapLoose(row.permissions) : null;
    templateCache.set(role, { epoch, map });
    return map;
  } catch (e) {
    // Error transitorio de DB: NO cachear. Cachear el null-por-error apagaría los RECORTES
    // de plantilla (ej. DEV solo-lectura) = fail-open en authz. Servimos el último valor bueno.
    console.error("[permissions] fallo leyendo la plantilla del rol:", e);
    return hit ? hit.map : null;
  }
}

/** Invalida el cache de plantillas (de un rol o todo) + fuerza re-leer la época — llamar tras
 *  escribir RolePermission. Cubre INMEDIATO la instancia que escribe (las demás, vía época ~10s). */
export function invalidateRolePermissionCache(role?: TeamRole) {
  if (role) templateCache.delete(role);
  else templateCache.clear();
  epochCache = { at: 0, value: epochCache.value }; // próximo getPermissionsEpoch re-consulta la DB
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
