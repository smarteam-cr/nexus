/**
 * lib/auth/permissions/defaults.ts — DEFAULT_MATRIX + merge de precedencia. CLIENT-SAFE, puro.
 *
 * DEFAULT_MATRIX = el comportamiento ACTUAL EXACTO del sistema, celda por celda,
 * derivado de: la matriz CAPABILITIES histórica (lib/auth/roles.ts), las 3
 * whitelists de área (sales/marketing/cobranza-roles.ts), los arrays del Sidebar
 * y los withRole(SUPER_ADMIN) sueltos. Es el FALLBACK de código: con la tabla
 * RolePermission vacía o inválida, el sistema se comporta idéntico a siempre
 * (deploy-safe). El test de compat congela esta equivalencia.
 *
 * OJO: el delta operativo pedido por el usuario (DEV a solo-lectura en
 * handoff/kickoff/cronograma/procesos) NO vive acá — vive en la SEMILLA de la
 * DB (scripts/seed-role-permissions.ts). El default de código es compat exacta.
 *
 * Precedencia (computeEffective): DEFAULT_MATRIX[rol] ← plantilla del rol (DB)
 * ← overrides del usuario (sparse). SUPER_ADMIN = all-true SIEMPRE (anti-lockout:
 * ni la DB ni los overrides pueden recortarlo). Rol desconocido en runtime
 * (client Prisma viejo vs DB nueva) → all-false, defensivo.
 */
import type { TeamRole } from "@prisma/client";
import type { PermissionMap } from "./types";
import {
  PERMISSION_SECTIONS,
  allTrueMap,
  uniformMap,
  type ActionKeyOf,
  type SectionKey,
} from "./registry";

/** Acciones CONCEDIDAS por sección (las ausentes quedan en false). */
type Grants = { [S in SectionKey]?: readonly ActionKeyOf<S>[] };

/** Construye un mapa COMPLETO (toda celda explícita) desde la lista de concedidas. */
function grant(grants: Grants): PermissionMap {
  const map = uniformMap(false);
  for (const [section, actions] of Object.entries(grants) as [SectionKey, readonly string[]][]) {
    for (const action of actions) map.sections[section][action] = true;
  }
  return map;
}

export const DEFAULT_MATRIX: Record<TeamRole, PermissionMap> = {
  // CSE (scoped): edita el cronograma pero NO borra (suspende); genera kickoff/
  // procesos/cronograma en SUS clientes (el row-level lo acota access.ts);
  // NADA de handoff; lee Marketing (área universal).
  CSE: grant({
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "generate"],
    marketing: ["read"],
  }),
  // VENTAS: ve todo + handoff completo + cronograma (sin regenerar IA) + área
  // de Ventas + auditorías + agentes + conocimientos.
  VENTAS: grant({
    clientes: ["viewAll"],
    handoff: ["create", "write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate"],
    ventas: ["read", "write"],
    marketing: ["read"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
  }),
  // DEV ≡ VENTAS en el DEFAULT (invariante histórica del rol). El recorte a
  // solo-lectura pedido por el usuario va en la SEMILLA, no acá.
  DEV: grant({
    clientes: ["viewAll"],
    handoff: ["create", "write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate"],
    ventas: ["read", "write"],
    marketing: ["read"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
  }),
  // CSL: como super admin salvo gestión de equipo/administraciones; único rol
  // (junto a SA) que REGENERA el cronograma con IA y borra clientes.
  CSL: grant({
    clientes: ["viewAll", "share", "delete"],
    handoff: ["write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate", "regenerate"],
    ventas: ["read", "write"],
    marketing: ["read", "write"],
    conocimientos: ["write"],
    agentes: ["read"],
    auditoria: ["read"],
    configuracion: ["read"],
  }),
  // MARKETING: ≈ CSL pero sin borrar clientes, sin regenerar cronograma, sin
  // área de Ventas ni auditorías; editor del área de Marketing.
  MARKETING: grant({
    clientes: ["viewAll", "share"],
    handoff: ["write", "generate", "regenerate"],
    kickoff: ["generate", "regenerate"],
    desarrollo: ["generate", "regenerate"],
    procesos: ["generate", "regenerate"],
    cronograma: ["write", "delete", "generate"],
    marketing: ["read", "write"],
    conocimientos: ["write"],
    agentes: ["read"],
    configuracion: ["read"],
  }),
  // ADMIN (asistente administrativo, Finanzas): SOLO Cobranza + lectura de
  // Marketing (área universal). Cero acceso a clientes/artefactos.
  ADMIN: grant({
    marketing: ["read"],
    cobranza: ["read", "write"],
  }),
  // SUPER_ADMIN: all-true. El engine ni siquiera consulta esta fila (hardcodea
  // allTrueMap), pero se declara completa para hasCapability/capabilitiesFor sync.
  SUPER_ADMIN: allTrueMap(),
};

/**
 * Resuelve el mapa EFECTIVO de un rol: DEFAULT ← plantilla (DB) ← overrides.
 * Puro (testeable sin DB) — el engine le acerca las capas ya parseadas.
 * Solo celdas CONOCIDAS por el registry pisan el default (forward-compat:
 * cuando el registry crece, las claves nuevas caen al default de código).
 */
export function computeEffective(
  role: TeamRole,
  template: PermissionMap | null,
  overrides: PermissionMap | null,
): PermissionMap {
  // Anti-lockout: SUPER_ADMIN es all-true SIEMPRE, antes de mirar DB/overrides.
  if (role === "SUPER_ADMIN") return allTrueMap();

  const base = DEFAULT_MATRIX[role];
  // Rol desconocido (enum viejo en el client vs DB nueva) → sin permisos.
  const effective = base ? structuredClone(base) : uniformMap(false);
  if (!base) return effective;

  for (const layer of [template, overrides]) {
    if (!layer) continue;
    for (const s of PERMISSION_SECTIONS) {
      const layerSection = layer.sections?.[s.key];
      if (!layerSection) continue;
      for (const a of s.actions) {
        const v = layerSection[a.key];
        if (typeof v === "boolean") effective.sections[s.key][a.key] = v;
      }
    }
  }
  return effective;
}
