/**
 * lib/observability/scrub.ts — EL TOKEN DEL ENLACE EXTERNO NO VIAJA A SENTRY.
 *
 * Auditoría 2026-09-03 (A-12): las URLs externas llevan el token en el path
 * (`/external/verify/<64 hex>`, `/external/propuesta/<64 hex>`), y ese token ES la llave de una
 * propuesta con precios o del cronograma de un cliente. Cada error que Sentry capturaba en esas
 * páginas se llevaba la URL puesta —en `request.url`, en la `transaction`, en el `request_path`
 * de Next y en cada breadcrumb de navegación o fetch— a un tercero, y ahí quedaba legible para
 * cualquiera con acceso al proyecto de Sentry. En el cliente y en el servidor por igual.
 *
 * Una sola función PURA que tacha toda cadena de 64 hex en TODO el evento, recorriéndolo entero
 * en vez de enumerar campos: la próxima ruta o el próximo integrador que meta la URL en `extra`
 * queda cubierto sin acordarse de nada. Los dos inits (`instrumentation-client.ts` e
 * `instrumentation.ts`) la cablean en `beforeSend` y `beforeBreadcrumb`.
 *
 * Sin dependencias a propósito: la consume el bundle del navegador y la prueba `lib/`. Los tipos
 * son estructurales (lo que Sentry manda es JSON plano) para no arrastrar `@sentry/nextjs` a un
 * módulo que tiene que ser trivialmente testeable.
 */

/** La forma del token externo (crypto.randomBytes(32) en hex). Un sha256 en hex también cae — no importa. */
export const TOKEN_EXTERNO_RE = /[a-f0-9]{64}/gi;

export const TOKEN_TACHADO = "[token]";

/** Profundidad máxima del recorrido: un evento de Sentry es JSON plano; esto solo evita un ciclo accidental. */
const PROFUNDIDAD_MAXIMA = 12;

export function tacharToken(texto: string): string {
  return texto.replace(TOKEN_EXTERNO_RE, TOKEN_TACHADO);
}

/**
 * Devuelve una copia del valor con toda cadena de 64 hex tachada, a cualquier profundidad.
 * Genérica por la forma: sirve para el evento entero, para un breadcrumb suelto o para un `extra`.
 */
export function tacharTokens<T>(valor: T, profundidad = 0): T {
  if (typeof valor === "string") return tacharToken(valor) as T;
  if (valor === null || typeof valor !== "object" || profundidad >= PROFUNDIDAD_MAXIMA) return valor;
  if (Array.isArray(valor)) return valor.map((v) => tacharTokens(v, profundidad + 1)) as T;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[k] = tacharTokens(v, profundidad + 1);
  }
  return salida as T;
}

/**
 * `beforeSend` / `beforeBreadcrumb` de Sentry: mismo objeto, sin tokens. Nunca descarta el evento
 * (devolver null lo silenciaría): el error tiene que llegar, sin la llave adentro.
 */
export function tacharTokensDelEvento<E>(evento: E): E {
  return tacharTokens(evento);
}
