/**
 * lib/escala/documento/diferencias.ts — qué cambió entre dos versiones de la escala. PURO.
 *
 * Dos usos: el script que publica una versión muestra qué identificadores entran, salen o cambian
 * de texto (y cuántos comentarios toca), y la tarjeta de un comentario hecho en una versión vieja
 * muestra su texto de entonces al lado del de hoy, palabra por palabra.
 */
import { textosPorAncla } from "./anclas";
import type { Escala } from "./tipos";

export interface CambiosEntreVersiones {
  nuevos: string[];
  retirados: string[];
  cambiados: { id: string; antes: string; despues: string }[];
}

export function compararEscalas(anterior: Escala, nueva: Escala): CambiosEntreVersiones {
  const a = textosPorAncla(anterior);
  const b = textosPorAncla(nueva);
  const nuevos = [...b.keys()].filter((id) => !a.has(id));
  const retirados = [...a.keys()].filter((id) => !b.has(id));
  const cambiados = [...b.entries()]
    .filter(([id, texto]) => a.has(id) && a.get(id) !== texto)
    .map(([id, despues]) => ({ id, antes: a.get(id)!, despues }));
  return { nuevos, retirados, cambiados };
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
