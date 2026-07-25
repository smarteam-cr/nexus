/**
 * POST /api/projects/[projectId]/pieces/[slug] — ACTIVAR una pieza en el proyecto.
 *
 * Es lo que le da acción al `+` del desplegable. Hasta ahora crear una pieza a mano no
 * existía: el POST genérico de /canvases crea un canvas SIN identidad y SIN secciones —
 * el resultado caería en la lista de "canvases sueltos", no en la fila de la pieza.
 *
 * Deliberadamente NO reusa ese endpoint ni lo modifica: tiene otro contrato (canvas
 * custom con nombre libre), y mezclarlos haría que "activar Diagnóstico" y "crear un
 * canvas de notas" compartan camino cuando son cosas distintas.
 *
 * Guarda: acceso al cliente del proyecto. Activar es trabajo diario del CSE sobre SU
 * proyecto —la misma clase que marcar un gate de etapa—, no curaduría de cartera. Y es
 * no destructivo por construcción: crea o reenciende, nunca borra.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { ensurePieceCanvas, PieceNotActivatableError } from "@/lib/pieces/ensure-canvas";
import { pieceBySlug } from "@/lib/pieces/registry";

type Params = Promise<{ projectId: string; slug: string }>;

export async function POST(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, slug } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  try {
    const { canvasId, outcome } = await ensurePieceCanvas(projectId, slug);
    return NextResponse.json({
      canvasId,
      outcome,
      label: pieceBySlug(slug)?.label ?? slug,
    });
  } catch (e) {
    if (e instanceof PieceNotActivatableError) {
      // Mismo contrato que el resto de los guards de precondición del sistema:
      // { error, message } con el motivo en español. El front lo muestra tal cual.
      return NextResponse.json({ error: "PIECE_NOT_ACTIVATABLE", message: e.message }, { status: 400 });
    }
    throw e;
  }
}
