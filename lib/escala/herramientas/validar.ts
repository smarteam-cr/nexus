/**
 * lib/escala/herramientas/validar.ts — que el mapa nombre criterios que la escala tiene. PURO.
 *
 * El mapa nombra criterios por su identificador, y los identificadores de la escala son estables: un
 * criterio que se precisa conserva el suyo. Pero uno se puede retirar, y uno propio de una edición
 * existe solo en ella. Acá se mira contra la escala de verdad: la general y lo propio de cada edición.
 */
import { todosLosCriterios } from "../documento/parsear";
import type { Escala } from "../documento/tipos";
import type { MapaDeHerramientas } from "./tipos";

/** Todos los criterios que existen en alguna lectura de la escala: los de la matriz y los propios de cada edición. */
export function criteriosDeLaEscala(escala: Pick<Escala, "areas" | "ediciones">): Set<string> {
  const ids = new Set(todosLosCriterios(escala as Escala).map((c) => c.id));
  for (const ed of escala.ediciones) for (const a of ed.areas) for (const d of a.dimensiones) for (const c of d.propios) ids.add(c.id);
  return ids;
}

/** «Insider One nombra `2.9.O1`, que la escala 8.7.0 no tiene»: lo que no calza, en palabras. */
export function problemasDelMapa(mapa: MapaDeHerramientas, escala: Pick<Escala, "areas" | "ediciones" | "version">): string[] {
  const existen = criteriosDeLaEscala(escala);
  const out: string[] = [];
  for (const h of mapa.herramientas) {
    const faltan = Object.keys(h.aportes).filter((id) => !existen.has(id));
    if (faltan.length) {
      out.push(`${h.nombre} nombra ${faltan.length === 1 ? "un criterio" : `${faltan.length} criterios`} que la escala ${escala.version} no tiene: ${faltan.join(", ")}.`);
    }
  }
  return out;
}
