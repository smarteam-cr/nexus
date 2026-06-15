import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { readClientProcesos } from "@/lib/canvas/read-procesos";

/**
 * GET /api/projects/[projectId]/procesos
 *
 * Diagramas de proceso (FLOWCHART) del CLIENTE del proyecto — viven a nivel cliente
 * (canvas "Información del cliente"). Los consume el preview interno del Kickoff para
 * renderizar la sección "Procesos". Modo interno → devuelve TODOS (draft + confirmados);
 * el cliente externo ve solo los CONFIRMED vía kickoff-view.ts. Guarded.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return NextResponse.json({ procesos: [] });

  const procesos = await readClientProcesos(project.clientId);
  return NextResponse.json({ procesos });
}
