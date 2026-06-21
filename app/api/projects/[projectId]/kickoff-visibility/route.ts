/**
 * /api/projects/[projectId]/kickoff-visibility
 *
 * #3 — visibilidad por sección/proceso del kickoff del cliente, gestionada DESDE el
 * canvas del kickoff (no desde el modal de acceso). Project.hiddenKickoffKeys guarda
 * las claves OCULTAS; una clave puede ser el id de una CanvasSection, "procesos",
 * "cronograma", o el id de un proceso (flowchart) individual.
 *
 *   GET   → { hiddenKeys }
 *   PATCH { hiddenKeys: string[] } → reemplaza el set completo (el editor lo manda al subir)
 *
 * Guarded. El gate de la vista del cliente vive en lib/external/kickoff-view.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hiddenKickoffKeys: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  return NextResponse.json({ hiddenKeys: project.hiddenKickoffKeys });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { hiddenKeys?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (!Array.isArray(body.hiddenKeys) || body.hiddenKeys.some((k) => typeof k !== "string")) {
    return NextResponse.json({ error: "hiddenKeys debe ser string[]" }, { status: 400 });
  }
  // El editor manda el SET COMPLETO al "Subir cambios" (cambios staged). Reemplazo total.
  const hiddenKeys = [...new Set(body.hiddenKeys as string[])];

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { hiddenKickoffKeys: hiddenKeys },
    select: { hiddenKickoffKeys: true },
  });
  return NextResponse.json({ hiddenKeys: updated.hiddenKickoffKeys });
}
