/**
 * lib/cs/acceso.ts — QUIÉN entra a Éxito del cliente (2026-10-04). PURO y CLIENT-SAFE.
 *
 * Decisión de Elías: las dos pantallas (el índice y la ficha de cada cuenta) son de la líder de
 * Customer Success (rol CSL) y de dirección (SUPER_ADMIN). Nadie más, y no se delega por plantilla
 * de permisos: es una lista de roles escrita acá, como la de Roles (`esAdminDeRoles`).
 *
 * Revierte la apertura del 2026-08-16, cuando el área ganó la celda `customerSuccess.read` para
 * que el CSE entrara a ver sus cuentas. El motivo del cambio: el índice pasó a mostrar la cartera
 * entera en dinero (MRR gestionado, comisión, puntos de partner) y eso no es de cada CSE.
 *
 * ⚠ La lista la leen TRES lugares y tienen que decir lo mismo: las páginas, los endpoints de
 * `app/api/cs/*` que leen o escriben por cuenta, y el menú. Lo vigila
 * `lib/auth/customer-success-propio.test.ts`.
 */

export const ROLES_DE_EXITO_DEL_CLIENTE = ["CSL", "SUPER_ADMIN"] as const;

/** ¿Este rol entra a Éxito del cliente? */
export function esLiderDeCs(role: string | null | undefined): boolean {
  return !!role && (ROLES_DE_EXITO_DEL_CLIENTE as readonly string[]).includes(role);
}
