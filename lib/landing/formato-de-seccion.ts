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
 * El formato en el que la sección **se ve**, no en el que está guardada.
 *
 * ⚠ La portada queda siempre en `estructurado`: su componente ya sabe rendir el markdown viejo y
 * además compone marca, portada y métricas, así que el fallback genérico no aplica. Es la misma
 * excepción que `LandingView` hace desde antes de este archivo.
 */
export function formatoDeSeccion(args: {
  esPortada: boolean;
  markdown: string | null | undefined;
  dataTipada: unknown;
}): FormatoDeSeccion {
  const md = (args.markdown ?? "").trim();
  if (!md || args.esPortada) return "estructurado";
  return isBlank(args.dataTipada) ? "prosa" : "estructurado";
}
