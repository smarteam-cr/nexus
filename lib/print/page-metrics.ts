/**
 * lib/print/page-metrics.ts — las medidas de la hoja. Puras y client-safe.
 *
 * Existen en su propio módulo porque las necesitan los DOS lados: el runner de Puppeteer
 * (que fija el viewport) y componentes que tienen que encoger para caber. Vivían dentro de
 * `pdf-runner.ts`, que importa puppeteer y por lo tanto no puede cruzar al cliente — así que
 * el ancho de la hoja quedaba escrito a mano en cada componente que lo necesitaba, o peor,
 * no se sabía y el contenido salía cortado.
 */

/** Ancho del documento (px) = viewport de Chromium = `@page size`. Ver `pdf-runner.ts`. */
export const PRINT_PAGE_WIDTH = 1000;

/**
 * Cuánto encoger un bloque de ancho fijo para que entre en la hoja, entre 0 y 1.
 *
 * Se aplica con `zoom` y no con `transform: scale()`: `zoom` REFLOWEA —el alto del bloque
 * encoge con él— mientras que `scale` solo repinta y deja un hueco del tamaño original.
 * Chromium lo soporta, y Chromium es literalmente quien imprime esto.
 *
 * `disponible` es el ancho ÚTIL del contenedor, no el de la hoja: casi todas las secciones
 * del motor están dentro de márgenes.
 */
export function fitZoom(necesario: number, disponible: number): number {
  if (!(necesario > 0) || !(disponible > 0)) return 1;
  return Math.min(1, disponible / necesario);
}
