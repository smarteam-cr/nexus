/**
 * lib/auth/marketing-roles.ts
 *
 * @deprecated ESPEJO CONGELADO (migración PERM 2026-07): el gate real de escritura
 * del área de Marketing es la celda `marketing.write` del sistema de permisos
 * (lib/auth/permissions — default = esta misma lista, editable en /team). La
 * LECTURA sigue siendo universal para todo rol interno. Ya nadie consulta esto en
 * runtime; queda como documentación del default histórico junto a su test.
 */
export const MARKETING_EDITOR_ROLES = ["MARKETING", "CSL", "SUPER_ADMIN"] as const;

/** ¿El roleEnum puede EDITAR el área de Marketing/Contenido? */
export function isMarketingEditor(role: string | null | undefined): boolean {
  return !!role && (MARKETING_EDITOR_ROLES as readonly string[]).includes(role);
}
