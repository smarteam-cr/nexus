/**
 * lib/pieces/piece-staleness.ts — "esta pieza quedó vieja respecto del handoff". PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Regenerar el handoff YA NO reescribe el requerimiento técnico: si el documento tiene
 * contenido, el encadenado se saltea a propósito (borraba ediciones a mano del equipo
 * técnico, sin permiso y sin corrida). Ese arreglo dejó un hueco: el único rastro del
 * salteo era un `console.log` del servidor, que nadie mira. Para el CSE, regenerar el
 * handoff parecía haber actualizado todo — y el requerimiento seguía diciendo lo de antes.
 *
 * Callar es peor que reescribir de más: un documento viejo que se ve al día es
 * exactamente lo que se le manda a un desarrollador externo.
 *
 * ── EL CRITERIO, Y POR QUÉ NO HACE FALTA UNA COLUMNA NUEVA ───────────────────
 * El dato ya está en la base: cuándo cambió el handoff por última vez contra
 * `ProjectCanvas.contentUpdatedAt` (cuándo se tocó el documento). Si el handoff es POSTERIOR,
 * lo que se escribió salió de una versión anterior del handoff.
 *
 * «Cuándo cambió el handoff» lo resuelve `ultimoCambioDelHandoff` (lib/handoff/congelado-server.ts),
 * una sola función para las dos pantallas que lo calculan (app/api/projects/[projectId]/canvases y la
 * ficha del cliente). Sin congelar es `Project.handoffGeneratedAt`, como siempre. Con el handoff
 * CONGELADO (etapa 3b) esa fecha deja de moverse: cuenta también una edición posterior al congelado
 * que cambió lo que dice —una sugerencia usada, un bloque editado—; descartar una sugerencia no.
 *
 * Se deriva en cada lectura en vez de guardarse, por el mismo motivo que `proposed` en
 * piece-state.ts: una marca guardada hay que acordarse de expirarla desde los cuatro
 * caminos que escriben, y siempre se olvida uno.
 *
 * ── LAS TRES PUERTAS CERRADAS A PROPÓSITO ────────────────────────────────────
 *   · Solo el requerimiento técnico. Es la única pieza que el handoff encadenaba, y la
 *     única que se lee EN VIVO desde afuera (lib/external/desarrollo-view.ts). Las demás
 *     nunca dependieron del handoff de esta forma.
 *   · Sin contenido no hay nada viejo: ahí la fila ya dice "vacía" y el CTA dice
 *     "Generar". Dos avisos para lo mismo es ruido.
 *   · Si falta cualquiera de las dos fechas, NO se marca. Un documento escrito antes de
 *     que existiera `contentUpdatedAt` no tiene con qué comparar, y gritar "viejo" sobre
 *     un documento que quizá está perfecto quema el aviso para cuando de verdad importe.
 */

/** El slug de la única pieza que puede quedar vieja por el handoff. Ver el encabezado. */
export const PIEZA_QUE_SIGUE_AL_HANDOFF = "tech-requirements";

export interface PiezaParaVejez {
  slug: string | null;
  /** Cuándo se tocó el contenido del documento. null = documento anterior a la marca. */
  contentUpdatedAt: Date | string | null;
  /** Criterio único de lib/pieces/piece-content.ts. */
  hasContent: boolean;
}

const enMilis = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * ¿El requerimiento técnico se escribió ANTES del último cambio del handoff?
 * `handoffCambioAt` sale de `ultimoCambioDelHandoff` (ver el encabezado).
 * Devuelve false ante cualquier duda — ver "las tres puertas" en el encabezado.
 */
export function piezaDesactualizadaPorHandoff(
  pieza: PiezaParaVejez,
  handoffCambioAt: Date | string | null,
): boolean {
  if (pieza.slug !== PIEZA_QUE_SIGUE_AL_HANDOFF) return false;
  if (!pieza.hasContent) return false;
  const handoff = enMilis(handoffCambioAt);
  const documento = enMilis(pieza.contentUpdatedAt);
  if (handoff === null || documento === null) return false;
  return handoff > documento;
}

/** El texto que ve el CSE en la fila. Corto: la fila no da para más de un renglón. */
export const AVISO_DESACTUALIZADA = "El handoff cambió después";

/** La frase completa, para el tooltip. */
export const AVISO_DESACTUALIZADA_LARGO =
  "El handoff cambió (se regeneró, se usó una sugerencia o alguien lo editó) después de que se " +
  "escribió este documento. No se reescribió solo a propósito (habría borrado lo editado a mano). " +
  "Revísalo y, si corresponde, regenéralo desde su propio botón.";
