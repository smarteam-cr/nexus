/**
 * lib/escala/documento/manual.ts — lo que la sección muestra del manual de operación. PURO.
 *
 * Por qué la escala está congelada y cuándo se descongela («La escala está congelada»): le da
 * sentido a comentar. Se lee del manual PUBLICADO, como todo; si una versión lo reescribe distinto,
 * la pantalla simplemente no lo muestra.
 */
import { lineasDe, parrafos, seccion } from "./parsear";

export interface Congelamiento {
  /** «La versión 7.0.0 de la escala no cambia hasta que se haya usado con cinco a diez clientes…». */
  resumen: string;
  /** Las reglas mientras está congelada, con sus negritas de markdown. */
  reglas: string[];
}

export function leerCongelamiento(manual: string | null | undefined): Congelamiento | null {
  if (!manual) return null;
  const bloque = seccion(lineasDe(manual), /^## La escala está congelada\s*$/);
  if (bloque.length === 0) return null;
  const reglas = bloque.map((l) => /^- (.+)$/.exec(l.trim())?.[1]).filter((x): x is string => !!x);
  const resumen = parrafos(bloque).find((p) => !p.startsWith("- ") && !p.endsWith(":")) ?? null;
  return resumen ? { resumen, reglas } : null;
}
