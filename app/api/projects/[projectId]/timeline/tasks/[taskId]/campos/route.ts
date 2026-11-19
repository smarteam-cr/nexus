/**
 * /api/projects/[projectId]/timeline/tasks/[taskId]/campos — editar o borrar UNA tarea sin mandar el cronograma entero
 * (2026-11-19, el plan general de la cuenta). El plan general muestra tareas de varios proyectos y edita cada una en su
 * proyecto: por el PUT bulk tendría que reescribir el árbol de cada cronograma por cada clic.
 *
 *   PATCH  { title?, notes?, tipoDeTrabajo?, weekIndex?, semanas? } → guardTimelineEdit (todo interno, incluido el CSE).
 *          La tarea tiene que caber en su fase: weekIndex + semanas ≤ durationWeeks (400 si no). Una tarea de la IA pasa a
 *          MODIFIED, como en el PUT. El estado NO va acá: sigue en el PATCH de la tarea (fase, tiempos y watchdog).
 *   DELETE → guardTimelineDelete (todos menos el CSE: el CSE suspende, no borra).
 *
 * Como el autoguardado del Gantt, no escribe TimelineChange: el historial con motivo vive en «Subir» y en la IA. Sí
 * marca `lastEditedByHuman` y le avisa al vigía de Éxito del cliente (MOVED / EDITED / DELETED), como el PUT. El Gantt del proyecto abierto en otra pestaña lo nota por la versión del cronograma (T2).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineDelete, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { esTipoDeTrabajo } from "@/lib/plan-general/tipos";

type Ctx = { params: Promise<{ projectId: string; taskId: string }> };

function entero(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "number" && Number.isInteger(v) ? v : NaN;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, taskId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") throw new Error();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: { title?: string; notes?: string | null; tipoDeTrabajo?: string | null; weekIndex?: number; semanas?: number | null } = {};
  if (raw.title !== undefined) {
    const t = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!t) return NextResponse.json({ error: "La actividad necesita un nombre." }, { status: 400 });
    data.title = t;
  }
  if (raw.notes !== undefined) {
    if (raw.notes !== null && typeof raw.notes !== "string") return NextResponse.json({ error: "notes debe ser texto" }, { status: 400 });
    data.notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null;
  }
  if (raw.tipoDeTrabajo !== undefined) {
    if (raw.tipoDeTrabajo !== null && !esTipoDeTrabajo(raw.tipoDeTrabajo)) return NextResponse.json({ error: "Tipo de trabajo desconocido" }, { status: 400 });
    data.tipoDeTrabajo = raw.tipoDeTrabajo;
  }
  const weekIndex = entero(raw.weekIndex);
  const semanas = entero(raw.semanas);
  if (Number.isNaN(weekIndex) || (weekIndex != null && weekIndex < 0) || weekIndex === null) {
    return NextResponse.json({ error: "weekIndex debe ser un entero ≥ 0" }, { status: 400 });
  }
  if (Number.isNaN(semanas) || (semanas != null && semanas < 1)) {
    return NextResponse.json({ error: "semanas debe ser un entero ≥ 1" }, { status: 400 });
  }
  if (weekIndex !== undefined) data.weekIndex = weekIndex;
  if (semanas !== undefined) data.semanas = semanas === 1 ? null : semanas;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  // Ownership por traversal: la tarea es de una fase del cronograma de ESTE proyecto.
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: { projectId } } },
    select: { id: true, title: true, weekIndex: true, semanas: true, source: true, phase: { select: { durationWeeks: true, timelineId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada en este proyecto" }, { status: 404 });

  // Solo cuando cambian las semanas: renombrar una tarea que ya se pasaba de su fase (la fase se acortó en el Gantt)
  // tiene que seguir funcionando.
  const desde = data.weekIndex ?? task.weekIndex;
  const dura = data.semanas !== undefined ? (data.semanas ?? 1) : (task.semanas ?? 1);
  const cambianLasSemanas = data.weekIndex !== undefined || data.semanas !== undefined;
  if (cambianLasSemanas && desde + dura > Math.max(task.phase.durationWeeks, 1)) {
    return NextResponse.json(
      { error: `La actividad se sale de su loop: termina en la semana ${desde + dura} y el loop tiene ${task.phase.durationWeeks}.` },
      { status: 400 },
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.timelineTask.update({
      where: { id: taskId },
      // Editarla es revisarla: deja de estar «por validar» (como en el Gantt) y una tarea de la IA pasa a MODIFIED.
      data: { ...data, needsValidation: false, ...(task.source === "AGENT" ? { source: "MODIFIED" as const } : {}) },
      select: { id: true, title: true, notes: true, tipoDeTrabajo: true, weekIndex: true, semanas: true, updatedAt: true },
    }),
    prisma.projectTimeline.update({ where: { id: task.phase.timelineId }, data: { lastEditedByHuman: now } }),
  ]);
  const movida = data.weekIndex !== undefined && data.weekIndex !== task.weekIndex;
  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId: task.phase.timelineId, actorEmail: guard.user.email ?? null, source: "UI_PATCH" },
    [
      {
        entityType: "TASK",
        entityId: task.id,
        label: updated.title,
        action: movida ? "MOVED" : "EDITED",
        before: movida ? { weekIndex: task.weekIndex } : {},
        after: movida ? { weekIndex: updated.weekIndex } : {},
      },
    ],
  );
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { projectId, taskId } = await params;
  const guard = await guardTimelineDelete(projectId);
  if (guard instanceof NextResponse) return guard;
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: { projectId } } },
    select: { id: true, title: true, phase: { select: { timelineId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada en este proyecto" }, { status: 404 });
  await prisma.$transaction([
    prisma.timelineTask.delete({ where: { id: taskId } }),
    prisma.projectTimeline.update({ where: { id: task.phase.timelineId }, data: { lastEditedByHuman: new Date() } }),
  ]);
  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId: task.phase.timelineId, actorEmail: guard.user.email ?? null, source: "UI_PATCH" },
    [{ entityType: "TASK", entityId: task.id, label: task.title, action: "DELETED" }],
  );
  return NextResponse.json({ ok: true });
}
