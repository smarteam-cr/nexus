/**
 * lib/jobs/turno-por-hora.ts — el turno de las copias de Odoo y Mercury y del cobro de lo pagado (2026-10-21). PURO.
 *
 * Hasta el 2026-10-21 corrían una vez al día, cerca de las 6:00 y las 7:00 de Costa Rica: lo que administración
 * conciliaba en Odoo a media mañana no se veía en Nexus hasta el día siguiente. Ahora corren cada hora, de la primera
 * hora de cada job hasta las 19:00 (`ULTIMA_HORA_DE_FINANZAS`). La clave del turno es el día y la hora de Costa Rica,
 * como `negocios-abiertos`.
 *
 * ⚠ Pasadas las 19:00 la clave sigue siendo la de las 19: un servidor que estuvo caído todo el día corre una vez de
 * noche y no cada hora de la madrugada.
 *
 * ⚠ Un fallo que no se arregla reintentando (la clave de Odoo rechazada, el token de Mercury muerto, una copia que
 * trajo la mitad) RETIENE el turno hasta mañana con `turnoRetenido`: cada hora contaría para el bloqueo por IP de Odoo
 * (10 fallos en Odoo 17), y 13 horas lo superan.
 */

/** La última hora de Costa Rica con turno propio. */
export const ULTIMA_HORA_DE_FINANZAS = 19;

/** La clave del turno de esta hora: `2026-10-21T09`. */
export function turnoDeLaHora(dateKey: string, hour: number, ultima: number = ULTIMA_HORA_DE_FINANZAS): string {
  return `${dateKey}T${String(Math.min(hour, ultima)).padStart(2, "0")}`;
}

/** La clave que deja un fallo que espera a mañana: ninguna hora de ese día la vuelve a tomar. */
export function turnoRetenido(dateKey: string): string {
  return `${dateKey}·retenido`;
}

/** ¿El job quedó retenido hoy? `ultimoTurno` = el `lastRunDateKey` de su fila. */
export function retenidoHoy(ultimoTurno: string | null | undefined, dateKey: string): boolean {
  return ultimoTurno === turnoRetenido(dateKey);
}
