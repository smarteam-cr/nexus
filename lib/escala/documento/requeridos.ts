/**
 * lib/escala/documento/requeridos.ts — qué criterios necesita cada criterio, y quién lo necesita. PURO.
 *
 * Un criterio puede decir en su etiqueta cuáles otros requiere (`· requiere 1.5.F1`): enfocarse en
 * los leads que encajan con el cliente ideal necesita que el cliente ideal esté escrito, y eso vive
 * en otra dimensión. La escala lo dice UNA vez, donde corresponde, y acá se arma la relación en los
 * dos sentidos: lo que un criterio necesita y quiénes lo necesitan a él.
 *
 * No cambia el cálculo (eso lo dice la escala, en «Criterios requeridos»): sirve para leerla, para
 * ordenar el trabajo y para avisar cuando algo se marcó cumplido sin lo que necesita.
 *
 * Vale igual sobre la escala general y sobre la que devuelve `aplicarEdicion`: en una edición, un
 * enlace hacia un criterio que ella sacó ya no está (lo quita `aplicarEdicion`).
 */
import { aplica, type Perfil } from "./perfil";
import { LETRAS, LETRAS_CON_RESULTADO, type Criterio, type Escala, type Letra, type MarcaDePerfil } from "./tipos";

/** Un criterio al otro lado de un enlace, con lo que hace falta para nombrarlo y para llegar a él. */
export interface EnlaceDeCriterio {
  /** `1.5.F1` */
  id: string;
  texto: string;
  /** `1.5` */
  dimension: string;
  dimensionNombre: string;
  letra: Letra;
  /** `1` */
  area: string;
  areaNombre: string;
  /** Para la URL, si el criterio es de otra área. */
  areaSlug: string;
  /** Su marca de perfil: con un perfil elegido, un enlace a un criterio que no aplica no se muestra. */
  perfil: MarcaDePerfil | null;
}

export interface Requeridos {
  /** Id de un criterio → lo que necesita, en el orden en que lo dice su etiqueta. */
  necesita: Map<string, EnlaceDeCriterio[]>;
  /** Id de un criterio → los que lo necesitan, en el orden de la matriz. */
  loNecesitan: Map<string, EnlaceDeCriterio[]>;
}

interface Ubicado {
  enlace: EnlaceDeCriterio;
  criterio: Criterio;
}

/** Dónde está cada criterio de la escala (o de la escala vista por una edición). */
function ubicar(escala: Pick<Escala, "areas">): Map<string, Ubicado> {
  const out = new Map<string, Ubicado>();
  for (const a of escala.areas) {
    for (const d of a.dimensiones) {
      for (const n of d.niveles) {
        for (const c of n.criterios) {
          out.set(c.id, {
            criterio: c,
            enlace: {
              id: c.id,
              texto: c.texto,
              dimension: d.id,
              dimensionNombre: d.nombre,
              letra: n.letra,
              area: a.id,
              areaNombre: a.nombre,
              areaSlug: a.slug,
              perfil: c.perfil,
            },
          });
        }
      }
    }
  }
  return out;
}

/** La relación en los dos sentidos. Un id que la escala no tiene se salta (lo reporta la validación). */
export function requeridosDe(escala: Pick<Escala, "areas">): Requeridos {
  const indice = ubicar(escala);
  const necesita = new Map<string, EnlaceDeCriterio[]>();
  const loNecesitan = new Map<string, EnlaceDeCriterio[]>();
  for (const x of indice.values()) {
    for (const id of x.criterio.requiere ?? []) {
      const requerido = indice.get(id);
      if (!requerido) continue;
      necesita.set(x.enlace.id, [...(necesita.get(x.enlace.id) ?? []), requerido.enlace]);
      loNecesitan.set(id, [...(loNecesitan.get(id) ?? []), x.enlace]);
    }
  }
  return { necesita, loNecesitan };
}

/** Los enlaces que se ven con un perfil: los que apuntan a un criterio que a ese perfil sí le aplica. */
export function enlacesQueAplican(enlaces: EnlaceDeCriterio[] | undefined, perfil: Perfil): EnlaceDeCriterio[] {
  return (enlaces ?? []).filter((e) => aplica(e, perfil));
}

/**
 * Las fallas de los requeridos de UNA escala (la general, o la vista por una edición). Las reglas:
 *
 *   · Solo de Funcional para arriba: Deficiente e Inicial se asignan por mejor ajuste, no tienen
 *     criterios de logro, así que ni requieren ni se requieren.
 *   · Lo requerido existe, no es el mismo criterio y no se repite.
 *   · Es de un nivel igual o anterior: un criterio de Funcional no puede depender de uno de Eficiente.
 *   · Si es de su misma dimensión, es de un nivel ANTERIOR: dentro del mismo nivel ya se piden los dos.
 *   · Hay al menos un perfil de negocio en que los dos aplican: si no, el enlace no se vería nunca.
 *   · No hay ciclos: nadie termina necesitándose a sí mismo.
 *
 * `perfiles` son los nueve de la prueba (las dos preguntas contestadas).
 */
export function fallasDeRequeridos(escala: Pick<Escala, "areas">, perfiles: Perfil[]): string[] {
  const fallas: string[] = [];
  const indice = ubicar(escala);
  const orden = (l: Letra) => LETRAS.indexOf(l);
  const deLogro = (l: Letra) => LETRAS_CON_RESULTADO.includes(l);

  for (const { enlace: x, criterio } of indice.values()) {
    const requiere = criterio.requiere ?? [];
    if (requiere.length === 0) continue;
    if (!deLogro(x.letra)) {
      fallas.push(`${x.id} no es de Funcional para arriba: ahí no hay criterios de logro, así que no puede requerir nada.`);
      continue;
    }
    const vistos = new Set<string>();
    for (const id of requiere) {
      if (vistos.has(id)) {
        fallas.push(`${x.id} requiere ${id} dos veces.`);
        continue;
      }
      vistos.add(id);
      if (id === x.id) {
        fallas.push(`${x.id} se requiere a sí mismo.`);
        continue;
      }
      const r = indice.get(id)?.enlace;
      if (!r) {
        fallas.push(`${x.id} requiere ${id}, que no existe.`);
        continue;
      }
      if (!deLogro(r.letra)) {
        fallas.push(`${x.id} requiere ${id}, que no es de Funcional para arriba.`);
        continue;
      }
      if (orden(r.letra) > orden(x.letra)) fallas.push(`${x.id} requiere ${id}, que es de un nivel posterior al suyo.`);
      else if (r.dimension === x.dimension && r.letra === x.letra) {
        fallas.push(`${x.id} requiere ${id}, que es de su misma dimensión y nivel: sobra, el nivel ya pide los dos.`);
      }
      if (!perfiles.some((p) => aplica(x, p) && aplica(r, p))) {
        fallas.push(`${x.id} requiere ${id}, y no hay ningún perfil de negocio en que los dos apliquen.`);
      }
    }
  }

  // Ciclos: recorrido en profundidad; un criterio «en curso» que se vuelve a encontrar cierra un ciclo.
  const estado = new Map<string, "en curso" | "listo">();
  const visitar = (id: string, camino: string[]) => {
    if (estado.get(id) === "listo") return;
    if (estado.get(id) === "en curso") {
      fallas.push(`los requeridos forman un ciclo: ${[...camino.slice(camino.indexOf(id)), id].join(" → ")}.`);
      return;
    }
    estado.set(id, "en curso");
    for (const sig of indice.get(id)?.criterio.requiere ?? []) if (indice.has(sig) && sig !== id) visitar(sig, [...camino, id]);
    estado.set(id, "listo");
  };
  for (const id of indice.keys()) visitar(id, []);

  return fallas;
}
