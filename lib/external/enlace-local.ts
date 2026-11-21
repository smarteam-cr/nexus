/**
 * lib/external/enlace-local.ts — el enlace para el cliente, en la dirección desde la que se está mirando (2026-11-20).
 *
 * Los enlaces del cliente se arman en el servidor con `APP_URL`. En producción es la dirección pública y coincide con la
 * del navegador. En desarrollo, el `.env` dice `http://localhost:3004` (la instancia que habla con producción) aunque se
 * esté mirando el 3005 (la base local): «Ver como el cliente» abría el 3004, donde esos datos no existen. Si el enlace es
 * de `localhost`, se reescribe con el origen del navegador; cualquier otro enlace queda igual. Client-safe y puro.
 */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?=\/|$)/i;

export function enlaceEnEsteNavegador(enlace: string, origenDelNavegador: string | null | undefined): string {
  if (!origenDelNavegador || !LOCAL.test(enlace) || !LOCAL.test(origenDelNavegador)) return enlace;
  return enlace.replace(LOCAL, origenDelNavegador.replace(/\/+$/, ""));
}
