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
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TimelineTaskStatus } from "@prisma/client";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await params;
  // Cambiar estado es EDITAR el cronograma → exige editTimeline (la tiene TODO interno,
  // incluido el CSE) + acceso al cliente del proyecto. Lo único reservado a no-CSE es BORRAR.
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

  // Ownership por traversal: la task debe pertenecer a una fase del timeline
  // de ESTE proyecto (no alcanza con que exista el id). title/status/clientId
  // extra alimentan el evento del watchdog (Éxito del cliente).
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: { projectId } } },
    select: {
      id: true,
      title: true,
      status: true,
      actualStart: true,
      phaseId: true,
      phase: { select: { timeline: { select: { id: true, project: { select: { clientId: true } } } } } },
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Tarea no encontrada en este proyecto" }, { status: 404 });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // D.3 fundación — además del status, capturar la fecha REAL de ejecución.
    const u = await tx.timelineTask.update({
      where: { id: taskId },
      data: {
        status: status as TimelineTaskStatus,
        // Check manual del CSE → procedencia HUMAN (incluye el desmarcado a PENDING: decisión
        // humana explícita). Hace explícito el invariante "status != PENDING ⟹ humano".
        statusSource: "HUMAN",
        statusChangedByEmail: guard.user.email ?? null,
        statusChangedAt: now,
        ...actualDatesPatch(status as TimelineTaskStatus, { actualStart: task.actualStart }),
      },
      select: { id: true, status: true, actualStart: true, actualEnd: true, updatedAt: true },
    });

    // Coherencia fase↔tarea: una fase CON tareas queda DONE sii TODAS están resueltas
    // (DONE/SUSPENDED); si deja de estarlo y estaba DONE, reabre a IN_PROGRESS. Así marcar la
    // última tarea cierra la fase y reabrir una tarea reabre la fase (sin esto, la fase quedaba
    // "en curso" con todo hecho). Fechas monótonas (solo se setean, nunca se borran).
    const phase = await tx.timelinePhase.findUnique({
      where: { id: task.phaseId },
      select: { status: true, actualStart: true, tasks: { select: { status: true } } },
    });
    if (phase && phase.tasks.length > 0) {
      const allResolved = phase.tasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
      // El cambio de estado de la fase es DERIVADO de la acción humana del CSE → también HUMAN.
      const phaseStatusMeta = { statusSource: "HUMAN" as const, statusChangedByEmail: guard.user.email ?? null, statusChangedAt: now };
      if (allResolved && phase.status !== "DONE") {
        await tx.timelinePhase.update({
          where: { id: task.phaseId },
          data: { status: "DONE", actualEnd: now, ...(phase.actualStart ? {} : { actualStart: now }), ...phaseStatusMeta },
        });
      } else if (!allResolved && phase.status === "DONE") {
        await tx.timelinePhase.update({ where: { id: task.phaseId }, data: { status: "IN_PROGRESS", ...phaseStatusMeta } });
      }
    }

    return u;
  });

  // Evento crudo para el watchdog — POST-tx y best-effort (como los otros 6 endpoints
  // instrumentados): un fallo del insert de telemetría NUNCA rollbackea ni 500ea el
  // cambio de status, que es la interacción más frecuente del Gantt. Skip si no-op.
  // El auto-cierre/reapertura de fase NO se emite: es derivativo (el watchdog lo
  // infiere del estado de las tareas).
  if (task.status !== status) {
    await emitTimelineEventsSafe(
      prisma,
      {
        projectId,
        clientId: task.phase.timeline.project.clientId,
        timelineId: task.phase.timeline.id,
        actorEmail: guard.user.email ?? null,
        source: "UI_PATCH",
      },
      [
        {
          entityType: "TASK",
          entityId: task.id,
          label: task.title,
          action: "STATUS_CHANGED",
          before: { status: task.status },
          after: { status },
        },
      ],
    );
  }

  return NextResponse.json(updated);
}
