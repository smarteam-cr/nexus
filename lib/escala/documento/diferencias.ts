/**
 * lib/escala/documento/diferencias.ts — qué cambió entre dos versiones de la escala. PURO.
 *
 * Dos usos: el script que publica una versión muestra qué identificadores entran, salen o cambian
 * de texto (y cuántos comentarios toca), y la tarjeta de un comentario hecho en una versión vieja
 * muestra su texto de entonces al lado del de hoy, palabra por palabra.
 */
import { textosPorAncla } from "./anclas";
import { aplicarEdicion } from "./edicion";
import { todosLosCriterios } from "./parsear";
import type { Escala } from "./tipos";

export interface CambiosDeUnaEdicion {
  slug: string;
  nombre: string;
  /** La edición no estaba en la versión anterior. */
  nueva: boolean;
  /** Lo que la edición dice distinto de la escala general, hoy (nombres, preguntas, criterios…). */
  propiosDeLaEdicion: number;
  /** Identificadores cuyo texto, leído con esta edición, cambia de una versión a la otra. */
  cambiados: { id: string; antes: string; despues: string }[];
  /**
   * Lo que la edición dice con sus palabras y quedó VIEJO: el texto general cambió de una versión a
   * la otra y el de la edición no se tocó. No es un error (puede seguir diciendo lo mismo), pero
   * hay que mirarlo: es la forma en que una edición se aleja de la escala sin que nadie lo decida.
   */
  viejos: string[];
}

export interface CambiosEntreVersiones {
  nuevos: string[];
  retirados: string[];
  cambiados: { id: string; antes: string; despues: string }[];
  /** Criterios de la matriz que están en las dos versiones y cambiaron lo que requieren. */
  requeridos: { id: string; antes: string[]; despues: string[] }[];
  ediciones: CambiosDeUnaEdicion[];
  /** Ediciones que estaban en la versión anterior y ya no. */
  edicionesRetiradas: string[];
}

function cambiosDeTexto(a: Map<string, string>, b: Map<string, string>): CambiosEntreVersiones["cambiados"] {
  return [...b.entries()]
    .filter(([id, texto]) => a.has(id) && a.get(id) !== texto)
    .map(([id, despues]) => ({ id, antes: a.get(id)!, despues }));
}

export function compararEscalas(anterior: Escala, nueva: Escala): CambiosEntreVersiones {
  const a = textosPorAncla(anterior);
  const b = textosPorAncla(nueva);
  const nuevos = [...b.keys()].filter((id) => !a.has(id));
  const retirados = [...a.keys()].filter((id) => !b.has(id));

  const ediciones = nueva.ediciones.map((ed): CambiosDeUnaEdicion => {
    const existia = anterior.ediciones.some((e) => e.slug === ed.slug);
    const antes = textosPorAncla(aplicarEdicion(anterior, ed.slug));
    const ahora = textosPorAncla(aplicarEdicion(nueva, ed.slug));
    const distintos = [...ahora.entries()].filter(([id, texto]) => b.get(id) !== texto);
    return {
      slug: ed.slug,
      nombre: ed.nombre,
      nueva: !existia,
      propiosDeLaEdicion: distintos.length,
      cambiados: existia ? cambiosDeTexto(antes, ahora) : [],
      viejos: existia
        ? distintos.filter(([id, texto]) => a.has(id) && b.has(id) && a.get(id) !== b.get(id) && antes.get(id) === texto).map(([id]) => id)
        : [],
    };
  });

  const requiereAntes = new Map(todosLosCriterios(anterior).map((c) => [c.id, c.requiere ?? []] as const));
  const requeridos = todosLosCriterios(nueva)
    .filter((c) => requiereAntes.has(c.id) && requiereAntes.get(c.id)!.join(",") !== (c.requiere ?? []).join(","))
    .map((c) => ({ id: c.id, antes: requiereAntes.get(c.id)!, despues: c.requiere ?? [] }));

  return {
    nuevos,
    retirados,
    cambiados: cambiosDeTexto(a, b),
    requeridos,
    ediciones,
    edicionesRetiradas: anterior.ediciones.filter((e) => !nueva.ediciones.some((x) => x.slug === e.slug)).map((e) => e.nombre),
  };
}

export type Tramo = { tipo: "igual" | "quitado" | "agregado"; texto: string };

/**
 * Cada palabra con el espacio que la sigue: así el resultado se vuelve a pegar tal cual, y un
 * espacio suelto no «coincide» en el medio de un cambio de dos palabras (partiéndolo en dos).
 */
function tokens(s: string): string[] {
  return s.match(/^\s+|\S+\s*/g) ?? [];
}

/**
 * Diferencia palabra por palabra (subsecuencia común más larga). Los textos de la escala son
 * cortos —un criterio, una descripción—, así que la tabla cuadrática no pesa. Por las dudas, si
 * los textos son enormes se devuelve «todo quitado / todo agregado» en vez de colgar la pantalla.
 */
export function diferenciaPorPalabras(antes: string, despues: string): Tramo[] {
  if (antes === despues) return [{ tipo: "igual", texto: antes }];
  const a = tokens(antes);
  const b = tokens(despues);
  if (a.length * b.length > 250_000) {
    return [
      { tipo: "quitado", texto: antes },
      { tipo: "agregado", texto: despues },
    ];
  }
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = largo de la subsecuencia común de a[i..] y b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: Tramo[] = [];
  const poner = (tipo: Tramo["tipo"], texto: string) => {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
    else out.push({ tipo, texto });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      poner("igual", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      poner("quitado", a[i++]);
    } else {
      poner("agregado", b[j++]);
    }
  }
  while (i < n) poner("quitado", a[i++]);
  while (j < m) poner("agregado", b[j++]);
  return out;
}
