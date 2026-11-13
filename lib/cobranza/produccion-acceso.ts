/**
 * lib/cobranza/produccion-acceso.ts — quién ve y quién toca la tabla del paso a producción (2026-11-13). PURO.
 *
 * La tabla vive en Cobranza pero la llenan otros: la CSL pone los responsables de cada proyecto (Alexander Vanegas),
 * Desarrollo confirma la producción (Alejandro Salas) y Finanzas la lee para arrancar el cobro. Ninguno de los dos
 * primeros tiene `cobranza.read`, y abrirles Cobranza entera para esto sería darles la plata de toda la cartera. Por eso
 * esta pantalla tiene su propia regla, y no muestra montos.
 *
 *  · Ver: quien ve Cobranza, la CSL, Super Admin y Desarrollo.
 *  · Cambiar los responsables: quien edita Cobranza, la CSL y Super Admin.
 *  · Confirmar la producción: la persona que la confirma en ese proyecto, la CSL y Super Admin.
 */

export const ROLES_QUE_VEN_PRODUCCION: readonly string[] = ["CSL", "SUPER_ADMIN", "DEV"];
const LIDERAN: readonly string[] = ["CSL", "SUPER_ADMIN"];

export interface QuienMira {
  rol: string;
  email: string;
  /** `cobranza.read` efectivo. */
  veCobranza: boolean;
  /** `cobranza.write` efectivo. */
  editaCobranza: boolean;
}

export const puedeVerProduccion = (q: QuienMira): boolean => q.veCobranza || ROLES_QUE_VEN_PRODUCCION.includes(q.rol);

export const puedeEditarResponsables = (q: QuienMira): boolean => q.editaCobranza || LIDERAN.includes(q.rol);

/** `confirma`: el correo de quien confirma la producción de ESE proyecto. */
export const puedeConfirmarProduccion = (q: QuienMira, confirma: string): boolean =>
  LIDERAN.includes(q.rol) || q.email.trim().toLowerCase() === confirma.trim().toLowerCase();
