/**
 * PATCH /api/projects/[projectId]/timeline/tasks/[taskId]
 *
 * Cambio de estado de UNA tarea del cronograma — la interacción más frecuente
 * del Gantt interno. Endpoint dedicado a propósito:
 *   - por PUT bulk habría que reescribir el árbol completo por cada click,
 *     con carrera entre dos PUT concurrentes pisándose;
 *   - el estado viaja SOLO por acá (PUT = estructura, PATCH = operación).
 *
 * Reglas D.1 (deliberadas, para no contaminar las heurísticas de D.2):
 *   - NO flipea `source` (precedente: cambios de solo-status en blocks).
 *   - NO toca `lastEditedByHuman` (esa señal es de ediciones estructurales).
 * En D.1 el estado lo pone el CSE a mano; el agente solo crea PENDING.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TimelineTaskStatus } from "@prisma/client";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await params;
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

  // Ownership por traversal: la task debe pertenecer a una fase del timeline
  // de ESTE proyecto (no alcanza con que exista el id).
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: { projectId } } },
    select: { id: true, actualStart: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Tarea no encontrada en este proyecto" }, { status: 404 });
  }

  // D.3 fundación — además del status, capturar la fecha REAL de ejecución.
  const updated = await prisma.timelineTask.update({
    where: { id: taskId },
    data: {
      status: status as TimelineTaskStatus,
      ...actualDatesPatch(status as TimelineTaskStatus, { actualStart: task.actualStart }),
    },
    select: { id: true, status: true, actualStart: true, actualEnd: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
