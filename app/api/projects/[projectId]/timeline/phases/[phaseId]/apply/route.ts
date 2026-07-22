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
import type { TimelineTaskStatus, TaskParty, TimelineTaskType } from "@prisma/client";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";
import { patchBaselinePhaseTasks } from "@/lib/timeline/baseline";
import { PARTY_VALUES, TASK_TYPE_VALUES } from "@/lib/timeline/validate";

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;

interface CuratedTask {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: TaskParty | null;
  type: TimelineTaskType | null;
  status: TimelineTaskStatus;
}

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
  const existingById = new Map(phase.tasks.map((t) => [t.id, t]));

  // Normalizar/validar el set curado. order se recalcula por semana desde la posición en el array.
  const perWeek = new Map<number, number>();
  const curated: CuratedTask[] = [];
  for (const raw of rawTasks) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    if (!title) continue;
    const id = typeof t.id === "string" && existingById.has(t.id) ? t.id : undefined;
    const wRaw = typeof t.weekIndex === "number" && Number.isInteger(t.weekIndex) ? t.weekIndex : 0;
    const weekIndex = Math.min(Math.max(wRaw, 0), Math.max(phase.durationWeeks - 1, 0));
    const order = perWeek.get(weekIndex) ?? 0;
    perWeek.set(weekIndex, order + 1);
    const partyRaw = typeof t.party === "string" ? t.party.toUpperCase() : "";
    const party = (PARTY_VALUES as readonly string[]).includes(partyRaw) ? (partyRaw as TaskParty) : null;
    const typeRaw = typeof t.type === "string" ? t.type.toUpperCase() : "";
    const type = (TASK_TYPE_VALUES as readonly string[]).includes(typeRaw) ? (typeRaw as TimelineTaskType) : null;
    const statusRaw = typeof t.status === "string" ? t.status.toUpperCase() : "";
    const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as TimelineTaskStatus) : "PENDING";
    curated.push({
      id,
      title,
      weekIndex,
      order,
      notes: typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null,
      party,
      type,
      status,
    });
  }

  const now = new Date();
  const keptIds = new Set(curated.filter((c) => c.id).map((c) => c.id as string));

  await prisma.$transaction(async (tx) => {
    // DELETE — tareas de la fase que el CSE quitó del set.
    const toDelete = phase.tasks.filter((t) => !keptIds.has(t.id)).map((t) => t.id);
    if (toDelete.length > 0) {
      await tx.timelineTask.deleteMany({ where: { id: { in: toDelete } } });
    }

    // UPDATE (id existente) / CREATE (sin id).
    const toCreate: Prisma.TimelineTaskCreateManyInput[] = [];
    for (const c of curated) {
      if (c.id) {
        const prev = existingById.get(c.id)!;
        const contentChanged =
          prev.title !== c.title ||
          prev.weekIndex !== c.weekIndex ||
          prev.order !== c.order ||
          (prev.notes ?? null) !== c.notes ||
          (prev.party ?? null) !== c.party ||
          (prev.type ?? null) !== c.type;
        const statusChanged = prev.status !== c.status;
        await tx.timelineTask.update({
          where: { id: c.id },
          data: {
            title: c.title,
            weekIndex: c.weekIndex,
            order: c.order,
            notes: c.notes,
            party: c.party,
            type: c.type,
            // Editar contenido de una tarea AGENT la vuelve MODIFIED (curación) + limpia needsValidation.
            ...(contentChanged && prev.source === "AGENT" ? { source: "MODIFIED" as const, needsValidation: false } : {}),
            // Status por tarea (marcar hecha en el modal): procedencia HUMAN + sella fechas reales.
            ...(statusChanged
              ? {
                  status: c.status,
                  statusSource: "HUMAN" as const,
                  statusChangedByEmail: guard.user.email ?? null,
                  statusChangedAt: now,
                  ...actualDatesPatch(c.status, { actualStart: prev.actualStart }),
                }
              : {}),
          },
        });
      } else {
        const dates = actualDatesPatch(c.status, { actualStart: null }, now);
        toCreate.push({
          phaseId,
          title: c.title,
          weekIndex: c.weekIndex,
          order: c.order,
          notes: c.notes,
          party: c.party,
          type: c.type,
          needsValidation: false,
          source: "AGENT",
          status: c.status,
          // Si el CSE la marcó hecha, sella las fechas y la procedencia humana.
          ...(c.status !== "PENDING"
            ? { statusSource: "HUMAN" as const, statusChangedByEmail: guard.user.email ?? null, statusChangedAt: now, ...dates }
            : {}),
        });
      }
    }
    if (toCreate.length > 0) {
      await tx.timelineTask.createMany({ data: toCreate });
    }

    // Baseline: parche in-place de esta fase (proyectos publicados) → portafolio sin falso scope-creep.
    await patchBaselinePhaseTasks(tx, timelineId, phaseId);

    // Coherencia fase↔tarea: si TODAS quedan resueltas → fase DONE; si deja de estarlo y estaba DONE → reabrir.
    const after = await tx.timelinePhase.findUnique({
      where: { id: phaseId },
      select: { status: true, actualStart: true, tasks: { select: { status: true } } },
    });
    if (after && after.tasks.length > 0) {
      const allResolved = after.tasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
      const meta = { statusSource: "HUMAN" as const, statusChangedByEmail: guard.user.email ?? null, statusChangedAt: now };
      if (allResolved && after.status !== "DONE") {
        await tx.timelinePhase.update({
          where: { id: phaseId },
          data: { status: "DONE", actualEnd: now, ...(after.actualStart ? {} : { actualStart: now }), ...meta },
        });
      } else if (!allResolved && after.status === "DONE") {
        await tx.timelinePhase.update({ where: { id: phaseId }, data: { status: "IN_PROGRESS", ...meta } });
      }
    }

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
