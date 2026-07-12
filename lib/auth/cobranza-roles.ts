/**
 * lib/auth/cobranza-roles.ts
 *
 * @deprecated ESPEJO CONGELADO (migración PERM 2026-07): el gate real del módulo
 * Cobranza es la celda `cobranza.read` del sistema de permisos (lib/auth/permissions
 * — default = esta misma lista, editable en /team). Ya nadie consulta esto en
 * runtime (guard, páginas y Sidebar migrados); queda como documentación del
 * default histórico junto a su test. ADMIN = asistente administrativo de Finanzas.
 */
export const COBRANZA_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

/** ¿El roleEnum tiene acceso al módulo Cobranza? */
export function isCobranzaRole(role: string | null | undefined): boolean {
  return !!role && (COBRANZA_ROLES as readonly string[]).includes(role);
}
