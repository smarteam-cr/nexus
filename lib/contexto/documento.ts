/**
 * lib/contexto/documento.ts — los DOCUMENTOS que tienen «Contexto» propio (fuera del handoff y del
 * cronograma, que tienen el suyo desde antes).
 *
 * Pedido de Elías (2026-09-28): «así como el cronograma, cada canvas (diagnóstico, planificación,
 * implementación) tenga su espacio para agregar contexto — así queda claro qué sesiones lo están
 * alimentando». El diagnóstico entró el 2026-09-28; planificación y ejecución el 2026-09-29; el
 * kickoff, la exploración, integraciones y la entrega el 2026-10-07. Sumar uno es sumar su fila acá,
 * su columna de afinado en `SessionProject` y su destino en lib/sessions/destinos-de-contexto.ts. Las
 * notas ya son genéricas (`NotaDeContexto.pieza`) y las instrucciones también (la entry `__doc` del
 * canvas de la pieza, que lee `cargarMaterialDelDocumento`).
 *
 * Módulo PURO: lo usan las rutas, el panel y los runners.
 */
import type { DestinoSugerido } from "@/lib/sessions/destinos-de-contexto";

export interface DocumentoConContexto {
  /** Slug de la pieza (lib/pieces/registry.ts): va en la URL y en `NotaDeContexto.pieza`. */
  pieza: "diagnosis" | "planning" | "implementation" | "kickoff" | "exploration" | "tech-requirements" | "delivery";
  /** El destino de las reglas del panel. */
  destino: DestinoSugerido;
  /** La celda de permisos que habilita curarlo (la de generarlo). */
  seccion: SeccionConContexto;
  /** El título del bloque: «Contexto adicional» en toda pieza (2026-10-06, el mismo nombre en preventa y clientes). */
  titulo: string;
  /** Cómo se nombra en una frase: «el diagnóstico», «la planificación». */
  elDocumento: string;
  /** Qué hace su IA con el contexto, para la explicación del bloque: «escribe el diagnóstico». */
  laIa: string;
  /** El ejemplo de la caja de «Instrucciones adicionales». */
  ejemplo: string;
}

/** Las celdas de permisos de los documentos con contexto (la de generarlos). */
export type SeccionConContexto =
  | "diagnostico"
  | "planificacion"
  | "implementacion"
  | "kickoff"
  | "exploracion"
  | "desarrollo"
  | "entrega";

export const DOCUMENTOS_CON_CONTEXTO: readonly DocumentoConContexto[] = [
  {
    pieza: "diagnosis",
    destino: "diagnostico",
    seccion: "diagnostico",
    titulo: "Contexto adicional",
    elDocumento: "el diagnóstico",
    laIa: "escribe el diagnóstico",
    ejemplo: "Ej.: enfócate en el área de Servicio; no propongas cambiar de plataforma.",
  },
  {
    pieza: "planning",
    destino: "planificacion",
    seccion: "planificacion",
    titulo: "Contexto adicional",
    elDocumento: "la planificación",
    laIa: "escribe la planificación",
    ejemplo: "Ej.: el pipeline de ventas queda con 6 etapas; no incluyas automatizaciones de Marketing.",
  },
  {
    pieza: "implementation",
    destino: "ejecucion",
    seccion: "implementacion",
    titulo: "Contexto adicional",
    elDocumento: "la ejecución",
    laIa: "escribe la ejecución",
    ejemplo: "Ej.: empieza por las propiedades de Negocios; los workflows se arman a mano.",
  },
  {
    pieza: "kickoff",
    destino: "kickoff",
    seccion: "kickoff",
    titulo: "Contexto adicional",
    elDocumento: "el kickoff",
    laIa: "escribe el kickoff",
    ejemplo: "Ej.: el equipo del cliente lo lidera Laura Mora; no menciones la migración, va en otra etapa.",
  },
  {
    pieza: "exploration",
    destino: "exploracion",
    seccion: "exploracion",
    titulo: "Contexto adicional",
    elDocumento: "la exploración",
    laIa: "prepara las sesiones de la exploración y lee cada reunión",
    ejemplo: "Ej.: con Finanzas hay una sola sesión; pregunta primero por cómo cobran hoy.",
  },
  {
    pieza: "tech-requirements",
    destino: "integraciones",
    seccion: "desarrollo",
    titulo: "Contexto adicional",
    elDocumento: "el documento de integraciones",
    laIa: "escribe el documento de integraciones",
    ejemplo: "Ej.: la integración con el ERP es solo de lectura; los clientes se identifican por cédula jurídica.",
  },
  {
    pieza: "delivery",
    destino: "entrega",
    seccion: "entrega",
    titulo: "Contexto adicional",
    elDocumento: "la entrega",
    laIa: "escribe la entrega",
    ejemplo: "Ej.: destaca lo que logró el equipo de Ventas; el proyecto se llama «Portal de clientes».",
  },
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
