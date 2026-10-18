/**
 * lib/cobranza/firma-del-sistema.ts — quién firma un cobro que el sistema cobró solo (2026-10-18). PURO, sin imports.
 *
 * Decisión de Elías del 18-oct sobre docs/finanzas-simplificacion.md: lo que Odoo y Mercury dan por pagado y conciliado
 * con el banco se cobra solo, cada día, sin la firma de una persona (Alex, 16-oct: «definitivo»). El cobro igual queda
 * firmado (INV3: COBRADO ⇒ `confirmadoPor`), pero por el SISTEMA y diciendo de dónde salió: `sistema:odoo` o
 * `sistema:mercury`. INV25 acepta exactamente estas dos firmas, y solo con la factura pagada en la copia como evidencia.
 *
 * ⚠ Cualquier otra firma de máquina (`odoo`, `sync`, `cron`, otro `sistema:…`) sigue prohibida: es la forma de un UPDATE
 * a mano que «destraba» cobros sin evidencia.
 */

export const FIRMA_DEL_SISTEMA = { ODOO: "sistema:odoo", MERCURY: "sistema:mercury" } as const;

export type FuenteDeLaFirma = keyof typeof FIRMA_DEL_SISTEMA;

/** ¿La firma es la de un cobro que el sistema cobró solo? */
export function esFirmaDelSistema(firma: string | null | undefined): boolean {
  return firma === FIRMA_DEL_SISTEMA.ODOO || firma === FIRMA_DEL_SISTEMA.MERCURY;
}

/** De qué copia salió el cobro automático, o null si la firma no es del sistema. */
export function fuenteDeLaFirma(firma: string | null | undefined): FuenteDeLaFirma | null {
  if (firma === FIRMA_DEL_SISTEMA.ODOO) return "ODOO";
  if (firma === FIRMA_DEL_SISTEMA.MERCURY) return "MERCURY";
  return null;
}

/** Cómo se lee la firma en pantalla y en la bitácora: «el sistema, con lo que dice Odoo», o el correo de la persona. */
export function nombreDeLaFirma(firma: string | null | undefined): string {
  const fuente = fuenteDeLaFirma(firma);
  if (fuente === "ODOO") return "el sistema, con lo que dice Odoo (pagada y conciliada con el banco)";
  if (fuente === "MERCURY") return "el sistema, con lo que dice Mercury (pagada, con su entrada de plata)";
  return firma ?? "";
}
