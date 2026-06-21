/**
 * PATCH /api/projects/[projectId]/timeline/phases/[phaseId]
 *
 * Cambio de estado de UNA fase del cronograma (D.2). Espejo del PATCH de tareas
 * (timeline/tasks/[taskId]): el status es operación, no estructura.
 *
 * Mismas reglas (deliberadas): NO flipea `source` ni toca `lastEditedByHuman`.
 * El status de la fase lo pone el CSE a mano o al confirmar el borrador de avance;
 * el agente solo lo PROPONE (pendingProgress), nunca lo escribe.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TimelineTaskStatus } from "@prisma/client";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  const { projectId, phaseId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const status = (raw as { status?: unknown })?.status;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status debe ser uno de ${STATUSES.join("|")}` },
      { status: 400 },
    );
  }

  // Ownership: la fase debe pertenecer al timeline de ESTE proyecto.
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, timeline: { projectId } },
    select: { id: true, actualStart: true },
  });
  if (!phase) {
    return NextResponse.json({ error: "Fase no encontrada en este proyecto" }, { status: 404 });
  }

  // D.3 fundación — además del status, capturar la fecha REAL de ejecución.
  const updated = await prisma.timelinePhase.update({
    where: { id: phaseId },
    data: {
      status: status as TimelineTaskStatus,
      ...actualDatesPatch(status as TimelineTaskStatus, { actualStart: phase.actualStart }),
    },
    select: { id: true, status: true, actualStart: true, actualEnd: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
