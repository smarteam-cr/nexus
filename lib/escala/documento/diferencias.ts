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
import type { Escala, Letra } from "./tipos";

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
   * Lo que entra y lo que sale SOLO en esta edición: un criterio propio nuevo, uno propio que se
   * retira, uno de la matriz que la edición saca o deja de sacar. Lo que entra o sale de la escala
   * general no se repite acá (ya está en `nuevos` y `retirados` de la versión).
   */
  nuevos: string[];
  retirados: string[];
  /** Criterios que, leídos con esta edición, cambiaron lo que requieren (sin repetir los de la matriz). */
  requeridos: { id: string; antes: string[]; despues: string[] }[];
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

/** Una cosa que la edición dice con sus palabras, al lado de cómo la dice la escala general. */
interface ParteDeLaEdicion {
  /** Dónde se ve: el identificador (`1.7`, `1.7.F`, `1.7.F1`) o, si es del área, «área 1». */
  donde: string;
  edicion: string;
  general: string | null;
}

/**
 * Todo lo que una edición dice con sus palabras, PARTE POR PARTE: el nombre, la pregunta, la
 * descripción y el costo de una dimensión; la descripción y el resultado de un nivel; el texto de
 * un criterio reescrito; la descripción y el vistazo del área. Cada parte con su par de la escala
 * general. Se compara por partes y no por el texto entero del identificador porque un nivel son dos
 * textos (descripción y resultado) y una dimensión, cuatro: si la edición dice con sus palabras uno
 * y hereda el otro, un cambio general en los dos a la vez hacía que el identificador «cambiara» en
 * la edición y el texto que quedó viejo pasara sin aviso.
 */
function partesDeLaEdicion(escala: Escala, slug: string): Map<string, ParteDeLaEdicion> {
  const out = new Map<string, ParteDeLaEdicion>();
  const ed = escala.ediciones.find((e) => e.slug === slug);
  if (!ed) return out;
  const poner = (clave: string, donde: string, edicion: string | null | undefined, general: string | null | undefined) => {
    if (edicion != null) out.set(clave, { donde, edicion, general: general ?? null });
  };
  for (const ea of ed.areas) {
    const a = escala.areas.find((x) => x.id === ea.id);
    const area = `área ${ea.id}`;
    poner(`${ea.id}|nombre`, area, ea.nombre, a?.nombre);
    poner(`${ea.id}|descripcion`, area, ea.descripcion, a?.descripcion);
    for (const [letra, texto] of Object.entries(ea.panoramica)) poner(`${ea.id}|vistazo.${letra}`, area, texto, a?.panoramica[letra as Letra]);
    for (const dim of ea.dimensiones) {
      const d = a?.dimensiones.find((x) => x.id === dim.id);
      poner(`${dim.id}|nombre`, dim.id, dim.nombre, d?.nombre);
      poner(`${dim.id}|pregunta`, dim.id, dim.pregunta, d?.pregunta);
      poner(`${dim.id}|descripcion`, dim.id, dim.descripcion, d?.descripcion);
      poner(`${dim.id}|costo`, dim.id, dim.costoDeQuedarse, d?.costoDeQuedarse);
      for (const [letra, nivel] of Object.entries(dim.niveles)) {
        const n = d?.niveles.find((x) => x.letra === letra);
        poner(`${dim.id}.${letra}|descripcion`, `${dim.id}.${letra}`, nivel?.descripcion, n?.descripcion);
        poner(`${dim.id}.${letra}|resultado`, `${dim.id}.${letra}`, nivel?.resultado, n?.resultado);
      }
      const generales = new Map(d?.niveles.flatMap((n) => n.criterios.map((c) => [c.id, c.texto] as const)) ?? []);
      for (const [id, texto] of Object.entries(dim.textos)) poner(`${id}|texto`, id, texto, generales.get(id));
    }
  }
  return out;
}

/**
 * Lo que la edición dice con sus palabras y quedó VIEJO: la parte general cambió de una versión a
 * la otra y la suya no se tocó. Un nombre igual al general no es «decirlo con sus palabras».
 */
function partesViejas(anterior: Escala, nueva: Escala, slug: string): string[] {
  const antes = partesDeLaEdicion(anterior, slug);
  const viejas = new Set<string>();
  for (const [clave, ahora] of partesDeLaEdicion(nueva, slug)) {
    const previa = antes.get(clave);
    if (!previa || previa.edicion !== ahora.edicion) continue; // la edición no lo decía, o ya lo cambió
    if (ahora.general === null || previa.general === null) continue; // no tiene par en la general (o es nuevo)
    if (ahora.edicion === ahora.general) continue;
    if (previa.general !== ahora.general) viejas.add(ahora.donde);
  }
  return [...viejas];
}

/** Qué criterios cambiaron lo que requieren, entre dos lecturas de la escala (la general, o la vista por una edición). */
function cambiosDeRequeridos(antes: Pick<Escala, "areas">, ahora: Pick<Escala, "areas">): CambiosEntreVersiones["requeridos"] {
  const previos = new Map(todosLosCriterios(antes).map((c) => [c.id, c.requiere ?? []] as const));
  return todosLosCriterios(ahora)
    .filter((c) => previos.has(c.id) && previos.get(c.id)!.join(",") !== (c.requiere ?? []).join(","))
    .map((c) => ({ id: c.id, antes: previos.get(c.id)!, despues: c.requiere ?? [] }));
}

export function compararEscalas(anterior: Escala, nueva: Escala): CambiosEntreVersiones {
  const a = textosPorAncla(anterior);
  const b = textosPorAncla(nueva);
  const nuevos = [...b.keys()].filter((id) => !a.has(id));
  const retirados = [...a.keys()].filter((id) => !b.has(id));
  const requeridos = cambiosDeRequeridos(anterior, nueva);
  const yaDichos = { nuevos: new Set(nuevos), retirados: new Set(retirados), requeridos: new Set(requeridos.map((x) => x.id)) };

  const ediciones = nueva.ediciones.map((ed): CambiosDeUnaEdicion => {
    const existia = anterior.ediciones.some((e) => e.slug === ed.slug);
    const vistaAntes = aplicarEdicion(anterior, ed.slug);
    const vistaAhora = aplicarEdicion(nueva, ed.slug);
    const antes = textosPorAncla(vistaAntes);
    const ahora = textosPorAncla(vistaAhora);
    const distintos = [...ahora.entries()].filter(([id, texto]) => b.get(id) !== texto);
    return {
      slug: ed.slug,
      nombre: ed.nombre,
      nueva: !existia,
      propiosDeLaEdicion: distintos.length,
      cambiados: existia ? cambiosDeTexto(antes, ahora) : [],
      nuevos: existia ? [...ahora.keys()].filter((id) => !antes.has(id) && !yaDichos.nuevos.has(id)) : [],
      retirados: existia ? [...antes.keys()].filter((id) => !ahora.has(id) && !yaDichos.retirados.has(id)) : [],
      requeridos: existia ? cambiosDeRequeridos(vistaAntes, vistaAhora).filter((x) => !yaDichos.requeridos.has(x.id)) : [],
      viejos: existia ? partesViejas(anterior, nueva, ed.slug) : [],
    };
  });

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
