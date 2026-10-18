/**
 * lib/comunicaciones/banderas.ts — las banderas del `.env` de las comunicaciones de HubSpot. PURO y sin imports: lo lee
 * también lib/jobs/requisitos.ts, que importan pantallas del navegador (Integraciones).
 */

export type Entorno = Readonly<Record<string, string | undefined>>;

/** La copia corre salvo `COMUNICACIONES_HUBSPOT_ENABLED=0`. */
export function copiaPrendida(env: Entorno): boolean {
  return env.COMUNICACIONES_HUBSPOT_ENABLED !== "0";
}

/** La lectura de compromisos de los correos corre salvo `COMPROMISOS_DE_CORREOS_ENABLED=0` (la copia sigue). */
export function compromisosPrendidos(env: Entorno): boolean {
  return env.COMPROMISOS_DE_CORREOS_ENABLED !== "0";
}

export const MOTIVO_COPIA_APAGADA = "Apagado a propósito: COMUNICACIONES_HUBSPOT_ENABLED=0 en el .env del servidor.";
