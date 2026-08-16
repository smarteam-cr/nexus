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

/**
 * ── LOS CALENDARIOS Y LAS SALAS NO SON EMPRESAS ──────────────────────────────
 *
 * Google mete el calendario compartido o la sala en la lista de invitados como si fuera una
 * persona más: `c_987cec9d…@group.calendar.google.com`. Para todo el que mira dominios, eso
 * parece «alguien de afuera», así que una reunión nuestra deja de ser interna por culpa de un
 * mueble. Medido el 2026-08-15: **158 reuniones de puertas adentro** quedaban huérfanas por eso,
 * y son las que se repiten cada semana: «📚 Sesión de aprendizaje» (55), «[Interno] Daily Stand Up» (51),
 * «Verificación de gastos» (30). Ninguna reunión DEJÓ de ser interna: el filtro solo suma.
 *
 * La lista vive acá, en el módulo sin dependencias, porque **los tres lugares que deciden «esto
 * es de afuera» son independientes entre sí** y cada uno tiene su propio extractor de dominio:
 * la cascada de atribución (`categorize.ts`), el criterio de puertas adentro
 * (`candidatas-internas.ts`) y el resumen de la sala (`participantes.ts`). Una sola lista para
 * los tres es lo único que impide que se separen.
 *
 * ⚠ NO alcanza con cargar estos dominios como «internos» en `/sessions/categories`: los pintaría
 * como gente NUESTRA en el conteo de la sala, y una reunión con dos personas y una sala diría
 * que fuimos tres. No son nuestros: no son personas.
 */
const DOMINIOS_DE_CALENDARIO = [
  "group.calendar.google.com",
  "resource.calendar.google.com",
] as const;

/** ¿Este DOMINIO es de un calendario o una sala de Google, y no de una empresa? */
export function esDominioDeCalendario(dominio: string): boolean {
  const d = dominio.trim().toLowerCase();
  return DOMINIOS_DE_CALENDARIO.some((c) => d === c);
}

/**
 * ¿Este CORREO es un recurso de Google Calendar (sala, calendario de grupo) y no una persona?
 *
 * Lo usan dos familias por motivos distintos: la impersonación —a un recurso no se lo puede
 * impersonar aunque sea «del dominio», porque no es una cuenta de usuario— y la atribución de
 * sesiones, que no lo puede contar ni como nuestro ni como de afuera.
 */
export function esRecursoDeCalendario(email: string): boolean {
  const e = email.trim().toLowerCase();
  return DOMINIOS_DE_CALENDARIO.some((c) => e.endsWith(`@${c}`));
}
