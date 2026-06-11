/**
 * /api/projects/[projectId]/timeline
 *
 * Endpoints del cronograma estructurado del proyecto (Fase 2 módulo externo;
 * extendido en D.1 con tareas anidadas + tipo de actividad).
 *
 *   GET    → estado actual del cronograma (o { exists: false } si no hay)
 *   PUT    → bulk edit: crea/edita/borra fases — y sus tareas — en una transacción
 *   DELETE → borra todo el cronograma (cascade borra phases y tasks)
 *
 * Todos guarded con guardAccessToProject. El acceso es interno (CSE) —
 * el cliente externo NUNCA toca este endpoint; su vista sale del chokepoint
 * lib/external/kickoff-view.ts (gated por detailConfirmedAt).
 *
 * Patrón de PUT bulk: el frontend manda el array completo de phases con cada
 * edición. Las phases con `id` que matchea existente → UPDATE (source pasa de
 * AGENT a MODIFIED si lo era). Phases existentes que no aparecen en el body
 * → DELETE. Phases del body sin `id` → CREATE con source=HUMAN.
 *
 * D.1 — tareas anidadas: cada phase puede traer `tasks`.
 *   - `tasks === undefined` → NO tocar las tareas de esa fase (backward compat:
 *     el payload del editor pre-D.1 no borra nada; anti-carrera con el Gantt).
 *   - `tasks: []` → borrar todas las tareas de la fase.
 *   - Diff por tarea: id→UPDATE (flip AGENT→MODIFIED SOLO si cambió contenido;
 *     el mismo cambio limpia needsValidation — humano revisó), ausente→DELETE,
 *     sin id→CREATE (source=HUMAN, status=PENDING).
 *   - El `status` NO viaja por acá: solo por PATCH /timeline/tasks/[taskId]
 *     (PUT = estructura, PATCH = operación).
 *
 * Si no existía cronograma y llega un PUT, se crea sobre la marcha
 * (lastEditedByHuman = now, todas las phases nacen como HUMAN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type {
  TimelinePhaseSource,
  TimelineActivityType,
  TimelineTaskStatus,
} from "@prisma/client";

// ── Tipos del body ───────────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
] as const;

interface TaskInput {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes?: string | null;
}

interface PhaseInput {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: TimelineActivityType | null;
  /** undefined = no tocar; [] = borrar todas; array = diff completo */
  tasks?: TaskInput[];
}

interface PutBody {
  anchorStartDate?: string | null;
  phases: PhaseInput[];
}

// ── Validador inline ─────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  parsed?: PutBody;
}

function validateTimelinePayload(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Body debe ser un objeto JSON"] };
  }
  const body = raw as Record<string, unknown>;

  // anchorStartDate (opcional)
  let anchorStartDate: string | null = null;
  if (body.anchorStartDate !== undefined && body.anchorStartDate !== null) {
    if (typeof body.anchorStartDate !== "string") {
      errors.push("anchorStartDate debe ser string ISO o null");
    } else {
      const d = new Date(body.anchorStartDate);
      if (isNaN(d.getTime())) {
        errors.push("anchorStartDate no es una fecha ISO válida");
      } else {
        anchorStartDate = body.anchorStartDate;
      }
    }
  }

  // phases (obligatorio, array)
  if (!Array.isArray(body.phases)) {
    errors.push("phases debe ser un array");
    return { valid: false, errors };
  }

  const parsedPhases: PhaseInput[] = [];
  body.phases.forEach((p, idx) => {
    if (!p || typeof p !== "object") {
      errors.push(`phases[${idx}] debe ser un objeto`);
      return;
    }
    const ph = p as Record<string, unknown>;
    if (typeof ph.name !== "string" || ph.name.trim().length === 0) {
      errors.push(`phases[${idx}].name requerido (string no vacío)`);
      return;
    }
    if (typeof ph.order !== "number" || !Number.isInteger(ph.order) || ph.order < 0) {
      errors.push(`phases[${idx}].order requerido (entero >= 0)`);
      return;
    }
    if (typeof ph.durationWeeks !== "number" || !Number.isInteger(ph.durationWeeks) || ph.durationWeeks <= 0) {
      errors.push(`phases[${idx}].durationWeeks requerido (entero > 0)`);
      return;
    }
    let sessionCount: number | null = null;
    if (ph.sessionCount !== undefined && ph.sessionCount !== null) {
      if (typeof ph.sessionCount !== "number" || !Number.isInteger(ph.sessionCount) || ph.sessionCount <= 0) {
        errors.push(`phases[${idx}].sessionCount debe ser entero > 0 o null`);
        return;
      }
      sessionCount = ph.sessionCount;
    }
    let notes: string | null = null;
    if (ph.notes !== undefined && ph.notes !== null) {
      if (typeof ph.notes !== "string") {
        errors.push(`phases[${idx}].notes debe ser string o null`);
        return;
      }
      notes = ph.notes;
    }
    let id: string | undefined;
    if (ph.id !== undefined) {
      if (typeof ph.id !== "string" || ph.id.length === 0) {
        errors.push(`phases[${idx}].id debe ser string no vacío si está presente`);
        return;
      }
      id = ph.id;
    }

    // D.1: activityType (opcional — undefined = sin cambio; null = quitar tipo)
    let activityType: TimelineActivityType | null | undefined = undefined;
    if (ph.activityType !== undefined) {
      if (ph.activityType === null) {
        activityType = null;
      } else if (
        typeof ph.activityType === "string" &&
        (ACTIVITY_TYPES as readonly string[]).includes(ph.activityType)
      ) {
        activityType = ph.activityType as TimelineActivityType;
      } else {
        errors.push(`phases[${idx}].activityType debe ser uno de ${ACTIVITY_TYPES.join("|")} o null`);
        return;
      }
    }

    // D.1: tasks (opcional — undefined = no tocar; [] = borrar todas)
    let tasks: TaskInput[] | undefined = undefined;
    if (ph.tasks !== undefined) {
      if (!Array.isArray(ph.tasks)) {
        errors.push(`phases[${idx}].tasks debe ser un array si está presente`);
        return;
      }
      const parsedTasks: TaskInput[] = [];
      let taskError = false;
      ph.tasks.forEach((t, tIdx) => {
        if (taskError) return;
        if (!t || typeof t !== "object") {
          errors.push(`phases[${idx}].tasks[${tIdx}] debe ser un objeto`);
          taskError = true;
          return;
        }
        const tk = t as Record<string, unknown>;
        if (typeof tk.title !== "string" || tk.title.trim().length === 0) {
          errors.push(`phases[${idx}].tasks[${tIdx}].title requerido (string no vacío)`);
          taskError = true;
          return;
        }
        if (
          typeof tk.weekIndex !== "number" ||
          !Number.isInteger(tk.weekIndex) ||
          tk.weekIndex < 0 ||
          tk.weekIndex >= (ph.durationWeeks as number)
        ) {
          errors.push(`phases[${idx}].tasks[${tIdx}].weekIndex debe ser entero en [0, durationWeeks)`);
          taskError = true;
          return;
        }
        if (typeof tk.order !== "number" || !Number.isInteger(tk.order) || tk.order < 0) {
          errors.push(`phases[${idx}].tasks[${tIdx}].order requerido (entero >= 0)`);
          taskError = true;
          return;
        }
        let tNotes: string | null = null;
        if (tk.notes !== undefined && tk.notes !== null) {
          if (typeof tk.notes !== "string") {
            errors.push(`phases[${idx}].tasks[${tIdx}].notes debe ser string o null`);
            taskError = true;
            return;
          }
          tNotes = tk.notes;
        }
        let tId: string | undefined;
        if (tk.id !== undefined) {
          if (typeof tk.id !== "string" || tk.id.length === 0) {
            errors.push(`phases[${idx}].tasks[${tIdx}].id debe ser string no vacío si está presente`);
            taskError = true;
            return;
          }
          tId = tk.id;
        }
        parsedTasks.push({
          id: tId,
          title: tk.title.trim(),
          weekIndex: tk.weekIndex,
          order: tk.order,
          notes: tNotes,
        });
      });
      if (taskError) return;
      tasks = parsedTasks;
    }

    parsedPhases.push({
      id,
      name: ph.name.trim(),
      order: ph.order,
      durationWeeks: ph.durationWeeks,
      sessionCount,
      notes,
      activityType,
      tasks,
    });
  });

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, parsed: { anchorStartDate, phases: parsedPhases } };
}

// ── Helpers de respuesta ─────────────────────────────────────────────────────

interface TimelineTaskResponse {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  status: TimelineTaskStatus;
  notes: string | null;
  needsValidation: boolean;
  source: TimelinePhaseSource;
}

interface TimelineResponse {
  exists: true;
  anchorStartDate: string | null;
  lastEditedByHuman: string | null;
  generatedByAgentRunId: string | null;
  detailConfirmedAt: string | null;
  phases: Array<{
    id: string;
    name: string;
    order: number;
    durationWeeks: number;
    sessionCount: number | null;
    notes: string | null;
    activityType: TimelineActivityType | null;
    source: TimelinePhaseSource;
    tasks: TimelineTaskResponse[];
  }>;
}

async function loadTimeline(projectId: string): Promise<TimelineResponse | { exists: false }> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      anchorStartDate: true,
      lastEditedByHuman: true,
      generatedByAgentRunId: true,
      detailConfirmedAt: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          sessionCount: true,
          notes: true,
          activityType: true,
          source: true,
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: {
              id: true,
              title: true,
              weekIndex: true,
              order: true,
              status: true,
              notes: true,
              needsValidation: true,
              source: true,
            },
          },
        },
      },
    },
  });
  if (!tl) return { exists: false };
  return {
    exists: true,
    anchorStartDate: tl.anchorStartDate?.toISOString() ?? null,
    lastEditedByHuman: tl.lastEditedByHuman?.toISOString() ?? null,
    generatedByAgentRunId: tl.generatedByAgentRunId,
    detailConfirmedAt: tl.detailConfirmedAt?.toISOString() ?? null,
    phases: tl.phases,
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const result = await loadTimeline(projectId);
  return NextResponse.json(result);
}

// ── PUT (bulk edit con diff de fases y tareas) ───────────────────────────────

export async function PUT(
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

  const validation = validateTimelinePayload(raw);
  if (!validation.valid || !validation.parsed) {
    return NextResponse.json(
      { error: "Body inválido", details: validation.errors },
      { status: 400 },
    );
  }
  const { anchorStartDate, phases: incomingPhases } = validation.parsed;

  const now = new Date();
  const anchorDate = anchorStartDate ? new Date(anchorStartDate) : null;

  // Transacción: upsert del timeline + diff de phases + diff de tasks por phase
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Upsert del timeline
      const tl = await tx.projectTimeline.upsert({
        where: { projectId },
        create: {
          projectId,
          anchorStartDate: anchorDate,
          lastEditedByHuman: now,
          // generatedByAgentRunId queda null — cronograma creado a mano sin agente
        },
        update: {
          anchorStartDate: anchorDate,
          lastEditedByHuman: now,
        },
        select: { id: true },
      });

      // 2. Phases existentes en DB (con sus tasks para el diff anidado)
      const existingPhases = await tx.timelinePhase.findMany({
        where: { timelineId: tl.id },
        select: {
          id: true,
          source: true,
          tasks: {
            select: {
              id: true,
              title: true,
              weekIndex: true,
              order: true,
              notes: true,
              source: true,
            },
          },
        },
      });
      const existingById = new Map(existingPhases.map((p) => [p.id, p]));
      const incomingIds = new Set(
        incomingPhases.filter((p) => p.id).map((p) => p.id as string),
      );

      // 3. DELETE: phases en DB que no aparecen en el body (cascade borra tasks)
      const idsToDelete = existingPhases
        .filter((p) => !incomingIds.has(p.id))
        .map((p) => p.id);
      if (idsToDelete.length > 0) {
        await tx.timelinePhase.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      // 4. UPDATE + CREATE de phases (y diff de tasks donde venga el array)
      for (const p of incomingPhases) {
        const existing = p.id ? existingById.get(p.id) : undefined;

        let phaseId: string;
        if (p.id && existing) {
          // UPDATE: source AGENT → MODIFIED si fue editado por humano
          const newSource: TimelinePhaseSource =
            existing.source === "AGENT" ? "MODIFIED" : existing.source;
          await tx.timelinePhase.update({
            where: { id: p.id },
            data: {
              name: p.name,
              order: p.order,
              durationWeeks: p.durationWeeks,
              sessionCount: p.sessionCount,
              notes: p.notes,
              // undefined = sin cambio (Prisma ignora undefined)
              activityType: p.activityType,
              source: newSource,
            },
          });
          phaseId = p.id;
        } else {
          // CREATE: phase nueva, source=HUMAN
          const created = await tx.timelinePhase.create({
            data: {
              timelineId: tl.id,
              name: p.name,
              order: p.order,
              durationWeeks: p.durationWeeks,
              sessionCount: p.sessionCount,
              notes: p.notes,
              activityType: p.activityType ?? null,
              source: "HUMAN",
            },
            select: { id: true },
          });
          phaseId = created.id;
        }

        // ── Diff de tasks (solo si el body trae el array; undefined = no tocar) ──
        if (p.tasks === undefined) continue;

        const existingTasks = existing?.tasks ?? [];
        const existingTaskById = new Map(existingTasks.map((t) => [t.id, t]));
        const incomingTaskIds = new Set(
          p.tasks.filter((t) => t.id).map((t) => t.id as string),
        );

        // DELETE: tasks de la fase que no aparecen en el body
        const taskIdsToDelete = existingTasks
          .filter((t) => !incomingTaskIds.has(t.id))
          .map((t) => t.id);
        if (taskIdsToDelete.length > 0) {
          await tx.timelineTask.deleteMany({ where: { id: { in: taskIdsToDelete } } });
        }

        for (const t of p.tasks) {
          const existingTask = t.id ? existingTaskById.get(t.id) : undefined;
          if (t.id && !existingTask) {
            // id que no pertenece a esta fase → error de payload
            throw Object.assign(new Error(`Task ${t.id} no pertenece a la fase ${phaseId}`), {
              statusCode: 400,
            });
          }
          if (t.id && existingTask) {
            // UPDATE: flip AGENT→MODIFIED + limpiar needsValidation SOLO si cambió contenido
            const contentChanged =
              existingTask.title !== t.title ||
              existingTask.weekIndex !== t.weekIndex ||
              existingTask.order !== t.order ||
              (existingTask.notes ?? null) !== (t.notes ?? null);
            await tx.timelineTask.update({
              where: { id: t.id },
              data: {
                title: t.title,
                weekIndex: t.weekIndex,
                order: t.order,
                notes: t.notes ?? null,
                ...(contentChanged
                  ? {
                      source: existingTask.source === "AGENT" ? "MODIFIED" : existingTask.source,
                      needsValidation: false, // humano revisó el contenido
                    }
                  : {}),
              },
            });
          } else {
            // CREATE: task nueva del CSE
            await tx.timelineTask.create({
              data: {
                phaseId,
                title: t.title,
                weekIndex: t.weekIndex,
                order: t.order,
                notes: t.notes ?? null,
                source: "HUMAN",
                status: "PENDING",
                needsValidation: false,
              },
            });
          }
        }
      }
    });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 400) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    throw err;
  }

  // 5. Re-cargar y devolver el estado final
  const updated = await loadTimeline(projectId);
  return NextResponse.json(updated);
}

// ── DELETE (cascade borra todas las phases y tasks) ──────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ deleted: false, reason: "no_timeline" }, { status: 404 });
  }

  await prisma.projectTimeline.delete({
    where: { projectId },
  });

  return NextResponse.json({ deleted: true });
}
