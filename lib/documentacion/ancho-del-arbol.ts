/**
 * lib/documentacion/ancho-del-arbol.ts — el ancho del panel de páginas de Documentación. PURO.
 *
 * Cada persona lo ajusta arrastrando el borde del panel y queda guardado en una cookie de su
 * navegador (el mismo mecanismo que `nexus-sidebar` y `nexus-theme`): el servidor la lee, así la
 * página nace con el ancho elegido y no salta al cargar.
 *
 * La cookie la escribe el navegador y se puede tocar a mano: todo valor pasa por `acotarAncho`, así
 * un número roto o fuera de rango nunca deja el panel invisible ni tapando la página.
 */

export const COOKIE_ANCHO_DEL_ARBOL = "nexus-doc-arbol";

export const ANCHO_DEL_ARBOL = {
  /** Por debajo, los títulos se cortan tanto que el árbol no se lee. */
  minimo: 200,
  /** Por arriba, la página se queda sin lugar en una laptop. */
  maximo: 480,
  /** El de siempre (`w-72`). Doble clic en el borde vuelve acá. */
  porDefecto: 288,
} as const;

/** El ancho dentro del rango, en píxeles enteros. */
export function acotarAncho(px: number): number {
  if (!Number.isFinite(px)) return ANCHO_DEL_ARBOL.porDefecto;
  return Math.min(ANCHO_DEL_ARBOL.maximo, Math.max(ANCHO_DEL_ARBOL.minimo, Math.round(px)));
}

/** El ancho guardado, o el de siempre si no hay cookie o no se entiende. */
export function anchoDesdeCookie(valor: string | undefined): number {
  if (!valor || !/^\d+(\.\d+)?$/.test(valor.trim())) return ANCHO_DEL_ARBOL.porDefecto;
  return acotarAncho(Number(valor));
}
