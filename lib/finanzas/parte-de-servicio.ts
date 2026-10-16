/**
 * lib/finanzas/parte-de-servicio.ts — qué parte de lo facturado a un cliente es servicio de Smarteam y no licencia
 * revendida (2026-10-16). PURO.
 *
 * Decisión de Alex (16-oct): las licencias revendidas salen del punto de equilibrio y solo cuenta el servicio. Lo que
 * se cobra por la licencia se le paga a HubSpot; contarlo como ingreso inflaba el margen.
 *
 * ⚠ PROVISIONAL: mientras no exista en la base el porcentaje de servicio de cada contrato (etapa «Servicio y licencia»
 * del plan), los contratos conocidos viven acá. Hoy, kölbi, con los presupuestos de sus anexos (sin IVA):
 *  · Anexo 1.0, en dólares (página 17): licencias HubSpot + Infobip US$135.000; servicio US$19.300 + 5.000 + 2.400 de
 *    gestión = US$26.700 de US$161.700 → 16,5 %. Cada factura mensual de US$13.475 trae US$2.225 de servicio.
 *  · Anexo 2.0, en colones (página 23): licencias HubSpot Sales ₡84.495.000 + extensión de WhatsApp ₡6.000.000;
 *    servicio ₡40.500.000 + 5.000.000 + 2.500.000 de gestión = ₡48.000.000 de ₡138.495.000 → 34,7 %. Cada factura
 *    mensual de ₡11.541.250 trae ₡4.000.000 de servicio.
 * Fundauna, la UNA y Global Supply también revenden licencias; entran cuando se tenga su desglose.
 */

export interface ContratoConLicencias {
  cuentaId: string;
  moneda: string;
  /** Fracción de lo facturado que es servicio de Smarteam (0 a 1). */
  parte: number;
  fuente: string;
}

export const CONTRATOS_CON_LICENCIAS: readonly ContratoConLicencias[] = [
  { cuentaId: "cmv665y0n0000f4ijbo262y3q", moneda: "USD", parte: 26_700 / 161_700, fuente: "kölbi, Anexo 1.0, p. 17" },
  { cuentaId: "cmv665y0n0000f4ijbo262y3q", moneda: "CRC", parte: 48_000_000 / 138_495_000, fuente: "kölbi, Anexo 2.0, p. 23" },
];

/** La parte de servicio de un cobro de esa cuenta y moneda; 1 si no hay licencias conocidas. */
export function parteDeServicio(cuentaId: string, moneda: string): number {
  return CONTRATOS_CON_LICENCIAS.find((c) => c.cuentaId === cuentaId && c.moneda === moneda)?.parte ?? 1;
}
