/**
 * lib/flow/reparto-del-riel.ts — qué fila de la barra lateral se ve, cuál queda sin anclar y cuál no sale. PURO.
 *
 * ⛔ Lo que no se creó NO sale (Elías, 30 oct): una pieza sembrada y vacía, o sin documento, no ocupa lugar ni pide «Activar».
 * La lista arranca con lo que viene siempre (`PIEZAS_SIEMPRE_EN_EL_RIEL`) y lo demás se crea en «Nuevo artefacto», que le
 * pone nombre al documento: el nombre es lo que lo deja en la lista aunque todavía esté vacío.
 *
 * ⛔ Una pieza desanclada se va DE VERDAD, también si está abierta: solo se ve al abrir «Ver N sin anclar». Antes la abierta
 * se quedaba abajo a la vista y Elías lo reportó como un bug («tiene que irse de verdad»).
 */
import { PIEZAS_SIEMPRE_EN_EL_RIEL } from "@/lib/pieces/registry";

export interface FilaParaRepartir {
  estado: string;
  oculta?: boolean;
  esCopia?: boolean;
}

export type EstadoEnElRiel = "generada" | "pendiente" | "sin_crear";

export function estadoEnElRiel(
  row: { slug: string; state: "generada" | "vacia" | "por_activar"; esCopia?: boolean; conNombre?: boolean },
  o: { activa?: boolean; conVacias?: boolean } = {},
): EstadoEnElRiel {
  if (row.state === "generada") return "generada";
  if (row.esCopia || row.conNombre || row.slug.startsWith("custom:") || PIEZAS_SIEMPRE_EN_EL_RIEL.has(row.slug)) return "pendiente";
  // La vacía que se está mirando (se llegó por «Qué sigue») y las de un servicio recurrente, que trabaja sobre sus piezas.
  return row.state === "vacia" && (o.activa || o.conVacias) ? "pendiente" : "sin_crear";
}

export function repartirElRiel<F extends FilaParaRepartir>(filas: readonly F[], verMasAbierto = false) {
  const creadas = filas.filter((f) => f.estado !== "sin_crear");
  const existentes = creadas.filter((f) => !f.oculta);
  const ocultas = creadas.filter((f) => f.oculta);
  return {
    existentes,
    ocultas,
    ocultasALaVista: verMasAbierto ? ocultas : [],
    /** Lo que se puede desanclar: una copia se archiva desde su barra. */
    ocultables: existentes.filter((f) => !f.esCopia),
    plegadas: ocultas.length,
  };
}
