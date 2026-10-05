/**
 * lib/jobs/nombres.ts — EL NOMBRE LEGIBLE DE CADA JOB DEL SERVIDOR. Puro, sin imports.
 *
 * Lo usa «Para ti» para decir QUÉ falló («La copia de Odoo falló», no «odoo-espejo-daily»).
 *
 * ⚠ Hasta el 2026-10-05 este mapa vivía escrito a mano en lib/para-ti/fuentes/equipo-y-sistema.ts y un job que no
 * estaba en él se DESCARTABA en silencio: faltaban `tipo-cambio-daily`, `google-enrich-retry` y
 * `cs-watchdog-debounce`, así que su fallo nunca llegaba a nadie. Ahora:
 *   · cada job de `allJobs()` (lib/jobs/defs.ts) tiene que estar acá — lo exige lib/jobs/defs.test.ts;
 *   · y si aun así falta uno, `nombreDeJob` devuelve su clave: un nombre feo, pero el aviso sale.
 *
 * Los nombres van en singular: la fuente arma «<nombre> falló».
 */
export const NOMBRE_DE_JOB: Readonly<Record<string, string>> = {
  "marketing-weekly": "La tanda de Marketing",
  "cs-signals-daily": "La lectura de señales de Éxito del cliente",
  "cs-partner-daily": "La copia de HubSpot Partner",
  "cs-watchdog-daily": "El vigía de Éxito del cliente",
  "cs-watchdog-debounce": "La revisión de eventos del vigía de Éxito del cliente",
  "maintenance-daily": "El mantenimiento diario",
  "cobranza-quincenal": "El corte de cobranza",
  "google-enrich-retry": "El reintento de las reuniones de Google Meet",
  "ventas-ganadas-daily": "La copia de ventas ganadas",
  "odoo-espejo-daily": "La copia de Odoo",
  "mercury-espejo-daily": "La copia de Mercury",
  "tipo-cambio-daily": "La copia del tipo de cambio del BCCR",
  "licencias-renovacion-daily": "El aviso de renovaciones de licencias",
  "invariants-daily": "La revisión diaria de la base",
};

/** El nombre legible del job; si no lo tiene, su clave (nunca se descarta en silencio). */
export function nombreDeJob(clave: string): string {
  return NOMBRE_DE_JOB[clave] ?? clave;
}
