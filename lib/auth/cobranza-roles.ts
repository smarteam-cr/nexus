/**
 * lib/auth/cobranza-roles.ts
 *
 * Roles con acceso al módulo COBRANZA (Admin & Finanzas). Fuente ÚNICA —
 * client-safe (SIN imports de server ni de Prisma), para poder usarla también
 * en Client Components como el Sidebar sin arrastrar código de servidor.
 *
 * La usan el guard de API (`guardCobranzaAccess` en api-guards.ts), el gate de
 * página (app/cobranza) y el boolean del Sidebar — mismo patrón anti-divergencia
 * que SALES_AREA_ROLES (cuando se sumó DEV, ~6 copias inline quedaron stale).
 *
 * ADMIN = el asistente administrativo de Finanzas (rol creado a la par del
 * módulo; se asigna cuando se contrate — SIEMPRE después del deploy del código).
 * Nadie más entra: la cartera de cobros es información sensible de Finanzas.
 */
export const COBRANZA_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

/** ¿El roleEnum tiene acceso al módulo Cobranza? */
export function isCobranzaRole(role: string | null | undefined): boolean {
  return !!role && (COBRANZA_ROLES as readonly string[]).includes(role);
}
