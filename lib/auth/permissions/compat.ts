/**
 * lib/auth/permissions/compat.ts — puente Capability legacy → celda de la matriz. CLIENT-SAFE.
 *
 * La clave anti-riesgo de la migración: `requireCapability`/`guardCapability`/
 * `withCapability` (~70 call sites) NO se tocan — sus ENTRAÑAS consultan el
 * engine traduciendo la capability vieja a su celda equivalente con esta tabla.
 * El test de compat congela las 9 equivalencias.
 */
import type { Capability } from "../roles";
import type { PermissionMap } from "./types";
import type { PermissionCell } from "./registry";

export const CAPABILITY_TO_PERMISSION: Record<Capability, PermissionCell> = {
  seeAllClients: { section: "clientes", action: "viewAll" },
  shareClients: { section: "clientes", action: "share" },
  deleteClients: { section: "clientes", action: "delete" },
  createHandoff: { section: "handoff", action: "create" },
  handoffAnywhere: { section: "handoff", action: "write" },
  editTimeline: { section: "cronograma", action: "write" },
  deleteTimeline: { section: "cronograma", action: "delete" },
  regenerateTimeline: { section: "cronograma", action: "regenerate" },
  manageTeam: { section: "equipo", action: "manage" },
};

/**
 * Capabilities legacy que un mapa de permisos CONCEDE — para exponer
 * `capabilities` en /api/me derivadas del mapa EFECTIVO (los overrides por
 * usuario se reflejan también en el gating cosmético legacy de la UI).
 */
export function capabilitiesFromPermissions(map: PermissionMap): Capability[] {
  return (Object.keys(CAPABILITY_TO_PERMISSION) as Capability[]).filter((cap) => {
    const { section, action } = CAPABILITY_TO_PERMISSION[cap];
    return map.sections?.[section]?.[action] === true;
  });
}
