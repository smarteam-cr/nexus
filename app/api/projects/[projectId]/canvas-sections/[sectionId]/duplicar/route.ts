import { NextResponse } from "next/server";
import { denyHandoffCanvasEditForCse, guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { duplicarSeccion, ErrorDeSeccion } from "@/lib/canvas/secciones-del-documento-server";

type Params = Promise<{ projectId: string; sectionId: string }>;

/**
 * POST — DUPLICA la sección justo debajo (2026-11-12, el «Duplicar» del menú de cada sección): una sección propia con el
 * mismo contenido, que se pinta igual que la original, se edita a mano y regenerar no toca. La portada, el cierre y lo
 * que lee el proyecto no se duplican. La regla entera: lib/canvas/secciones-del-documento-server.ts.
 */
export async function POST(_req: Request, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: { canvas: { select: { projectId: true, name: true } } },
  });
  if (!section || section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(section.canvas.name);
  if (denied) return denied;

  try {
    const { id } = await duplicarSeccion(projectId, sectionId);
    const copia = await prisma.canvasSection.findUnique({ where: { id }, include: { blocks: { orderBy: { order: "asc" } } } });
    return NextResponse.json({ section: { ...copia, hidden: false } }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorDeSeccion) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
