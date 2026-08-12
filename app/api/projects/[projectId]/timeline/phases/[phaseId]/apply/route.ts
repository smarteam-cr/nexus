/**
 * POST /api/projects/[projectId]/timeline/phases/[phaseId]/apply
 *
 * Aplica el set CURADO de tareas de UNA fase (modal de curación viejo↔nuevo). Reemplaza las tareas
 * de la fase por el set que definió el CSE en el modal, EN UNA transacción:
 *   - Tareas con `id` presente → UPDATE (contenido; flip AGENT→MODIFIED si cambió; status vía
 *     actualDatesPatch si viene). Preserva actualStart/actualEnd.
 *   - Tareas sin `id` → CREATE (source AGENT; status DONE sella fechas, o PENDING).
 *   - Tareas de la fase omitidas del set → DELETE.
 *   - patchBaselinePhaseTasks → el portafolio D.3 no reporta falso scope-creep en proyectos publicados.
 *   - Invalida pendingProgress (ids nuevos) + lastEditedByHuman (marca "cambios sin subir").
 *   - Recalcula el status de la fase (auto-cierre si todas resueltas).
 *
 * A diferencia del PUT del timeline (que NO acepta status por tarea y fuerza PENDING), acá el status
 * SÍ viaja por tarea: es la única forma de que el CSE marque hechas las tareas en el modal y el agente
 * de re-chequeo de avance las respete (lee TimelineTask.status).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { normalizeCuratedTasks, applyCuratedPhaseTasks } from "@/lib/timeline/apply-curated-phase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  const { projectId, phaseId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const rawTasks = (body as { tasks?: unknown })?.tasks;
  if (!Array.isArray(rawTasks)) {
    return NextResponse.json({ error: "Falta la lista de tareas" }, { status: 400 });
  }
  const reason =
    typeof (body as { reason?: unknown })?.reason === "string" && (body as { reason: string }).reason.trim()
      ? (body as { reason: string }).reason.trim()
      : "Regeneración de la fase (curada)";

  // La fase debe pertenecer al timeline de ESTE proyecto.
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: phaseId, timeline: { projectId } },
    select: {
      id: true,
      status: true,
      durationWeeks: true,
      timeline: { select: { id: true } },
      tasks: { select: { id: true, title: true, weekIndex: true, order: true, notes: true, party: true, type: true, source: true, status: true, actualStart: true } },
    },
  });
  if (!phase) {
    return NextResponse.json({ error: "La fase no existe en este proyecto" }, { status: 404 });
  }
  const timelineId = phase.timeline.id;
  const existingIds = new Set(phase.tasks.map((t) => t.id));
  const curated = normalizeCuratedTasks(rawTasks, phase.durationWeeks, existingIds);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await applyCuratedPhaseTasks(tx, {
      phaseId, timelineId, existingTasks: phase.tasks, curated, now,
      actorEmail: guard.user.email ?? null,
    });

    // Marca de edición humana ("cambios sin subir") + invalida el borrador de avance (ids nuevos).
    await tx.projectTimeline.update({
      where: { id: timelineId },
      data: { lastEditedByHuman: now, pendingProgress: Prisma.DbNull, pendingProgressRunId: null },
    });
  }, { maxWait: 10000, timeout: 30000 });

  // Audit best-effort POST-tx (no rollbackea): snapshot del estado resultante + razón.
  try {
    const snapPhases = await prisma.timelinePhase.findMany({
      where: { timelineId },
      orderBy: { order: "asc" },
      select: {
        id: true, name: true, order: true, durationWeeks: true, startWeek: true, sessionCount: true,
        activityType: true, status: true,
        tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { id: true, title: true, weekIndex: true, order: true, status: true } },
      },
    });
    const tlRow = await prisma.projectTimeline.findUnique({ where: { id: timelineId }, select: { anchorStartDate: true } });
    await prisma.timelineChange.create({
      data: {
        timelineId,
        reason,
        kind: "AI_ASSIST",
        instruction: `Regeneración curada de la fase (${phaseId})`,
        changedByEmail: guard.user.email ?? null,
        snapshot: {
          anchorStartDate: tlRow?.anchorStartDate?.toISOString() ?? null,
          phases: snapPhases,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[timeline/phases/apply] audit best-effort falló:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
