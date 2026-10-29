/**
 * lib/tests-diagnostico/reintentos.ts — cuántas veces se le reintenta a HubSpot un intento del test. PURO.
 *
 * Vive aparte de la tanda (hubspot-server.ts, que es de servidor) para poder probar la regla del último intento: si se
 * corriera, el formulario nunca saldría (el lead no llega a HubSpot) o saldría solo con el correo ante una falla
 * pasajera (un lead nuevo quedaría para siempre sin nombre ni empresa).
 */

/** A los `MAX_INTENTOS_HUBSPOT` se deja de reintentar solo. */
export const MAX_INTENTOS_HUBSPOT = 8;

/**
 * ¿El intento que está por hacerse es el último? `hechos` son los que ya fallaron (`hubspotIntentos`). En el último, si
 * no se pudo saber si la persona ya era contacto, el formulario sale igual, solo con el correo: llegar sin datos es
 * mejor que no llegar.
 */
export function esElUltimoIntento(hechos: number): boolean {
  return hechos + 1 >= MAX_INTENTOS_HUBSPOT;
}
