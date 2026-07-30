/**
 * lib/flow/canvas-chips.ts — los chips de CANVAS del widget del proyecto. PURO.
 *
 * Responde una sola pregunta, de un vistazo: **qué documentos le corresponden a este
 * proyecto y cuáles ya están**. Es un checklist, no un inventario.
 *
 * ── DE DÓNDE SALE CADA COSA (nada de esto es nuevo) ──────────────────────────
 *  · QUÉ piezas existen y en qué orden → `piecesInFlowOrder` + `buildPieceRows`.
 *  · CUÁLES le corresponden a ESTE proyecto → `piezaAplica` (tags **o** pipeline).
 *  · CUÁLES tienen algo escrito → `hasContent`, el criterio único de
 *    `lib/pieces/piece-content.ts` (un bloque semilla no cuenta; el Cronograma se mide
 *    por sus fases).
 *
 * ── LO QUE ESTE BLOQUE ARREGLA ───────────────────────────────────────────────
 * Antes mostraba cuatro señales fijas —handoff, kickoff, cronograma, procesos— y nada más.
 * Un proyecto con Diagnóstico y Planificación generados se veía igual que uno sin ellos, y
 * las piezas que faltaban ni siquiera existían para el CSE que miraba el widget.
 *
 * ── POR QUÉ FILTRA POR `piezaAplica` Y NO MUESTRA TODO ───────────────────────
 * Un desarrollo no lleva kickoff. Mostrárselo en gris para siempre es el chip rojo
 * permanente que ya sacamos una vez: un chip AUSENTE dice "no corresponde", uno apagado
 * dice "te falta". El desplegable del panel sigue siendo el MAPA completo — ahí sí están
 * todas, porque ahí se activan.
 */
import { buildPieceRows, type CanvasParaFila } from "./dropdown-rows";
import { piezaAplica } from "./piece-readiness";

export type EstadoDeChip =
  /** Tiene contenido real. */
  | "generada"
  /** Existe pero a medio camino — hoy solo el Cronograma, que distingue subido de no subido. */
  | "borrador"
  /** Le corresponde y todavía no está. */
  | "pendiente";

export interface ChipDeCanvas {
  slug: string;
  label: string;
  estado: EstadoDeChip;
}

/** El Cronograma no se mide con bloques: `lib/portfolio/project-setup.ts` ya lo resuelve. */
const SLUG_CRONOGRAMA = "timeline";
/** El handoff puede ser el de OTRO proyecto: `lib/handoff/duenio.ts`. */
const SLUG_HANDOFF = "handoff";

/**
 * El mapeo de PROCESOS. No es una pieza del recorrido del proyecto: vive a nivel CLIENTE
 * (el canvas "Información del cliente" del proyecto sentinel), así que dos proyectos del
 * mismo cliente comparten el chip. Va igual porque es lo que el CSE necesita saber antes de
 * cualquier diagnóstico — pero al final, después de las piezas del proyecto.
 */
const CHIP_PROCESOS = { slug: "procesos", label: "Procesos" } as const;

export interface EntradaDeChips {
  /** Los canvases del proyecto con su `hasContent` (loadCanvasesConContenido). */
  canvases: CanvasParaFila[];
  /** `Project.tags` — deciden si aplica el requerimiento técnico, entre otras. */
  tags: string[];
  hubspotPipelineId: string | null;
  /** El Cronograma, con su estado de tres valores (`deriveSetup`). */
  cronograma: "sin" | "borrador" | "publicado";
  /** ¿El CLIENTE tiene procesos mapeados? */
  tieneProcesos: boolean;
  /**
   * ¿El handoff de este proyecto es el de OTRO, y ese otro ya lo tiene generado?
   *
   * Un desarrollo que cuelga de una implementación NO tiene handoff propio: comparte el del
   * hermano (lib/handoff/duenio.ts). Sin esto, su canvas propio está vacío y el chip diría
   * "Handoff · pendiente" sobre un documento que existe, está completo y se está leyendo en
   * la sección de abajo. `null` = el handoff es suyo, se mide como cualquier otra pieza.
   */
  handoffDelHermano?: { generado: boolean } | null;
}

export function buildCanvasChips(input: EntradaDeChips): ChipDeCanvas[] {
  const chips: ChipDeCanvas[] = buildPieceRows(input.canvases, {
    // El handoff ES un documento del proyecto: en el widget se cuenta.
    incluirHandoff: true,
    // Un canvas suelto del CSE no tiene estado "pendiente" — nadie lo espera.
    incluirCustom: false,
  })
    .filter((r) =>
      piezaAplica(r.slug, { tags: input.tags, hubspotPipelineId: input.hubspotPipelineId }),
    )
    .map((r) => ({
      slug: r.slug,
      label: r.label,
      estado:
        r.slug === SLUG_HANDOFF && input.handoffDelHermano
          ? input.handoffDelHermano.generado
            ? "generada"
            : "pendiente"
          : r.slug === SLUG_CRONOGRAMA
          ? /* El Cronograma tiene una tercera respuesta que las demás no: existe, tiene
               fases, y todavía no se le publicó línea base. "Borrador" es información que
               el CSE usa; aplastarla a "generada" escondería el paso que falta. */
            input.cronograma === "publicado"
              ? "generada"
              : input.cronograma === "borrador"
                ? "borrador"
                : "pendiente"
          : r.state === "generada"
            ? "generada"
            : /* "vacía" y "por activar" son lo mismo para quien mira el estado: no hay nada
                 escrito. La diferencia (existe el canvas o hay que crearlo) importa en el
                 desplegable, que es donde se hace clic. */
              "pendiente",
    }));

  chips.push({
    ...CHIP_PROCESOS,
    estado: input.tieneProcesos ? "generada" : "pendiente",
  });
  return chips;
}
