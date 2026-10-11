/**
 * lib/rentabilidad/acceso.ts — QUIÉN ve Rentabilidad y quién ve «Tu carga» (2026-10-07). PURO y CLIENT-SAFE.
 *
 * Decisión de Elías (respuestas del 2026-10-07): Rentabilidad es solo de dirección, o sea SUPER_ADMIN. Muestra el
 * costo de la hora de cada persona, sacado de la planilla, y el margen de cada cuenta. Revierte lo del 2026-10-06,
 * cuando también la veía la CSL. No se delega por plantilla: es un rol escrito acá.
 *
 * «Tu carga» es la cuarta pestaña de Rentabilidad pero vive en su propia ruta (`/tu-carga`): la abre quien lleva
 * cuentas (CSE y CSL) y solo muestra lo suyo, en horas, sin un monto. Dirección también la abre (ve la suya).
 *
 * ⚠ Lo vigila lib/auth/customer-success-propio.test.ts: la página de Rentabilidad pregunta esto antes de cargar.
 */

export const ROLES_DE_RENTABILIDAD = ["SUPER_ADMIN"] as const;

/** ¿Este rol ve Rentabilidad (margen, costo de la hora, contratación)? */
export function veRentabilidad(role: string | null | undefined): boolean {
  return !!role && (ROLES_DE_RENTABILIDAD as readonly string[]).includes(role);
}

/** Quienes llevan cuentas y por eso tienen una carga propia que mirar. */
export const ROLES_CON_CARGA_PROPIA = ["CSE", "CSL"] as const;

/** ¿Este rol abre «Tu carga»? Quien lleva cuentas, y dirección (que la ve como pestaña de Rentabilidad). */
export function veSuCarga(role: string | null | undefined): boolean {
  return !!role && ((ROLES_CON_CARGA_PROPIA as readonly string[]).includes(role) || veRentabilidad(role));
}
