/**
 * lib/pieces/ensure-canvas.ts — ACTIVAR una pieza en un proyecto.
 *
 * Hasta ahora crear una pieza a mano no existía: Diagnóstico y Planificación tenían sus
 * secciones declaradas y su agente sembrado, pero ninguna función que las creara, así que
 * el `+` del desplegable no podía hacer nada. Cada pieza on-demand tenía su propio
 * `create*` de una línea sobre la misma genérica, y no había índice de identidad →
 * estructura. Ahora sí, y esto es lo que lo usa.
 *
 * ── ACTIVAR NO ES CREAR ───────────────────────────────────────────────────────
 * El error fácil acá cuesta datos. Una pieza APAGADA no aparece en el listado (el GET
 * filtra las apagadas), así que en el desplegable se ve igual que una que nunca existió:
 * como `+`. Si "activar" hiciera un create a secas:
 *
 *   · chocaría contra el índice único parcial (projectId, slug) → error 500; y
 *   · si por algún camino no chocara, dejaría el contenido viejo colgando de una fila
 *     huérfana que nadie vuelve a ver.
 *
 * Por eso es encontrar-o-crear, y sobre la pieza apagada hace UPDATE: la reenciende
 * conservando todo lo que tenía. La búsqueda va **sin** filtro de estado a propósito —
 * es una consulta de EXISTENCIA, y ese es justamente el caso que lib/pieces/canvas-query
 * documenta como prohibido filtrar. Hay un guard que lo verifica (enabled-filter.test.ts).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  canvasDefForSlug,
  sectionSequence,
  type CanvasDefinition,
} from "@/lib/canvas/canvas-defs";
import {
  createOnDemandCanvas,
  reconcileOnDemandCanvasSections,
} from "@/lib/canvas/default-canvases";
import { canvasOfNested } from "./canvas-query";
import { pieceBySlug } from "./registry";

export type EnsureOutcome =
  /** No existía: se creó con sus secciones. */
  | "creada"
  /** Existía apagada: se reencendió con su contenido intacto. */
  | "reactivada"
  /** Ya estaba activa: no se tocó nada. */
  | "sin-cambios";

export interface EnsureResult {
  canvasId: string;
  outcome: EnsureOutcome;
}

/** Por qué una pieza no se puede activar desde el desplegable. */
export class PieceNotActivatableError extends Error {}

/**
 * Deja la pieza `slug` ACTIVA en el proyecto y devuelve su canvas.
 * Idempotente: llamarla dos veces seguidas no crea dos documentos.
 */
export async function ensurePieceCanvas(projectId: string, slug: string): Promise<EnsureResult> {
  const pieza = pieceBySlug(slug);
  if (!pieza) throw new PieceNotActivatableError(`"${slug}" no es una pieza registrada.`);
  if (pieza.scope !== "project") {
    throw new PieceNotActivatableError(
      `"${pieza.label}" no es una pieza del proyecto: no se activa desde acá.`,
    );
  }
  const def = canvasDefForSlug(slug);
  if (!def) {
    throw new PieceNotActivatableError(
      `"${pieza.label}" todavía no tiene estructura definida — no se puede activar.`,
    );
  }

  // Sin `onlyEnabled`: necesitamos VER la apagada. Ver el encabezado.
  const existente = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(slug, { projectId }),
    select: { id: true, disabledAt: true },
  });

  if (existente) {
    if (!existente.disabledAt) {
      await reconcileSecciones(existente.id, def);
      return { canvasId: existente.id, outcome: "sin-cambios" };
    }
    await prisma.projectCanvas.update({
      where: { id: existente.id },
      // Se limpian los tres juntos: dejar el motivo de un apagado que ya no rige
      // convertiría el rastro en una mentira.
      data: { disabledAt: null, disabledBy: null, disabledReason: null },
    });
    await reconcileSecciones(existente.id, def);
    return { canvasId: existente.id, outcome: "reactivada" };
  }

  try {
    const canvasId = await createOnDemandCanvas(projectId, def);
    return { canvasId, outcome: "creada" };
  } catch (e) {
    // Carrera (doble clic): entre el findFirst y el create, otra request la creó. El
    // índice único es PARCIAL y no está declarado en el schema, así que Prisma manda el
    // P2002 sin `meta.target` útil — se resuelve releyendo, no adivinando.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const ganador = await prisma.projectCanvas.findFirst({
        where: canvasOfNested(slug, { projectId }),
        select: { id: true },
      });
      if (ganador) return { canvasId: ganador.id, outcome: "sin-cambios" };
    }
    throw e;
  }
}

/** Reconcilia las secciones a la estructura canónica (idempotente, no borra nada). */
function reconcileSecciones(canvasId: string, def: CanvasDefinition) {
  const canon = def.sections.map((s) => s.key);
  return reconcileOnDemandCanvasSections(canvasId, def, (existing) =>
    sectionSequence(canon, existing),
  );
}
