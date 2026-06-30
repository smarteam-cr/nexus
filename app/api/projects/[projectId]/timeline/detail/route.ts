/**
 * DELETE /api/projects/[projectId]/timeline/detail
 *
 * Borra SOLO el detalle del cronograma (todas las tareas) y quita la
 * confirmación — el esqueleto (fases, duraciones, anchor) queda intacto.
 *
 * Es la válvula de regeneración del agente de detalle: su idempotencia
 * saltea la corrida si existe alguna task, así que "regenerar" = borrar el
 * detalle acá + volver a correr el agente. El DELETE /timeline (completo)
 * sería demasiado grueso: destruye fases editadas y la fecha de arranque.
 *
 * `activityType` de las fases se CONSERVA deliberadamente: es información
 * válida de la fase, y el re-run del agente no la pisa (regla solo-si-null).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!tl) {
    return NextResponse.json({ deleted: false, reason: "no_timeline" }, { status: 404 });
  }

  const [{ count }] = await prisma.$transaction([
    prisma.timelineTask.deleteMany({ where: { phase: { timelineId: tl.id } } }),
    prisma.projectTimeline.update({
      where: { id: tl.id },
      data: { detailConfirmedAt: null, detailGeneratedByAgentRunId: null },
    }),
  ]);

  return NextResponse.json({ deleted: true, tasksDeleted: count });
}
