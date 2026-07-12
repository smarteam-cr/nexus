/**
 * lib/auth/sales-roles.ts
 *
 * @deprecated ESPEJO CONGELADO (migración PERM 2026-07): el gate real del área de
 * Ventas es la celda `ventas.read` del sistema de permisos (lib/auth/permissions —
 * default = esta misma lista, editable por plantilla/overrides en /team). Ya NADIE
 * consulta esto en runtime (guards, páginas y Sidebar migrados); queda como
 * documentación del default histórico junto a su test. No sumar usos nuevos.
 */
export const SALES_AREA_ROLES = ["VENTAS", "DEV", "CSL", "SUPER_ADMIN"] as const;

/** ¿El roleEnum tiene acceso al área de Ventas/Business Cases? */
export function isSalesAreaRole(role: string | null | undefined): boolean {
  return !!role && (SALES_AREA_ROLES as readonly string[]).includes(role);
}
