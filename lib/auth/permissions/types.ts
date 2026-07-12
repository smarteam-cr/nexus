/**
 * lib/auth/permissions/types.ts — shapes del sistema de permisos. CLIENT-SAFE
 * (sin imports de server ni de Prisma runtime): lo consumen la UI (/team,
 * useMe) y el server (engine, guards).
 *
 * El modelo: matriz coarse SECCIÓN × ACCIÓN (qué módulos y qué verbos), con
 * precedencia DEFAULT_MATRIX (código) ← RolePermission (plantilla por rol, DB)
 * ← TeamMember.permissionOverrides (por usuario, sparse). El row-level (qué
 * CLIENTES ve cada uno) NO vive acá: sigue en lib/auth/access.ts
 * (GRANT/REVOKE/owner/canViewAllClients) — ortogonal a esta matriz.
 */

/**
 * Mapa de permisos serializable (Json en DB). `sections` puede ser COMPLETO
 * (plantillas: toda celda explícita) o SPARSE (overrides: solo celdas pineadas;
 * ausencia = hereda). Lectura SIEMPRE tolerante: claves desconocidas se
 * ignoran, `v !== 1` invalida el mapa entero (cae a la capa anterior).
 *
 * Type ALIAS a propósito (no interface): los aliases son asignables a
 * Prisma.InputJsonValue sin casts (las interfaces no tienen index signature implícita).
 */
export type PermissionMap = {
  v: 1;
  sections: { [sectionKey: string]: { [actionKey: string]: boolean } };
};

/** Una acción dentro de una sección (celda de la matriz). */
export interface ActionDef {
  key: string;
  /** Etiqueta para el modal de permisos (client-facing, tuteo neutro). */
  label: string;
  /**
   * `false` = la acción existe en el registry pero NINGÚN guard la consulta
   * todavía → el modal la OCULTA (nunca un switch mentiroso). Se flipea a
   * `true` recién cuando el enforcement real queda cableado.
   */
  enforced: boolean;
}

/** Una sección (módulo) seleccionable en el modal de permisos. */
export interface SectionDef {
  key: string;
  label: string;
  actions: readonly ActionDef[];
}
