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
  "comisiones-hubspot-estimado": "La comisión estimada de HubSpot",
  "cs-watchdog-daily": "El vigía de Éxito del cliente",
  "cs-watchdog-debounce": "La revisión de eventos del vigía de Éxito del cliente",
  "maintenance-daily": "El mantenimiento diario",
  "cobranza-quincenal": "El corte de cobranza",
  "google-meet-sync": "La copia de las reuniones de Google Meet",
  "google-enrich-retry": "El reintento de las reuniones de Google Meet",
  "google-meet-conferencias": "La revisión de las conferencias de Google Meet",
  "google-meet-eventos": "Los avisos de Google Meet",
  "google-meet-suscripciones": "Las suscripciones a los avisos de Google Meet",
  "seguimiento-reuniones": "La lectura de cada reunión",
  "ventas-ganadas-daily": "La copia de ventas ganadas",
  "negocios-abiertos": "La copia de los negocios abiertos",
  "contactos-y-tickets": "La copia de los contactos y tickets de HubSpot",
  "empresa-copia-de-hubspot": "La copia de los datos de las empresas de HubSpot",
  "comunicaciones-hubspot": "La copia de los correos, notas y llamadas de HubSpot",
  "indice-de-reuniones": "La búsqueda en las reuniones",
  "tareas-hubspot": "Las tareas de HubSpot",
  "tareas-sprint": "Las reuniones de sprint de cada equipo",
  "odoo-espejo-daily": "La copia de Odoo",
  "mercury-espejo-daily": "La copia de Mercury",
  "tipo-cambio-daily": "La copia del tipo de cambio del BCCR",
  "planilla-quincena-daily": "La quincena de planilla en curso",
  "licencias-renovacion-daily": "El aviso de renovaciones de licencias",
  "adopcion-recordatorios-daily": "El recordatorio de revisar la adopción",
  "tareas-semana-lunes": "El mantenimiento de las tareas del lunes",
  "rentabilidad-foto-mensual": "La foto del margen del mes",
  "rentabilidad-lectura-mensual": "La lectura de los números del mes",
  "lo-pagado-daily": "El cobro de lo pagado en Odoo y Mercury",
  "invariants-daily": "La revisión diaria de la base",
  "ia-lotes": "Los pedidos a Claude por lote",
  "titulos-cortos": "El nombre corto de las tareas",
  "reuniones-motivos": "El motivo de las reuniones sin texto",
  "reuniones-propuestas": "La empresa que propone Nexus para las reuniones sin empresa",
  "reuniones-audio": "La transcripción del audio de las reuniones presenciales",
  "hubspot-eventos": "Los avisos de HubSpot",
  "hubspot-fusiones": "La búsqueda de las fusiones de HubSpot",
  "hubspot-leads": "La copia de los leads de HubSpot",
  "hubspot-proyectos": "La sincronización diaria de los proyectos de HubSpot",
  "jobs-vigia": "El vigía de los jobs que dejan de correr",
};

/** El nombre legible del job; si no lo tiene, su clave (nunca se descarta en silencio). */
export function nombreDeJob(clave: string): string {
  return NOMBRE_DE_JOB[clave] ?? clave;
}
