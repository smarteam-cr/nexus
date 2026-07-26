/**
 * lib/flow/dropdown-rows.ts — las filas del desplegable de piezas del proyecto. PURO.
 *
 * El desplegable dejó de ser "la lista de canvases que existen" para pasar a ser **el
 * flujo completo del manejo de clientes**: las 7 piezas en orden narrativo, existan o no
 * en este proyecto. Las que faltan se ven y se pueden activar desde ahí.
 *
 * Por qué importa que estén las que faltan: antes, una pieza que el proyecto no tenía
 * era indistinguible de una que no existe en Nexus. El CSE no podía saber que el
 * Diagnóstico era una opción — simplemente no estaba. Ahora el desplegable es el mapa.
 *
 * El HANDOFF no entra: tiene su propia sección arriba del panel (es la base que arranca
 * el proyecto, no un documento más del recorrido). Es la misma exclusión que ya hacía el
 * listado — acá queda declarada en un solo lugar y con su motivo.
 */
import { pieceBySlug } from "@/lib/pieces/registry";
import { piecesInFlowOrder } from "./stage-pieces";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";

/** Piezas que NO se listan acá, con su motivo. */
const FUERA_DEL_DESPLEGABLE = new Set(["handoff"]);

export type RowState =
  /** Existe y tiene contenido. */
  | "generada"
  /** Existe pero está vacía: se abre y adentro está su botón de generar. */
  | "vacia"
  /** No existe en este proyecto todavía. Se puede activar. */
  | "por_activar";

export interface PieceRow {
  slug: string;
  label: string;
  state: RowState;
  /** null cuando la pieza todavía no existe en el proyecto. */
  canvasId: string | null;
  /** El agente que la genera, si tiene uno. */
  agent: { agentId: string; label: string; async?: boolean } | null;
  /** Se puede prender/apagar (las no opcionales viven siempre). */
  optional: boolean;
  /**
   * El handoff se regeneró DESPUÉS de que se escribió este documento, así que lo que dice
   * salió de una versión anterior. El criterio vive en lib/pieces/piece-staleness.ts y lo
   * calculan las dos lecturas del listado; acá solo viaja hasta la fila.
   */
  stale: boolean;
}

/** Lo mínimo que hace falta saber de un canvas para armar su fila. */
export interface CanvasParaFila {
  id: string;
  slug: string | null;
  name: string;
  /**
   * ¿Tiene contenido REAL? No es "¿tiene algún bloque?": las piezas nacen con un bloque
   * SEMILLA en sus secciones curadas, y contarlo pintaba de verde piezas vacías. El
   * criterio único vive en lib/pieces/piece-content.ts y lo calculan igual el listado
   * del proyecto y el seed server-side de la página del cliente.
   */
  hasContent?: boolean;
  /** Ídem: lo calculan las dos lecturas con lib/pieces/piece-staleness.ts. */
  stale?: boolean;
}

/**
 * Las filas del desplegable, en el orden del flujo. Incluye:
 *   · las piezas registradas del recorrido (existan o no en el proyecto),
 *   · más los canvases CUSTOM que alguien haya creado, al final — nada desaparece.
 */
export function buildPieceRows(canvases: CanvasParaFila[]): PieceRow[] {
  const porSlug = new Map<string, CanvasParaFila>();
  const custom: CanvasParaFila[] = [];
  for (const c of canvases) {
    if (c.slug) porSlug.set(c.slug, c);
    else custom.push(c);
  }

  const delFlujo: PieceRow[] = piecesInFlowOrder("full")
    .filter((slug) => !FUERA_DEL_DESPLEGABLE.has(slug))
    .map((slug) => {
      const pieza = pieceBySlug(slug);
      const canvas = porSlug.get(slug) ?? null;
      return {
        slug,
        label: pieza?.label ?? slug,
        state: !canvas ? "por_activar" : canvas.hasContent ? "generada" : "vacia",
        canvasId: canvas?.id ?? null,
        agent: CANVAS_PRIMARY_AGENT[slug] ?? null,
        optional: pieza?.optional ?? false,
        stale: canvas?.stale ?? false,
      } satisfies PieceRow;
    });

  // Los canvases sueltos del CSE no son piezas del flujo, pero son suyos: van al final,
  // sin estado de flujo y sin agente.
  const sueltos: PieceRow[] = custom.map((c) => ({
    slug: `custom:${c.id}`,
    label: c.name,
    state: c.hasContent ? "generada" : "vacia",
    canvasId: c.id,
    agent: null,
    optional: false,
    // Un canvas suelto del CSE no sigue al handoff: nunca queda viejo por él.
    stale: false,
  }));

  return [...delFlujo, ...sueltos];
}
