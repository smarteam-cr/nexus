import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = Promise<{ projectId: string; sectionId: string }>;

/**
 * PATCH /api/projects/[projectId]/canvas-sections/[sectionId]
 *
 * Actualiza metadatos de una sección de canvas. Hoy: `titleOverride` — el título de
 * cara al cliente que el CSE edita en la landing del Kickoff. String vacío / null →
 * vuelve al título por defecto de la plantilla (SECTION_META). Guarded (interno/CSE).
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // La sección debe pertenecer a un canvas de ESTE proyecto (no confiar en el id suelto).
  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: { id: true, canvas: { select: { projectId: true } } },
  });
  if (!section || section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }

  let body: { titleOverride?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!("titleOverride" in body)) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const raw = body.titleOverride;
  const titleOverride =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  const updated = await prisma.canvasSection.update({
    where: { id: sectionId },
    data: { titleOverride },
    select: { id: true, titleOverride: true },
  });

  return NextResponse.json(updated);
}
