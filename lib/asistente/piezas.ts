/**
 * lib/asistente/piezas.ts — SOBRE QUÉ DOCUMENTOS SE PUEDE CONVERSAR. CLIENT-SAFE, puro.
 *
 * ⭐ LA LISTA SE DERIVA, NO SE ESCRIBE. El chat conversa sobre lo que el editor puede ejecutar:
 * si una pieza no tiene modificador, el asistente podría acordar un cambio que después no hay
 * cómo aplicar — y esa es la queja original de Elías, servida por el sistema que vino a
 * resolverla:
 *
 *   «puede que el modificador de canvas no sea capaz de generar ese tipo; pero el usuario no
 *    obtiene esa respuesta».
 *
 * Por eso sale de `DOC` (el registro del assist de documentos) más el cronograma, que tiene su
 * propio modificador. Una lista escrita a mano divergiría el día que alguien sume un documento
 * al assist y se olvide de esto: el chat quedaría ausente justo donde ya se puede usar, y nada
 * avisaría. La guarda de al lado lo hace cumplir.
 */
import { DOC } from "@/lib/canvas/assist-de-documento";

/** El cronograma no está en `DOC`: su modificador es otro (`/timeline/assist`). */
export const PIEZA_CRONOGRAMA = "timeline";

/**
 * ⭐ EXPLORACIÓN CONVERSA, PERO NO ENTRA A `DOC`. Las dos compuertas se separaron el 2026-08-22.
 *
 * ── POR QUÉ ESTABA AFUERA, Y POR QUÉ YA NO ──────────────────────────────────────────────────
 * `DOC` es el registro del ASSIST de documentos: el camino que le pide al modelo la data de una
 * sección entera y la reconstruye desde el esquema. Exploración quedó fuera porque el merge que
 * repone lo curado solo alcanza el primer nivel, y sus marcas «ya la pregunté» viven anidadas
 * dentro del plan de sesiones: una propuesta que tocara `sesiones` las borraba TODAS, sin aviso.
 *
 * El chat ya no pasa por ese camino: emite OPERACIONES, que leen la data guardada y escriben la
 * hoja que nombran. Nada se reconstruye, así que nada anidado se pierde — y `hecha` ni siquiera es
 * alcanzable, porque no está en el esquema. Los dos sentidos tienen test en
 * `lib/canvas/operaciones-de-documento.test.ts`.
 *
 * ⛔ POR ESO SE SEPARAN LAS LISTAS. Meter `exploration` en `DOC` para darle chat prendería TAMBIÉN
 * el assist sobre ella, y ahí el borrado vuelve por la otra puerta. Son dos capacidades distintas
 * y desde hoy se declaran por separado.
 */
const CONVERSAN_SIN_ASSIST: readonly string[] = ["exploration"];

/** Los slugs sobre los que el asistente puede conversar. Derivado — ver el header. */
export const PIEZAS_CON_CHAT: readonly string[] = [
  PIEZA_CRONOGRAMA,
  ...Object.keys(DOC),
  ...CONVERSAN_SIN_ASSIST,
];

export function tieneChat(slug: string | null | undefined): boolean {
  return !!slug && PIEZAS_CON_CHAT.includes(slug);
}

/**
 * ⚠ El chat solo aparece con contenido YA GENERADO. Un asistente sobre un documento vacío no
 * tiene qué modificar: la primera generación sigue siendo el botón «Generar». Ofrecerlo antes
 * sería prometer una conversación que no puede terminar en nada.
 */
export function puedeConversar(slug: string | null | undefined, tieneContenido: boolean): boolean {
  return tieneChat(slug) && tieneContenido;
}
