/**
 * lib/sessions/dominio-propio.ts — QUIÉNES SOMOS NOSOTROS, en un solo lugar.
 *
 * `smarteamcr.com` estaba escrito a mano en seis archivos con cuatro nombres distintos
 * (`INTERNAL_DOMAIN` ×4, `ALLOWED_DOMAIN`, y el `hd:` del OAuth). Cada copia es una que se
 * puede quedar vieja sin que nada avise, y el síntoma del desfase es feísimo: el formulario
 * autocompleta un dominio que HubSpot no conoce y responde "No existe esa empresa", sobre un
 * dominio que sí existe.
 *
 * ⚠ NO tiene dependencias a propósito: lo importan tanto rutas de servidor como componentes
 * `"use client"`.
 *
 * ── LO QUE ESTE ARCHIVO NO GOBIERNA ──────────────────────────────────────────
 * El gate de LOGIN (`app/auth/callback/route.ts` y `app/auth/google/route.ts`) sigue con su
 * propia constante, y es deliberado: es seguridad, y que un cambio pensado para sesiones o para
 * el alta pueda abrir la puerta de entrada al sistema es exactamente lo que no se quiere. Dos
 * copias que dicen lo mismo pero que se cambian por motivos distintos no son duplicación: son
 * aislamiento.
 *
 * ── Y LO QUE ES LA VERDAD EN CALIENTE ────────────────────────────────────────
 * Para ATRIBUIR sesiones, la fuente es la `SessionCategory` con `kind="internal"`, que se edita
 * en `/sessions/categories` sin deploy (ver `buildInternalDomainsSet`). Esta constante es el
 * default de arranque y lo que usa la pantalla del alta, donde no hay a quién preguntarle.
 * Un invariante vigila que no se separen.
 */

/** El dominio de correo de Smarteam. Es el valor con el que arranca la categoría "Interna". */
export const DOMINIO_PROPIO = "smarteamcr.com";

/** ¿Este correo es de alguien del equipo? Tolera espacios y mayúsculas. */
export function esDeNuestroEquipo(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DOMINIO_PROPIO}`);
}
