/**
 * lib/contexto/documento.ts — los DOCUMENTOS que tienen «Contexto» propio (fuera del handoff y del
 * cronograma, que tienen el suyo desde antes).
 *
 * Pedido de Elías (2026-09-28): «así como el cronograma, cada canvas (diagnóstico, planificación,
 * implementación) tenga su espacio para agregar contexto — así queda claro qué sesiones lo están
 * alimentando». El diagnóstico entró el 2026-09-28; planificación y ejecución el 2026-09-29. Sumar
 * uno es sumar su fila acá, su columna de afinado en `SessionProject` y su destino en
 * lib/sessions/destinos-de-contexto.ts. Las notas ya son genéricas (`NotaDeContexto.pieza`).
 *
 * Módulo PURO: lo usan las rutas, el panel y los runners.
 */
import type { DestinoSugerido } from "@/lib/sessions/destinos-de-contexto";

export interface DocumentoConContexto {
  /** Slug de la pieza (lib/pieces/registry.ts): va en la URL y en `NotaDeContexto.pieza`. */
  pieza: "diagnosis" | "planning" | "implementation";
  /** El destino de las reglas del panel. */
  destino: DestinoSugerido;
  /** La celda de permisos que habilita curarlo (la de generarlo). */
  seccion: "diagnostico" | "planificacion" | "implementacion";
  /** «Contexto del diagnóstico», «Contexto de la planificación». */
  titulo: string;
  /** Cómo se nombra en una frase: «el diagnóstico», «la planificación». */
  elDocumento: string;
}

export const DOCUMENTOS_CON_CONTEXTO: readonly DocumentoConContexto[] = [
  { pieza: "diagnosis", destino: "diagnostico", seccion: "diagnostico", titulo: "Contexto del diagnóstico", elDocumento: "el diagnóstico" },
  { pieza: "planning", destino: "planificacion", seccion: "planificacion", titulo: "Contexto de la planificación", elDocumento: "la planificación" },
  { pieza: "implementation", destino: "ejecucion", seccion: "implementacion", titulo: "Contexto de la ejecución", elDocumento: "la ejecución" },
];

export function documentoConContexto(pieza: string | null | undefined): DocumentoConContexto | null {
  return DOCUMENTOS_CON_CONTEXTO.find((d) => d.pieza === pieza) ?? null;
}

export function documentoDelDestino(destino: string): DocumentoConContexto | null {
  return DOCUMENTOS_CON_CONTEXTO.find((d) => d.destino === destino) ?? null;
}

/** Tope TOTAL de las notas de un documento: el mismo del cronograma. Una nota sola más larga se rechaza. */
export const TOPE_NOTAS_DEL_DOCUMENTO = 12_000;

/** Tope de las reuniones en el prompt del documento, y lo que se le da a cada una como mínimo y máximo. */
export const TOPE_REUNIONES_DEL_DOCUMENTO = 48_000;
export const PISO_POR_REUNION_DEL_DOCUMENTO = 2_000;
export const TECHO_POR_REUNION_DEL_DOCUMENTO = 12_000;
/** Más de esto no cabe con un piso útil por reunión: se leen las más recientes. */
export const MAX_REUNIONES_DEL_DOCUMENTO = TOPE_REUNIONES_DEL_DOCUMENTO / PISO_POR_REUNION_DEL_DOCUMENTO;

/** Cuánto se lee de cada reunión cuando son `n`: el tope repartido, entre el piso y el techo. */
export function espacioPorReunion(n: number): number {
  if (n <= 0) return 0;
  return Math.max(PISO_POR_REUNION_DEL_DOCUMENTO, Math.min(TECHO_POR_REUNION_DEL_DOCUMENTO, Math.floor(TOPE_REUNIONES_DEL_DOCUMENTO / n)));
}
