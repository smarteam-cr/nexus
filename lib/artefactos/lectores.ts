/**
 * lib/artefactos/lectores.ts — CÓMO LEEN LOS LECTORES VARIAS COPIAS DE UN TIPO (etapa V3 de docs/artefactos-plan.md). PURO.
 *
 * Elías, 29 oct: no hay una copia «oficial»; la entrega, la escala y los agentes leen TODAS, cada una con su nombre y su
 * estado, «para que quien los lea lo tome en cuenta». Dos clases de lector:
 *
 *   · los que arman TEXTO para un agente (`loadCanvasContext`): todas, rotuladas, las terminadas primero
 *     (`ordenParaLosAgentes` + `textoDeVariasCopias`). Con un solo documento con contenido, el texto queda BYTE A BYTE
 *     como antes: es lo que garantiza que un proyecto de hoy se siga leyendo igual;
 *   · los que necesitan UN valor (la posición en la escala, el desafío del diagnóstico): el terminado más reciente; sin
 *     terminados, el primero en el orden de la persona (`prioridadParaUnValor`). Quien lee toma el primero que tenga el
 *     dato, así una copia vacía recién creada no le tapa el valor al documento de siempre.
 *
 * Lo que va a la base vive en ./lectores-server.ts.
 */
import { COMO_LEER_VARIAS_COPIAS, estadoDelArtefacto, ordenarArtefactos } from "./copias";

/** Lo mínimo de un documento para ordenarlo como lo leen los lectores. */
export interface DocumentoOrdenable {
  order: number;
  createdAt: Date | string;
  terminadoEn?: Date | string | null;
}

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

/** Para un agente: los terminados primero y después los en construcción; dentro de cada grupo, el orden de la persona. */
export function ordenParaLosAgentes<T extends DocumentoOrdenable>(docs: readonly T[]): T[] {
  const enOrden = ordenarArtefactos(docs);
  return [
    ...enOrden.filter((d) => estadoDelArtefacto(d) === "terminado"),
    ...enOrden.filter((d) => estadoDelArtefacto(d) === "en_construccion"),
  ];
}

/**
 * Para un lector que necesita UN valor: en qué orden probar los documentos. Los terminados, el más reciente primero;
 * después los en construcción, en el orden de la persona. El lector toma el primero que tenga el dato.
 */
export function prioridadParaUnValor<T extends DocumentoOrdenable>(docs: readonly T[]): T[] {
  const terminados = docs
    .filter((d) => estadoDelArtefacto(d) === "terminado")
    .sort((a, b) => ms(b.terminadoEn) - ms(a.terminadoEn));
  return [...terminados, ...ordenarArtefactos(docs.filter((d) => estadoDelArtefacto(d) === "en_construccion"))];
}

/**
 * El TEXTO de varias copias para un agente, ya en el orden de lectura. Las que no tienen nada escrito no entran. Con una
 * sola con texto, su texto tal cual (sin rótulo ni aviso): el mensaje del agente no cambia en el proyecto de hoy.
 */
export function textoDeVariasCopias(copias: ReadonlyArray<{ rotulo: string; texto: string }>): string {
  const conTexto = copias.filter((c) => c.texto.trim().length > 0);
  if (conTexto.length === 0) return "";
  if (conTexto.length === 1) return conTexto[0].texto;
  return [COMO_LEER_VARIAS_COPIAS, ...conTexto.map((c) => `=== ${c.rotulo} ===\n${c.texto}`)].join("\n\n");
}
