import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { ErrorDeSeccion, seccionesQueSePuedenAgregar } from "@/lib/canvas/secciones-del-documento-server";

/**
 * GET ?canvasId= — las secciones del CATÁLOGO del tipo del documento que «+ Agregar sección» puede ofrecer (2026-11-12).
 * Vive en el servidor porque el catálogo sale de las defs y las plantillas (lib/artefactos/catalogo.ts), que no se
 * cargan en la pantalla. Lo que se ofrece y por qué: lib/canvas/secciones-agregadas.ts.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");
  if (!canvasId) return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  try {
    return NextResponse.json({ secciones: await seccionesQueSePuedenAgregar(projectId, canvasId) });
  } catch (e) {
    if (e instanceof ErrorDeSeccion) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
