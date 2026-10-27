/**
 * lib/exploraciones/test-de-marketing.ts — leer el resultado del test de marketing. PURO.
 *
 * El lector vive en lib/tests-diagnostico/enlace-leido.ts desde el 2026-10-26 (O6 etapa 1: la página que reabre un
 * resultado viejo es del cliente y no puede importar la exploración). Acá quedan los nombres que usa la exploración y
 * las propiedades del contacto donde HubSpot guarda la dirección.
 *
 * ⚠ Lo que sale del test viejo es HIPÓTESIS (escala versión 4, traducida por posición a la de hoy): el vendedor lo
 * valida en la primera reunión. Al modelo solo le llegan los ids y nombres de la escala de hoy.
 */
export {
  leerResultadoDelTest,
  type RespuestaLeidaDelTest as RespuestaDelTest,
  type ResultadoLeidoDelTest as ResultadoDelTest,
} from "@/lib/tests-diagnostico/enlace-leido";

/** Las propiedades del contacto que guardan la dirección del resultado, por área de hoy. */
export const PROPIEDADES_DEL_TEST: Record<string, string> = {
  "1": "url_ultimo_diag_sales",
  "2": "url_ultimo_diag_marketing",
  "3": "url_ultimo_diag_service",
};
