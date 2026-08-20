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

/** Los slugs sobre los que el asistente puede conversar. Derivado — ver el header. */
export const PIEZAS_CON_CHAT: readonly string[] = [
  PIEZA_CRONOGRAMA,
  ...Object.keys(DOC),
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
