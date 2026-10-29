import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";

// ─── DESACTIVADO ─────────────────────────────────────────────────────────────
// El JSON de Project.canvas ya no se lee ni se escribe: los documentos del proyecto son
// ProjectCanvas, con sus secciones (CanvasSection) y bloques (CanvasBlock).
// Este endpoint se mantiene pero retorna vacío / rechaza escrituras.
// Para leer los documentos, usar GET /api/projects/[projectId]/canvases; para editarlos,
// /api/projects/[projectId]/canvas-sections/[sectionId]/blocks.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  return NextResponse.json({
    canvas: null,
    message: "DEPRECATED: Los documentos del proyecto se leen desde /api/projects/" + projectId + "/canvases",
  });
}

export async function PUT(
  _req: NextRequest,
) {
  return NextResponse.json(
    { error: "DEPRECATED: El canvas de proyecto ya no acepta escritura directa. Los documentos se editan por sus secciones y bloques (/canvas-sections/[sectionId]/blocks)." },
    { status: 410 }
  );
}
