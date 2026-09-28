/**
 * lib/flow/vista-de-la-url.ts — QUÉ MUESTRA LA FICHA DE UN PROYECTO SEGÚN SU URL (2026-09-28).
 *
 * Desde el 2026-09-27 la ficha abre por el Resumen: la URL SIN `?canvas=` es el Resumen y con
 * `?canvas=` es un documento (por id o por el slug de la pieza, como `timeline`). La pantalla
 * decidía eso una sola vez al montar y solo por la PRESENCIA del parámetro, así que:
 *  · un `?canvas=` que no es de este proyecto (el del proyecto anterior al cambiar de pestaña, el
 *    del handoff —que no está en el desplegable: vive en el Resumen—, uno borrado) abría el primer
 *    documento con la URL diciendo otra cosa;
 *  · un cambio de URL que no pasaba por el desplegable (la pestaña de otro proyecto, un enlace del
 *    centro de corridas) no movía la pantalla.
 * Una sola regla, pura, para el primer paint y para cada cambio de URL.
 *
 * Módulo client-safe: lo usa el panel (components/clients/ProjectCanvasPanel.tsx).
 */
import { slugForCanvas } from "@/lib/pieces/registry";

export interface DocumentoDeLaLista {
  id: string;
  slug: string | null;
  name: string;
}

/** El documento que pide la URL: por id o por el slug de su pieza. */
export function buscarDocumento<T extends DocumentoDeLaLista>(lista: readonly T[], pedido: string | null): T | null {
  if (!pedido) return null;
  return lista.find((c) => c.id === pedido) ?? lista.find((c) => slugForCanvas(c) === pedido) ?? null;
}

export type VistaDeLaUrl =
  | { tipo: "resumen" }
  | { tipo: "documento"; canvasId: string }
  /** Hay parámetro pero la lista de documentos todavía no llegó: no se decide nada. */
  | { tipo: "esperar" };

export function vistaDeLaUrl(
  lista: readonly DocumentoDeLaLista[],
  pedido: string | null,
  listaCargada: boolean,
): VistaDeLaUrl {
  if (!pedido) return { tipo: "resumen" };
  const doc = buscarDocumento(lista, pedido);
  if (doc) return { tipo: "documento", canvasId: doc.id };
  return listaCargada ? { tipo: "resumen" } : { tipo: "esperar" };
}
