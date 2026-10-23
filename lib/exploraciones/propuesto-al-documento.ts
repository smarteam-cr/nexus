/**
 * lib/exploraciones/propuesto-al-documento.ts — lo que la exploración de un proyecto PROPUSO y nadie decidió, para los
 * documentos que la leen (el diagnóstico y la planificación, por `textoDeLaExploracionDelProyecto`). PURO.
 *
 * Desde el 2026-10-23 (DECISIONS «El Diagnóstico: todo el contexto, dos plantillas y un documento liviano») entra al
 * documento ROTULADO COMO SUPUESTO: una exploración con las sesiones leídas pero sin revisar le llegaba al diagnóstico
 * casi vacía. Solo lo que dijo el cliente y lo propio de su cuenta; nunca la libreta del CSE («no explorado», el
 * siguiente paso, los criterios que faltan).
 */
import type { Meta, Reto } from "./casillas";
import type { ContenidoDeExploracion, ItemPropuesto } from "./contenido";
import { definicionEnElMarco, MARCO_DE_CS } from "./marco";

/** Las casillas de lo propuesto que pueden llegar a un documento del cliente. */
export const CASILLAS_PROPUESTAS_AL_DOCUMENTO = ["retos", "metas", "obstaculos", "particularidades"] as const;

type CasillaAlDocumento = (typeof CASILLAS_PROPUESTAS_AL_DOCUMENTO)[number];

const esCasillaAlDocumento = (k: string): k is CasillaAlDocumento => (CASILLAS_PROPUESTAS_AL_DOCUMENTO as readonly string[]).includes(k);

/** El texto de un valor propuesto: una lista, un reto (`texto`), una meta (`que`) o un texto suelto. */
function textoDeUnValor(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(textoDeUnValor);
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (v && typeof v === "object") {
    const o = v as Partial<Meta> & Partial<Reto>;
    if (typeof o.texto === "string") return o.texto.trim() ? [o.texto.trim()] : [];
    if (typeof o.que === "string" && o.que.trim()) {
      return [[o.que.trim(), o.actual && `hoy: ${o.actual}`, o.objetivo && `meta: ${o.objetivo}`, o.para && `para: ${o.para}`].filter(Boolean).join(" · ")];
    }
  }
  return [];
}

/** Lo propuesto que sigue pendiente y puede llegar a un documento del cliente (sin lápida, de esas casillas). */
export function itemsPropuestosAlDocumento(c: Pick<ContenidoDeExploracion, "descartadas">, items: readonly ItemPropuesto[]): ItemPropuesto[] {
  const lapidas = new Set(c.descartadas);
  return items.filter((it) => !lapidas.has(it.id) && it.destino.tipo === "casilla" && esCasillaAlDocumento(it.destino.clave));
}

/** Lo propuesto sin decidir, en líneas («Retos: …»), con el nombre de la tarjeta en el marco de Customer Success. */
export function propuestoSinDecidir(c: Pick<ContenidoDeExploracion, "descartadas">, items: readonly ItemPropuesto[]): string[] {
  return itemsPropuestosAlDocumento(c, items).flatMap((it) => {
    const clave = (it.destino as { clave: CasillaAlDocumento }).clave;
    const etiqueta = definicionEnElMarco(clave, MARCO_DE_CS).etiqueta;
    return textoDeUnValor(it.valor).map((t) => `${etiqueta}: ${t}`);
  });
}
