/**
 * lib/print/ctx-rows.ts — qué secciones ctx-driven entran al documento. Puro.
 *
 * Algunas secciones no salen de un `CanvasBlock` sino de `ctx`: el cronograma vive en
 * `ProjectTimeline` y los procesos en flowcharts. Para que la config del motor las incluya
 * hay que inyectarles una fila SINTÉTICA (sin bloques), porque el motor arma el orden a
 * partir de las filas que recibe.
 *
 * ── LA PARTE QUE IMPORTA: NO INYECTAR A CIEGAS ───────────────────────────────
 * El endpoint responde 409 —"no tiene contenido visible para exportar"— cuando el documento
 * queda sin filas, y esa es la única protección contra descargar una hoja en blanco. Si la
 * fila se inyectara siempre, un cronograma sin fases daría 200 y un PDF vacío. Así que se
 * inyecta solo cuando el canal de esa sección TRAE algo.
 *
 * ⚠ La condición de acá y el `ctxEmpty` de la definición de la sección tienen que decir lo
 * MISMO. Si acá dijera "hay contenido" y allá "está vacía", el documento pasaría el 409 y
 * después el motor no pintaría nada: 200 con una hoja en blanco, que es peor que el error.
 * Lo cuida `lib/print/ctx-rows.test.ts`, cruzando las dos funciones sobre los mismos datos.
 */

/** `true` = ese canal tiene contenido y su sección merece una fila. */
export type CanalesConContenido = Record<string, boolean>;

/**
 * Las secciones ctx-driven que hay que agregar: las declaradas por el tipo, que no estén ya
 * entre las filas reales y cuyo canal traiga algo. Devuelve keys, en el orden declarado.
 */
export function filasCtxFaltantes(
  ctxSections: readonly string[] | undefined,
  keysPresentes: readonly string[],
  canales: CanalesConContenido,
): string[] {
  if (!ctxSections?.length) return [];
  const ya = new Set(keysPresentes);
  return ctxSections.filter((k) => !ya.has(k) && canales[k] === true);
}
