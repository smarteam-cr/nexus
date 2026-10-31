/**
 * lib/flow/reparto-del-riel.ts — qué fila del riel va a la vista y cuál plegada en «Ver N piezas más». PURO.
 *
 * ⛔ Una pieza oculta sale de la vista AUNQUE ESTÉ ABIERTA. Hasta el 2026-10-30 la abierta se quedaba en su lugar, y como
 * casi siempre se oculta lo que se está mirando, el ojo guardaba bien y en pantalla no pasaba nada: Elías lo reportó como
 * «no funciona». La oculta y abierta se sigue viendo, en la zona plegada y marcada.
 */
import { PIEZAS_SIEMPRE_EN_EL_RIEL } from "@/lib/pieces/registry";

export interface FilaParaRepartir {
  estado: string;
  oculta?: boolean;
  activa: boolean;
  esCopia?: boolean;
}

/** Lo que viene en todo proyecto no pide «Activar»: se ve como pendiente y se crea al abrirlo. */
export function estadoEnElRiel(row: { slug: string; state: "generada" | "vacia" | "por_activar" }): "generada" | "pendiente" | "por_activar" {
  if (row.state === "generada") return "generada";
  return row.state === "vacia" || PIEZAS_SIEMPRE_EN_EL_RIEL.has(row.slug) ? "pendiente" : "por_activar";
}

export function repartirElRiel<F extends FilaParaRepartir>(filas: readonly F[], verMasAbierto = false) {
  const existentes = filas.filter((f) => f.estado !== "por_activar" && !f.oculta);
  const ocultas = filas.filter((f) => f.estado !== "por_activar" && f.oculta);
  const porActivar = filas.filter((f) => f.estado === "por_activar");
  return {
    existentes,
    ocultas,
    /** Con «Ver más» cerrado, la oculta que está abierta sigue a la vista: no se pierde dónde se está. */
    ocultasALaVista: ocultas.filter((f) => verMasAbierto || f.activa),
    porActivar,
    /** Lo que se puede ocultar: una copia se archiva desde su barra. */
    ocultables: existentes.filter((f) => !f.esCopia),
    plegadas: ocultas.length + porActivar.length,
  };
}
