import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";

// ─── DESACTIVADO ─────────────────────────────────────────────────────────────
// El canvas de proyecto ahora se construye desde ClientContextCard con canvasSection.
// El JSON de Project.canvas ya no se lee ni se escribe.
// Este endpoint se mantiene pero retorna vacío / rechaza escrituras.
// Para leer el canvas, usar GET /api/projects/[id]/canvas-cards

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  return NextResponse.json({
    canvas: null,
    message: "DEPRECATED: El canvas de proyecto ahora se lee desde /api/projects/" + projectId + "/canvas-cards",
  });
}

export async function PUT(
  _req: NextRequest,
) {
  return NextResponse.json(
    { error: "DEPRECATED: El canvas de proyecto ya no acepta escritura directa. Usar send-to-canvas para enviar cards." },
    { status: 410 }
  );
}
