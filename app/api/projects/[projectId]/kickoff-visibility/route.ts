/**
 * /api/projects/[projectId]/kickoff-visibility
 *
 * #3 — visibilidad por sección/proceso del kickoff del cliente, gestionada DESDE el
 * canvas del kickoff (no desde el modal de acceso). Project.hiddenKickoffKeys guarda
 * las claves OCULTAS; una clave puede ser el id de una CanvasSection, "procesos",
 * "cronograma", o el id de un proceso (flowchart) individual.
 *
 *   GET   → { hiddenKeys }
 *   PATCH { key: string, hidden: boolean } → agrega/saca la clave del set
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

  let body: { key?: unknown; hidden?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Falta 'key'" }, { status: 400 });
  }
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "'hidden' debe ser boolean" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hiddenKickoffKeys: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }

  const set = new Set(project.hiddenKickoffKeys);
  if (body.hidden) set.add(key);
  else set.delete(key);
  const hiddenKeys = [...set];

  await prisma.project.update({
    where: { id: projectId },
    data: { hiddenKickoffKeys: hiddenKeys },
    select: { id: true },
  });
  return NextResponse.json({ hiddenKeys });
}
