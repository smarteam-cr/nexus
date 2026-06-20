/**
 * /api/projects/[projectId]/procesos-visibility
 *
 * #3 — controla si la sección de PROCESOS se muestra en el kickoff del cliente.
 * Procesos NO es una superficie con link propio (vive DENTRO del kickoff), por eso
 * es un toggle aparte y no un publish-* como kickoff/cronograma. Reversible, no
 * borra datos ni afecta la regeneración de los agentes.
 *
 *   GET    → { hidden }
 *   PATCH { hidden: boolean } → setea Project.procesosHiddenFromKickoff
 *
 * Guarded con guardAccessToProject. El gate se aplica en lib/external/kickoff-view.ts
 * (vista del cliente) y en /procesos (preview interno del CSE).
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
    select: { procesosHiddenFromKickoff: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }

  return NextResponse.json({ hidden: project.procesosHiddenFromKickoff });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { hidden?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "body.hidden debe ser boolean" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { procesosHiddenFromKickoff: body.hidden },
    select: { procesosHiddenFromKickoff: true },
  });

  return NextResponse.json({ hidden: updated.procesosHiddenFromKickoff });
}
