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
 *
 * #3 — si el proyecto oculta procesos del kickoff (procesosHiddenFromKickoff), el
 * preview interno también los esconde (FIEL a la vista del cliente) → devuelve [].
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
    select: { clientId: true, procesosHiddenFromKickoff: true },
  });
  if (!project) return NextResponse.json({ procesos: [] });

  // Preview FIEL a la vista del cliente: si procesos está oculto del kickoff,
  // acá tampoco se muestra (mismo gate que kickoff-view.ts).
  if (project.procesosHiddenFromKickoff) {
    return NextResponse.json({ procesos: [], hiddenFromKickoff: true });
  }

  const procesos = await readClientProcesos(project.clientId);
  return NextResponse.json({ procesos, hiddenFromKickoff: false });
}
