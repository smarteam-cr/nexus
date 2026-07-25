/**
 * lib/pieces/piece-state.ts — en qué estado está cada pieza de un proyecto. PURO.
 *
 * Sin Prisma y sin fetch, igual que el registro: lo importan el endpoint, el gestor de
 * piezas y el aviso junto a los tags, y los tres tienen que decir lo mismo.
 *
 * ── LA PROPUESTA NO SE GUARDA, SE DERIVA ──────────────────────────────────────
 * `proposed` sale de evaluar los tags del proyecto contra el registro EN CADA LECTURA.
 * No hay columna de propuesta, y es a propósito:
 *
 *   · El caso que hay que sostener es "el CSE agrega `custom_dev` y se le propone la
 *     pieza técnica; si después saca el tag, la propuesta desaparece sola". Guardarla
 *     obligaría a colgar la expiración de los CUATRO caminos que escriben tags — y ya
 *     está demostrado que uno se olvida: la rama "adjuntar" de POST /api/handoffs no
 *     propaga tags. Un aviso viejo diciendo "agregá la pieza técnica" en un proyecto que
 *     ya no lleva el tag es exactamente lo que destruye la confianza en que el sistema
 *     propone bien.
 *   · Derivarla además REPARA los proyectos existentes sin ningún backfill: el aviso
 *     aparece la primera vez que alguien los abre.
 *
 * Es el mismo patrón que `suggestAdoptionMode` (lib/lifecycle/stage-engine.ts): función
 * pura que sugiere, columna que guarda lo confirmado.
 *
 * ── LA REGLA SOLO PROPONE ENCENDER ───────────────────────────────────────────
 * Quitar un tag de un proyecto que YA tiene la pieza con contenido no propone apagarla:
 * ese contenido es trabajo real. Si el CSE la quiere apagar, el gestor está ahí.
 */
import { PIECES, pieceForCanvas, type PieceDefinition } from "./registry";

/** Lo mínimo que hace falta saber de un canvas para resolver el estado de su pieza. */
export interface CanvasParaEstado {
  id: string;
  slug: string | null;
  name: string;
  disabledAt: Date | string | null;
  disabledBy?: string | null;
  disabledReason?: string | null;
  businessCaseId?: string | null;
}

export type PieceState =
  /** El canvas existe y está activo. */
  | "on"
  /** El canvas existe con su contenido, pero el CSE la apagó. */
  | "off"
  /** No hay canvas, y los tags del proyecto la sugieren. */
  | "proposed"
  /** No hay canvas y nada la sugiere. */
  | "absent";

export interface PieceStatus {
  slug: string;
  label: string;
  /** Se puede encender/apagar. Las no opcionales se listan igual, sin interruptor. */
  optional: boolean;
  clientFacing: boolean;
  state: PieceState;
  canvasId: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  disabledReason: string | null;
  /** Qué tags la proponen — para poder decir POR QUÉ aparece el aviso. */
  proposedByTags: string[];
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * Estado de TODAS las piezas de proyecto registradas, en el orden del registro.
 * Devuelve también las ausentes: el gestor tiene que poder ofrecer encenderlas.
 */
export function resolvePieceStates(input: {
  tags: string[];
  canvases: CanvasParaEstado[];
}): PieceStatus[] {
  // Un canvas por pieza: el índice único parcial (projectId, slug) lo garantiza en la
  // base. Si por lo que sea hubiera dos, gana el primero — no es este el lugar de
  // arreglarlo, y silenciarlo acá sería peor que mostrarlo.
  const porSlug = new Map<string, CanvasParaEstado>();
  for (const c of input.canvases) {
    const pieza = pieceForCanvas(c);
    if (pieza && !porSlug.has(pieza.slug)) porSlug.set(pieza.slug, c);
  }

  const tags = new Set(input.tags);

  return PIECES.filter((p) => p.scope === "project").map((p: PieceDefinition): PieceStatus => {
    const canvas = porSlug.get(p.slug) ?? null;
    const proposedByTags = p.enabledByTags.filter((t) => tags.has(t));

    const state: PieceState = canvas
      ? canvas.disabledAt
        ? "off"
        : "on"
      : proposedByTags.length > 0
        ? "proposed"
        : "absent";

    return {
      slug: p.slug,
      label: p.label,
      optional: p.optional,
      clientFacing: p.clientFacing,
      state,
      canvasId: canvas?.id ?? null,
      disabledAt: iso(canvas?.disabledAt),
      disabledBy: canvas?.disabledBy ?? null,
      disabledReason: canvas?.disabledReason ?? null,
      proposedByTags,
    };
  });
}

/** Las piezas que hoy se le pueden ofrecer al CSE para encender. */
export function proposedPieces(states: PieceStatus[]): PieceStatus[] {
  return states.filter((s) => s.state === "proposed");
}
