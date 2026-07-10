/**
 * POST /api/projects/[projectId]/timeline/tasks
 *
 * Agrega UNA tarea al cronograma. Endpoint dedicado (no por el PUT bulk) para el
 * gesto "+ tarea" del Gantt. Gateado por `guardAccessToProject` (acceso al cliente);
 * agregar/editar/mover/poner fechas lo puede TODO interno —incluido el CSE— vía
 * `editTimeline`. Lo único reservado a no-CSE es BORRAR (`deleteTimeline`).
 *
 * La tarea nace `source=HUMAN`, `status=PENDING`. El `order` se calcula al final
 * de su semana. La edición/estado posteriores van por PUT/PATCH (guardTimelineEdit).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TaskParty, TimelineTaskType } from "@prisma/client";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

const PARTIES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;
const TYPES = ["SESSION", "TASK"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = raw as {
    phaseId?: unknown;
    title?: unknown;
    weekIndex?: unknown;
    party?: unknown;
    type?: unknown;
  } | null;

  const phaseId = typeof body?.phaseId === "string" ? body.phaseId : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const weekIndexRaw = body?.weekIndex;
  if (!phaseId) return NextResponse.json({ error: "phaseId requerido" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "El título de la tarea es obligatorio" }, { status: 400 });
  if (typeof weekIndexRaw !== "number" || !Number.isInteger(weekIndexRaw) || weekIndexRaw < 0) {
    return NextResponse.json({ error: "weekIndex debe ser un entero ≥ 0" }, { status: 400 });
  }
  const party =
    typeof body?.party === "string" && (PARTIES as readonly string[]).includes(body.party)
      ? (body.party as TaskParty)
      : null;
  const type =
    typeof body?.type === "string" && (TYPES as readonly string[]).includes(body.type)
      ? (body.type as TimelineTaskType)
      : null;

  // Ownership por traversal: la fase debe pertenecer al timeline de ESTE proyecto.
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, timeline: { projectId } },
    select: {
      id: true,
      durationWeeks: true,
      timeline: { select: { id: true, project: { select: { clientId: true } } } },
    },
  });
  if (!phase) {
    return NextResponse.json({ error: "Fase no encontrada en este proyecto" }, { status: 404 });
  }
  const weekIndex = Math.min(weekIndexRaw, Math.max(phase.durationWeeks - 1, 0));

  // order = al final de su semana.
  const order = await prisma.timelineTask.count({ where: { phaseId, weekIndex } });

  const created = await prisma.timelineTask.create({
    data: { phaseId, title, weekIndex, order, party, type, source: "HUMAN", status: "PENDING" },
    select: { id: true, title: true, weekIndex: true, order: true, party: true, type: true, status: true, source: true },
  });

  // Evento crudo para el watchdog (best-effort).
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
        entityType: "TASK",
        entityId: created.id,
        label: created.title,
        action: "CREATED",
        after: { weekIndex: created.weekIndex, party: created.party, type: created.type },
      },
    ],
  );

  return NextResponse.json({ task: created }, { status: 201 });
}
