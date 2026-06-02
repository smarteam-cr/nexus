import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * PATCH /api/sessions/[id]/projects/[projectId]
 *
 * Modifica un SessionProject específico. Body soporta:
 *   - makePrimary: true → promueve este a primario, demoter al anterior.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: sessionId, projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { makePrimary?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await prisma.sessionProject.findUnique({
    where: { sessionId_projectId: { sessionId, projectId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Asignación no existe" }, { status: 404 });
  }

  if (body.makePrimary === true) {
    // Demoter al actual primario (si no es éste)
    await prisma.sessionProject.updateMany({
      where: { sessionId, isPrimary: true, NOT: { projectId } },
      data: { isPrimary: false },
    });
    const updated = await prisma.sessionProject.update({
      where: { sessionId_projectId: { sessionId, projectId } },
      data: { isPrimary: true, source: "manual" },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(existing);
}

/**
 * DELETE /api/sessions/[id]/projects/[projectId]
 *
 * Quita el proyecto de la sesión. Si era el primario, no se promueve a otro
 * automáticamente — el CSE debe elegir.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: sessionId, projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  try {
    await prisma.sessionProject.delete({
      where: { sessionId_projectId: { sessionId, projectId } },
    });
  } catch {
    return NextResponse.json({ error: "Asignación no existe" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
