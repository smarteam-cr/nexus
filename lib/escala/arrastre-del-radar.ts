/**
 * lib/escala/arrastre-del-radar.ts — ARRASTRAR UN NIVEL en el radar de una empresa (La escala interna editable, 8 nov;
 * Elías: «interno debe funcionar como un artefacto que se puede editar»). PURO.
 *
 * Quien edita toma una dimensión del radar (su vértice o su porción) y la arrastra por su eje: el nivel que queda es la
 * etapa cuyo anillo está más cerca del cursor, medido A LO LARGO del eje (la proyección del cursor sobre él), así que
 * correrse de costado no cambia nada. Más adentro que Deficiente es Deficiente; más afuera que Óptimo, Óptimo.
 * Las medidas son las del dibujo (lib/escala/radar-de-una-empresa.ts): el centro y el radio de cada anillo.
 */
import { LETRAS, type Letra } from "./documento/tipos";
import { radioDeLaEtapa, type MedidasDelRadar, type Punto } from "./radar-de-una-empresa";

/** Cuánto hay que mover el cursor (en píxeles de pantalla) para que tocar se vuelva arrastrar. */
export const UMBRAL_DEL_ARRASTRE_PX = 5;

/** El radio del cursor a lo largo del eje (de `desde` a `hasta`, que salen del centro). */
export function radioSobreElEje(m: Pick<MedidasDelRadar, "cx" | "cy">, p: Punto, eje: { desde: Punto; hasta: Punto }): number {
  const dx = eje.hasta[0] - eje.desde[0];
  const dy = eje.hasta[1] - eje.desde[1];
  const largo = Math.hypot(dx, dy);
  if (!largo) return 0;
  return ((p[0] - m.cx) * dx + (p[1] - m.cy) * dy) / largo;
}

/** El nivel del anillo más cercano al cursor, a lo largo del eje. */
export function letraDelArrastre(m: MedidasDelRadar, p: Punto, eje: { desde: Punto; hasta: Punto }): Letra {
  const r = radioSobreElEje(m, p, eje);
  let mejor: Letra = LETRAS[0];
  for (const l of LETRAS) if (Math.abs(radioDeLaEtapa(m, l) - r) < Math.abs(radioDeLaEtapa(m, mejor) - r)) mejor = l;
  return mejor;
}

/** Se movió lo suficiente para ser un arrastre y no un toque. */
export const esArrastre = (desde: { x: number; y: number }, ahora: { x: number; y: number }) =>
  Math.hypot(ahora.x - desde.x, ahora.y - desde.y) >= UMBRAL_DEL_ARRASTRE_PX;
