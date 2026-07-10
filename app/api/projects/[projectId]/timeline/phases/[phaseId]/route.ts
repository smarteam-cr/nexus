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
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TimelineTaskStatus } from "@prisma/client";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  const { projectId, phaseId } = await params;
  const guard = await guardTimelineEdit(projectId);
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

  // Ownership: la fase debe pertenecer al timeline de ESTE proyecto. name/status/
  // clientId extra alimentan el evento del watchdog (Éxito del cliente).
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, timeline: { projectId } },
    select: {
      id: true,
      name: true,
      status: true,
      actualStart: true,
      timeline: { select: { id: true, project: { select: { clientId: true } } } },
    },
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

  // Evento crudo para el watchdog (best-effort; skip si no-op).
  if (phase.status !== status) {
    await emitTimelineEventsSafe(
      prisma,
      {
        projectId,
        clientId: phase.timeline.project.clientId,
        timelineId: phase.timeline.id,
        actorEmail: guard.user.email ?? null,
        source: "UI_PATCH",
      },
      [
        {
          entityType: "PHASE",
          entityId: phase.id,
          label: phase.name,
          action: "STATUS_CHANGED",
          before: { status: phase.status },
          after: { status },
        },
      ],
    );
  }

  return NextResponse.json(updated);
}
