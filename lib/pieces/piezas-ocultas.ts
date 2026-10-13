/**
 * lib/pieces/piezas-ocultas.ts — qué piezas del riel se pueden ocultar y cómo cambia la lista. PURO y CLIENT-SAFE.
 *
 * Pedido de Elías (2026-10-12): en una implementación y en un servicio recurrente, el equipo oculta del riel los
 * artefactos que ese proyecto no usa. No se borra nada ni se apaga la pieza: queda plegada en «Ver N piezas más» y
 * se vuelve a mostrar con un clic. El Resumen no es una pieza y no se oculta.
 */
import { pieceBySlug } from "./registry";

/** Una pieza registrada del proyecto, o un canvas suelto del CSE (`custom:<id>`). */
export function esPiezaOcultable(slug: string): boolean {
  if (/^custom:[A-Za-z0-9_-]{1,60}$/.test(slug)) return true;
  const p = pieceBySlug(slug);
  return !!p && p.scope === "project";
}

/** La lista con la pieza oculta o visible, sin repetidos y en orden estable. */
export function conPiezaOculta(actuales: readonly string[], slug: string, oculta: boolean): string[] {
  const sin = actuales.filter((s) => s !== slug);
  return oculta ? [...sin, slug] : sin;
}
