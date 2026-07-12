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

/**
 * COSTOS + CAJA NETA (fase 4): SOLO dirección. Los salarios estimados son —
 * junto a los tokens de HubSpot — la información más sensible del sistema:
 * ADMIN (el asistente de Finanzas) NO entra ni por API. Enforcement en 3 capas
 * server-side: `guardCostosAccess` en cada endpoint, carga condicional en
 * app/cobranza/page.tsx (la query ni se ejecuta para otros roles) y filtrado
 * de tabs en CobranzaClient. RLS NO cuenta como capa acá: Prisma conecta con
 * rol BYPASSRLS — la privacidad interna es 100% estos guards.
 * Debe ser SIEMPRE un subconjunto de COBRANZA_ROLES (el gate de la página del
 * módulo corta antes) — hay un test que lo afirma.
 */
export const COSTOS_ROLES = ["SUPER_ADMIN"] as const;

/** ¿El roleEnum puede ver costos recurrentes y caja neta? */
export function isCostosRole(role: string | null | undefined): boolean {
  return !!role && (COSTOS_ROLES as readonly string[]).includes(role);
}
