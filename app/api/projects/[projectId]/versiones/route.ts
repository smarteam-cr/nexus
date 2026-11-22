import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { documentoDelProyecto } from "@/lib/canvas/versiones-acceso";
import { historialDelCanvas } from "@/lib/canvas/historial-del-documento-server";

/**
 * GET /api/projects/[projectId]/versiones?canvasId= — el historial de versiones de un documento (21 nov,
 * lib/canvas/historial-del-documento-server.ts): las versiones, la más nueva primero, con cuál es la actual y cuál ve
 * el cliente, y el documento como está hoy (`actual`, para marcar lo distinto en la vista previa). El contenido de cada
 * versión lo trae el detalle.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = req.nextUrl.searchParams.get("canvasId") ?? "";
  const canvas = canvasId ? await documentoDelProyecto(projectId, canvasId) : null;
  if (!canvas) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const h = await historialDelCanvas(canvas.id);
  if (!h) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  return NextResponse.json(h);
}
