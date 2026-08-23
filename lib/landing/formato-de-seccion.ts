/**
 * lib/landing/formato-de-seccion.ts — ¿esta sección está escrita en CAMPOS o en TEXTO CORRIDO?
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Elías le pidió al chat «agregale títulos más grandes y resumí el texto» sobre una sección del
 * diagnóstico y el chat **la convirtió en tarjetas**. Su regla, textual: *«cada sección debe ser
 * editada en el mismo formato en el que está inicialmente, a no ser que se indique algún otro
 * formato»*.
 *
 * Ese eje ya existía en el motor y no tenía nombre. Un documento anterior al motor guardaba su
 * cuerpo como markdown en bloques TEXT; `landingRowData` lo entrega como `__legacyMd` y
 * `LandingView` lo pinta cuando la data TIPADA no tiene nada que mostrar. O sea que el formato en
 * el que una sección **se ve** es una función de tres cosas, y estaba escrita en tres líneas
 * sueltas adentro de un componente.
 *
 * ⛔ Y la conversión NO tenía vuelta atrás: escribir un campo crea un bloque CARD, y desde ahí
 * `landingRowData` no vuelve a armar `__legacyMd` nunca más. El texto sobrevive en la base y
 * desaparece de la pantalla. Por eso el predicado sale acá, con DOS consumidores —el motor que
 * pinta y el chat que edita— en vez de quedar como una condición local: si el chat dedujera el
 * formato por su cuenta, la primera divergencia sería una pérdida de contenido silenciosa.
 */

import { isBlank } from "./is-blank";

/** Los dos formatos en que una sección puede estar escrita HOY. */
export type FormatoDeSeccion = "estructurado" | "prosa";

/** Lo que el predicado necesita de un bloque. Menos que `BlockData`, a propósito. */
export interface BloqueParaFormato {
  blockType: string;
  content?: string | null;
}

/**
 * El markdown del formato anterior de una sección — **espejo exacto de `landingRowData`**.
 *
 * ⛔ Un bloque CARD lo apaga, aunque los TEXT sigan ahí con su texto: el motor arma `__legacyMd`
 * solo cuando NO hay CARD. Si esta función devolviera el markdown igual, el chat vería «prosa»
 * sobre una sección que en pantalla es de campos, y rechazaría ediciones perfectamente válidas.
 */
export function markdownDeBloques(bloques: readonly BloqueParaFormato[]): string {
  if (bloques.some((b) => b.blockType === "CARD")) return "";
  return bloques
    .map((b) => b.content ?? "")
    .filter((t) => t.trim())
    .join("\n\n")
    .trim();
}

/**
 * ⭐ DÓNDE VIVE EL CUERPO DE ESTA SECCIÓN: en un markdown viejo, o en campos.
 *
 * ⛔ LA PORTADA NO ES UNA EXCEPCIÓN ACÁ, y meterla adentro era un error con consecuencia. Lo que
 * la portada tiene distinto es QUIÉN pinta el markdown —su propio componente, no el fallback
 * genérico del motor—, y eso es una regla de RENDER. Metida en este predicado, decía «una portada
 * nunca está en prosa», y de ahí el ejecutor concluía que escribirle un campo era seguro: sobre un
 * kickoff anterior al motor, «cambiá el titular» creaba el bloque CARD y **el cuerpo legacy del
 * hero desaparecía para siempre**. La misma pérdida que este archivo existe para impedir, por la
 * única puerta que se había dejado abierta.
 *
 * La excepción del render vive donde corresponde: en `LandingView`, junto a su `isHero`.
 */
export function formatoDeSeccion(args: {
  markdown: string | null | undefined;
  dataTipada: unknown;
}): FormatoDeSeccion {
  const md = (args.markdown ?? "").trim();
  if (!md) return "estructurado";
  return isBlank(args.dataTipada) ? "prosa" : "estructurado";
}
