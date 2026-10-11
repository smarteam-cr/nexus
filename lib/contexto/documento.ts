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
import type { DestinoDeDocumento } from "@/lib/sessions/destinos-de-contexto";
import { pieceBySlug } from "@/lib/pieces/registry";

export interface DocumentoConContexto {
  /** Slug de la pieza (lib/pieces/registry.ts): va en la URL y en `NotaDeContexto.pieza`. */
  pieza: "diagnosis" | "planning" | "implementation" | "kickoff" | "exploration" | "tech-requirements" | "delivery";
  /** El destino de las reglas del panel (y de qué reuniones lee: lib/sessions/destinos-de-contexto.ts). */
  destino: DestinoDeDocumento;
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

/**
 * Tope de las reuniones en el prompt del documento, y lo que se le da a cada una como mínimo y máximo.
 * Desde la etapa 7 lo usa solo la exploración (la regla sugerida, en resumen); los seis documentos que
 * leen solo las elegidas usan los topes de abajo.
 */
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

/* ── Las ELEGIDAS, enteras (etapa 7, DECISIONS «Los documentos leen la memoria y solo las reuniones
   elegidas»). Una reunión elegida se lee con su minuta y lo que se dijo, no en resumen. ─────────── */

/** Tope TOTAL de las reuniones elegidas en el prompt (≈4 transcripciones promedio de 40.000). Incluye las que van en resumen. */
export const TOPE_ELEGIDAS_DEL_DOCUMENTO = 160_000;
/**
 * Lo más que se lee de UNA elegida: el mismo corte que la lectura de cada reunión (`TOPE_DE_LA_TRANSCRIPCION`,
 * lib/sessions/lectura-salida.ts; no se importa para no arrastrar esa lectura a este módulo puro, y la
 * prueba los ata).
 */
export const TECHO_POR_ELEGIDA = 60_000;
/** Cuántas elegidas se leen enteras como mucho (las más recientes). Las demás, en resumen. */
export const MAX_ELEGIDAS_ENTERAS = 6;
/** Lo que se lee de cada elegida que no entra entera: su resumen, como antes. */
export const PISO_POR_ELEGIDA_EN_RESUMEN = PISO_POR_REUNION_DEL_DOCUMENTO;
/**
 * Cuántas elegidas se leen en total (enteras + en resumen): las más recientes que tienen algo que leer. Las demás no
 * entran, ni por la memoria si su minuta no está revisada, y el mensaje lo dice (`lineaDeCoberturaDeLasElegidas`).
 * Número propio: antes copiaba el tope de la exploración (`MAX_REUNIONES_DEL_DOCUMENTO`), y cambiar ese movía este sin
 * que nadie lo decidiera.
 */
export const MAX_ELEGIDAS_A_LEER = 24;

/** Lo que una reunión deja para leer (tres booleanos: el texto nunca viaja). */
export interface QueDejaLaReunion {
  /** Transcripción o notas de Gemini (`summary`). */
  texto: boolean;
  /** Alguna minuta, en cualquier estado. */
  minuta: boolean;
  /** Una minuta revisada por una persona (REVIEWED o EDITED). */
  minutaRevisada: boolean;
}

/**
 * ¿UNA ELEGIDA TIENE ALGO QUE LEER? Puro. Transcripción, notas de Gemini o minuta; en un documento que lee el cliente
 * (`delCliente`), la minuta cuenta solo si la revisó una persona (una en borrador no llega: `minutaParaElDocumento`).
 * La usan el lector (material-del-documento.ts › `elegidasConContenido`) y la migración del 2026-10-10
 * (scripts/migrar-reuniones-de-los-documentos.ts): así las 6 que se migran son las que el lector lee enteras.
 */
export function tieneQueLeer(r: QueDejaLaReunion, o: { delCliente: boolean }): boolean {
  return r.texto || (o.delCliente ? r.minutaRevisada : r.minuta);
}

/**
 * QUÉ LEE UN DOCUMENTO SIN REUNIONES ELEGIDAS, en una frase para el panel. Puro. En los documentos que lee el cliente,
 * la memoria trae de las demás reuniones solo los acuerdos y las decisiones de las minutas que revisó una persona
 * (`queCargar`, lib/memoria/consumidores.ts), y hay pocas. En la entrega, además, la sección de impacto sale vacía: sus
 * cifras salen de lo que se dijo en una reunión. En la ejecución (interna), la memoria lee también las minutas en
 * borrador y los compromisos abiertos.
 */
export function queLeeSinElegidas(doc: Pick<DocumentoConContexto, "pieza">): string {
  if (pieceBySlug(doc.pieza)?.clientFacing === false) {
    return "Sin elegidas, no lee ninguna reunión entera: de las demás le llega lo que quedó en sus minutas, y los compromisos abiertos.";
  }
  const base =
    "Sin elegidas, no lee ninguna reunión: de las demás le llegan solo los acuerdos y las decisiones de las minutas revisadas.";
  return doc.pieza === "delivery" ? `${base} La sección de impacto sale vacía: sus cifras salen de las reuniones.` : base;
}

/**
 * Cuánto se lee de cada elegida ENTERA cuando son `enteras` (y `enResumen` más van en resumen): el tope
 * total, menos lo que ocupan las resumidas, repartido entre las enteras, sin pasar del techo por reunión.
 * Con 1 o 2 elegidas, 60.000 cada una; con 6, unos 26.000.
 */
export function espacioPorElegida(enteras: number, enResumen = 0): number {
  if (enteras <= 0) return 0;
  const queda = Math.max(0, TOPE_ELEGIDAS_DEL_DOCUMENTO - Math.max(0, enResumen) * PISO_POR_ELEGIDA_EN_RESUMEN);
  return Math.min(TECHO_POR_ELEGIDA, Math.floor(queda / enteras));
}
