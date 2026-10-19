/**
 * lib/escala/documento/personalizacion.ts — cuánto dice cada edición con sus palabras. PURO.
 *
 * Una edición tiene que representar el modelo de negocio de su industria: por eso cada celda
 * (edición × dimensión × nivel) debería tener al menos un criterio dicho con las palabras de la
 * industria, reescrito o propio. Esta medición cuenta, celda por celda, cuántos lo están y cuántos
 * se leen igual que en la escala general, y lista las celdas sin ninguno. La corre
 * `scripts/medir-personalizacion-escala.ts` en cada versión, y la vigila
 * `personalizacion.test.ts` (las celdas que quedan generales a propósito, con su porqué).
 */
import { aplicarEdicion } from "./edicion";
import type { Escala, Letra } from "./tipos";

export interface CeldaDeLaEdicion {
  edicion: string;
  area: string;
  /** `1.7` */
  dimension: string;
  /** Como la llama la edición. */
  nombre: string;
  letra: Letra;
  /** `1.7.I` */
  id: string;
  /** Criterios de la escala general dichos con las palabras de la edición. */
  reescritos: number;
  /** Criterios que solo existen en la edición. */
  propios: number;
  /** Criterios de la escala general que se leen igual (los «Se leen igual» y los que la edición no tocó). */
  generales: number;
  /** Ids de los que se leen igual. */
  idsGenerales: string[];
}

export function celdasDeLaEdicion(escala: Escala, slug: string): CeldaDeLaEdicion[] {
  const vista = aplicarEdicion(escala, slug);
  if (!vista.edicion) return [];
  const out: CeldaDeLaEdicion[] = [];
  for (const a of vista.areas) {
    for (const d of a.dimensiones) {
      for (const n of d.niveles) {
        const propios = n.criterios.filter((c) => c.propio).length;
        const reescritos = n.criterios.filter((c) => c.textoGeneral !== undefined).length;
        const gen = n.criterios.filter((c) => !c.propio && c.textoGeneral === undefined);
        out.push({
          edicion: slug,
          area: a.id,
          dimension: d.id,
          nombre: d.nombre,
          letra: n.letra,
          id: n.id,
          reescritos,
          propios,
          generales: gen.length,
          idsGenerales: gen.map((c) => c.id),
        });
      }
    }
  }
  return out;
}

/**
 * Una celda está personalizada si tiene al menos un criterio dicho con las palabras de la edición. Una
 * celda sin criterios (todos sus criterios generales «No aplican» en la edición) no tiene nada que
 * personalizar y no cuenta como pendiente.
 */
export function estaPersonalizada(c: CeldaDeLaEdicion): boolean {
  return c.reescritos + c.propios > 0 || c.generales === 0;
}

export function celdasSinPersonalizar(escala: Escala): CeldaDeLaEdicion[] {
  return escala.ediciones.flatMap((e) => celdasDeLaEdicion(escala, e.slug)).filter((c) => !estaPersonalizada(c));
}
