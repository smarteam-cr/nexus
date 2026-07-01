/**
 * lib/auth/sales-roles.ts
 *
 * Roles con acceso al ÁREA de Ventas / Business Cases. Fuente ÚNICA — client-safe
 * (SIN imports de server ni de Prisma), para poder usarla también en Client
 * Components como el Sidebar sin arrastrar código de servidor.
 *
 * La usan el guard de API (`guardSalesAccess` en api-guards.ts) y TODOS los gates
 * de página/UI del área de Ventas, para que no vuelvan a divergir: cuando se sumó
 * el rol DEV, quedaron ~6 copias inline de este whitelist desactualizadas que
 * dejaban a DEV fuera del área (bug de mal-autorización UI vs API).
 *
 * DEV entra porque su alcance es "idéntico a Ventas". CSE nunca; MARKETING tampoco.
 */
export const SALES_AREA_ROLES = ["VENTAS", "DEV", "CSL", "SUPER_ADMIN"] as const;

/** ¿El roleEnum tiene acceso al área de Ventas/Business Cases? */
export function isSalesAreaRole(role: string | null | undefined): boolean {
  return !!role && (SALES_AREA_ROLES as readonly string[]).includes(role);
}
