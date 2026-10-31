/**
 * lib/flow/dropdown-rows.ts — las filas del desplegable de piezas del proyecto. PURO.
 *
 * El desplegable dejó de ser "la lista de canvases que existen" para pasar a ser **el
 * flujo completo del manejo de clientes**: las piezas del recorrido, existan o no en este
 * proyecto. Las que faltan se ven y se pueden activar desde ahí.
 *
 * ⚠ El ORDEN sale de `lib/flow/orden-de-presentacion.ts` y NO del orden narrativo de las
 * etapas: el cronograma se abre todos los días y va adelante, aunque su etapa sea la cuarta.
 * Las dos listas y por qué son dos están explicadas allá.
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
import { piezasParaMostrar } from "./orden-de-presentacion";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { admiteCopias, TIPOS } from "@/lib/artefactos/tipos";
import { esCopia, nombreDelArtefacto, ordenarArtefactos } from "@/lib/artefactos/copias";

/** Piezas que NO se listan en el DESPLEGABLE, con su motivo. */
const FUERA_DEL_DESPLEGABLE = new Set(["handoff"]);

export interface OpcionesDeFilas {
  /**
   * Incluir el handoff. El desplegable NO lo lista (tiene su propia sección arriba del
   * panel), pero el bloque "Canvas" del widget SÍ lo cuenta: ahí la pregunta es "¿qué
   * documentos tiene este proyecto?", y el handoff es uno.
   */
  incluirHandoff?: boolean;
  /**
   * Incluir los canvases sueltos del CSE. El desplegable los lista —son suyos y nada
   * desaparece—; el widget no, porque su bloque es un CHECKLIST del recorrido y un canvas
   * suelto no tiene estado "pendiente": nadie lo espera.
   */
  incluirCustom?: boolean;
  /**
   * El estado de las piezas que NO viven en un canvas (`hasCanvas: false` en el registro; hoy los
   * `questionnaires`). Su fila no sale de la lista de canvases: la arma quien sabe dónde viven. Una
   * pieza así que no está en este mapa NO se lista — sin el dato, una fila «por activar» ofrecería
   * algo que no se activa. Por eso el widget (que no lo pasa) no la cuenta.
   */
  sinCanvas?: Partial<Record<string, RowState>>;
  /**
   * Las piezas de un SERVICIO RECURRENTE, en su orden (lib/servicios/ciclo.ts). Un proyecto así no recorre
   * el flujo de una implementación: sus filas son el Kickoff, el Cronograma y los artefactos de su ciclo, y
   * nada más (más los canvases sueltos del CSE). Sin el campo, el flujo de siempre.
   */
  piezasDelServicio?: readonly string[];
  /**
   * Incluir las COPIAS de un tipo (etapa V3 de docs/artefactos-plan.md). El riel las lista debajo de su tipo; el widget
   * (un checklist del recorrido) no: una copia no es un paso pendiente.
   */
  incluirCopias?: boolean;
}

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
  /**
   * Artefactos (etapa V3): el TIPO del documento de la fila (el slug de la pieza, o el de una copia), si es una copia y
   * si está terminado. Ausentes en las filas que no son documentos de un tipo (los sueltos del CSE, las sin canvas).
   */
  tipo?: string;
  esCopia?: boolean;
  terminado?: boolean;
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
  /** Artefactos (etapa V3): el tipo de una copia (null en el de siempre), su estado y su orden. */
  tipoArtefacto?: string | null;
  titulo?: string | null;
  terminadoEn?: string | Date | null;
  order?: number;
  createdAt?: string | Date;
}

/**
 * Las filas del desplegable, en el orden del flujo. Incluye:
 *   · las piezas registradas del recorrido (existan o no en el proyecto),
 *   · más los canvases CUSTOM que alguien haya creado, al final — nada desaparece.
 */
export function buildPieceRows(
  canvases: CanvasParaFila[],
  opts: OpcionesDeFilas = {},
): PieceRow[] {
  const porSlug = new Map<string, CanvasParaFila>();
  const custom: CanvasParaFila[] = [];
  const copiasPorTipo = new Map<string, CanvasParaFila[]>();
  for (const c of canvases) {
    if (c.slug) porSlug.set(c.slug, c);
    // Un tipo que dejó de llevar copias (la exploración, 30 oct): las de prueba no salen en el riel.
    else if (esCopia(c) && !admiteCopias(c.tipoArtefacto)) continue;
    else if (esCopia(c)) copiasPorTipo.set(c.tipoArtefacto!, [...(copiasPorTipo.get(c.tipoArtefacto!) ?? []), c]);
    else custom.push(c);
  }
  const conCopias = opts.incluirCopias !== false;

  /** La fila de una copia: su nombre, su estado, sin agente (se genera desde su editor) y sin la vejez del handoff. */
  const filaDeCopia = (c: CanvasParaFila): PieceRow => ({
    slug: `copia:${c.id}`,
    label: nombreDelArtefacto(c),
    state: c.hasContent ? "generada" : "vacia",
    canvasId: c.id,
    agent: null,
    optional: false,
    stale: false,
    tipo: c.tipoArtefacto!,
    esCopia: true,
    terminado: !!c.terminadoEn,
  });
  /** Los documentos de un tipo en el orden de la persona (el de siempre es uno más). */
  const enOrden = (lista: CanvasParaFila[]): CanvasParaFila[] => {
    const porId = new Map(lista.map((c) => [c.id, c]));
    return ordenarArtefactos(lista.map((c) => ({ id: c.id, order: c.order ?? 0, createdAt: c.createdAt ?? 0 }))).map((x) => porId.get(x.id)!);
  };

  const delFlujo: PieceRow[] = (opts.piezasDelServicio ?? piezasParaMostrar())
    .filter((slug) => opts.incluirHandoff || !FUERA_DEL_DESPLEGABLE.has(slug))
    .filter((slug) => pieceBySlug(slug)?.hasCanvas !== false || opts.sinCanvas?.[slug] !== undefined)
    .flatMap((slug) => {
      const pieza = pieceBySlug(slug);
      const canvas = porSlug.get(slug) ?? null;
      const estadoSinCanvas = pieza?.hasCanvas === false ? opts.sinCanvas?.[slug] : undefined;
      const fila = {
        slug,
        // Sin renombrar, el nombre de la pieza (como siempre); renombrado, el suyo.
        label: canvas ? nombreDelArtefacto(canvas) : (pieza?.label ?? slug),
        state: estadoSinCanvas ?? (!canvas ? "por_activar" : canvas.hasContent ? "generada" : "vacia"),
        canvasId: canvas?.id ?? null,
        agent: CANVAS_PRIMARY_AGENT[slug] ?? null,
        optional: pieza?.optional ?? false,
        stale: canvas?.stale ?? false,
        ...(canvas ? { tipo: slug, terminado: !!canvas.terminadoEn } : {}),
      } satisfies PieceRow;
      const copias = conCopias ? (copiasPorTipo.get(slug) ?? []) : [];
      copiasPorTipo.delete(slug);
      if (!copias.length) return [fila];
      // Con copias, el tipo es un grupo ordenado por la persona. Sin el de siempre, su fila «por activar» va primero
      // (se pliega en «Ver más»).
      if (!canvas) return [fila, ...enOrden(copias).map(filaDeCopia)];
      return enOrden([canvas, ...copias]).map((c) => (c.id === canvas.id ? fila : filaDeCopia(c)));
    });

  // Las copias de los tipos sin fila en el flujo (los nuevos: plan de adopción, integración técnica), en el orden del
  // registro de tipos y, adentro, en el de la persona.
  const deTiposNuevos: PieceRow[] = conCopias
    ? TIPOS.flatMap((t) => enOrden(copiasPorTipo.get(t.id) ?? []).map(filaDeCopia))
    : [];

  if (opts.incluirCustom === false) return [...delFlujo, ...deTiposNuevos];

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

  return [...delFlujo, ...deTiposNuevos, ...sueltos];
}
