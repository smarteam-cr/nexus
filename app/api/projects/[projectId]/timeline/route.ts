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
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { Prisma } from "@prisma/client";
import type {
  TimelinePhaseSource,
  TimelineActivityType,
  TimelineTaskStatus,
  TimelineChangeKind,
} from "@prisma/client";

// Validador + tipos del body compartidos con POST /timeline/assist (la IA
// emite exactamente este shape para que aplicar su propuesta sea un PUT normal).
import { validateTimelinePayload, type PutBody } from "@/lib/timeline/validate";

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

// D.2 — borrador de avance que propone el agente (no es status real; el CSE confirma).
export interface PendingProgress {
  currentPhaseId: string | null;
  asOfSessionId: string | null;
  reasoning: string;
  phases: Array<{ id: string; done: boolean }>;
  tasks: Array<{ id: string; done: boolean }>;
}

interface TimelineResponse {
  exists: true;
  anchorStartDate: string | null;
  lastEditedByHuman: string | null;
  generatedByAgentRunId: string | null;
  detailConfirmedAt: string | null;
  /** D.1.5 — flag de publicación de la superficie externa del cronograma (vive
   *  en Project). El preview interno del kickoff lo espeja para ser fiel. */
  timelinePublishedAt: string | null;
  /** ¿El cronograma se publicó AL MENOS UNA VEZ? (ProjectTimeline.publishedSnapshot != null).
   *  Persiste aunque se despublique → distingue 1ra publicación (sin modal de motivo, #3) de
   *  re-publicación, y bloquea "Generar cronograma" sobre un cronograma ya vivo (#2). */
  hasPublishedOnce: boolean;
  /** Fecha de la sesión de kickoff del proyecto (ISO) o null. Solo informativo: la UI
   *  la ofrece como sugerencia del anchor cuando difiere del actual. */
  kickoffSessionDate: string | null;
  /** Propuesta pendiente de re-generación del agente (re-run con timeline ya existente).
   *  Shape del PUT (fases id-aware, sin `tasks`); null = sin propuesta. El canvas la
   *  muestra como vista previa aplicable. Se limpia al aplicar (PUT) o descartar (DELETE). */
  pendingProposal: PutBody | null;
  pendingProposalRunId: string | null;
  // D.2 — borrador de avance (separado de pendingProposal; no es status real).
  pendingProgress: PendingProgress | null;
  pendingProgressRunId: string | null;
  phases: Array<{
    id: string;
    name: string;
    order: number;
    durationWeeks: number;
    sessionCount: number | null;
    notes: string | null;
    activityType: TimelineActivityType | null;
    source: TimelinePhaseSource;
    status: TimelineTaskStatus;
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
      pendingProposal: true,
      pendingProposalRunId: true,
      pendingProgress: true,
      pendingProgressRunId: true,
      publishedSnapshot: true,
      project: { select: { timelinePublishedAt: true } },
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
          status: true,
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
  const kickoffDate = await getKickoffSessionDate(projectId);
  return {
    exists: true,
    anchorStartDate: tl.anchorStartDate?.toISOString() ?? null,
    lastEditedByHuman: tl.lastEditedByHuman?.toISOString() ?? null,
    generatedByAgentRunId: tl.generatedByAgentRunId,
    detailConfirmedAt: tl.detailConfirmedAt?.toISOString() ?? null,
    timelinePublishedAt: tl.project.timelinePublishedAt?.toISOString() ?? null,
    hasPublishedOnce: tl.publishedSnapshot != null,
    kickoffSessionDate: kickoffDate?.toISOString() ?? null,
    pendingProposal: (tl.pendingProposal as PutBody | null) ?? null,
    pendingProposalRunId: tl.pendingProposalRunId,
    pendingProgress: (tl.pendingProgress as PendingProgress | null) ?? null,
    pendingProgressRunId: tl.pendingProgressRunId,
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
  const guard = await guardProjectHandoffAccess(projectId);
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

  // #4 — razón del cambio, con un snapshot del estado resultante (TimelineChange) para
  // que D.3 compare lo vendido contra lo real. Los AUTO-GUARDADOS del cronograma mandan
  // skipAudit:true → no exigen razón ni escriben TimelineChange (serían decenas de filas
  // con razón genérica que nadie lee; el audit que importa queda en el "Subir" y en la IA).
  // Los caminos que SÍ auditan (aplicar propuesta IA, crear 1ra fase) mandan razón.
  const rawObj = (raw ?? {}) as Record<string, unknown>;
  const skipAudit = rawObj.skipAudit === true;
  const reason = typeof rawObj.reason === "string" ? rawObj.reason.trim() : "";
  const changeKind: TimelineChangeKind = rawObj.kind === "AI_ASSIST" ? "AI_ASSIST" : "MANUAL";
  const changeInstruction =
    typeof rawObj.instruction === "string" && rawObj.instruction.trim()
      ? rawObj.instruction.trim()
      : null;
  if (!reason && !skipAudit) {
    return NextResponse.json(
      { error: "Falta la razón del cambio (obligatoria)." },
      { status: 400 },
    );
  }

  const now = new Date();
  const anchorDate = anchorStartDate ? new Date(anchorStartDate) : null;
  let timelineId = ""; // #4 — capturado dentro de la tx para registrar el cambio después

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
          // Aplicar la propuesta (o cualquier guardado humano) invalida la propuesta
          // pendiente: ya quedó reflejada o el humano editó algo distinto.
          pendingProposal: Prisma.DbNull,
          pendingProposalRunId: null,
        },
        select: { id: true },
      });
      timelineId = tl.id; // #4 — para registrar el TimelineChange tras la transacción

      // 2. Phases existentes en DB (con sus tasks para el diff anidado).
      // Se seleccionan TODOS los campos editables para detectar no-ops: el PUT
      // manda siempre el árbol completo, y escribir filas sin cambios saturaba
      // la transacción contra el pooler remoto (P2028 a los 5s con ~30 tareas).
      const existingPhases = await tx.timelinePhase.findMany({
        where: { timelineId: tl.id },
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

      // Tareas nuevas de TODAS las fases — se insertan en un solo createMany
      // al final (cada create individual era un round trip más al pooler).
      const tasksToCreate: {
        phaseId: string;
        title: string;
        weekIndex: number;
        order: number;
        notes: string | null;
        source: TimelinePhaseSource;
        status: TimelineTaskStatus;
        needsValidation: boolean;
      }[] = [];

      // 4. UPDATE + CREATE de phases (y diff de tasks donde venga el array)
      for (const p of incomingPhases) {
        const existing = p.id ? existingById.get(p.id) : undefined;

        let phaseId: string;
        if (p.id && existing) {
          // UPDATE solo si algo cambió — un no-op no escribe ni flipea source
          // (guardar solo el anchor ya no marca MODIFIED a todas las fases).
          const phaseChanged =
            existing.name !== p.name ||
            existing.order !== p.order ||
            existing.durationWeeks !== p.durationWeeks ||
            (existing.sessionCount ?? null) !== (p.sessionCount ?? null) ||
            (existing.notes ?? null) !== (p.notes ?? null) ||
            // undefined = "sin cambio" en el body (Prisma también lo ignora)
            (p.activityType !== undefined && existing.activityType !== p.activityType);
          if (phaseChanged) {
            // source AGENT → MODIFIED si fue editado por humano
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
                activityType: p.activityType,
                source: newSource,
              },
            });
          }
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
            // UPDATE solo si cambió contenido — el flip AGENT→MODIFIED y la
            // limpieza de needsValidation acompañan al cambio (humano revisó).
            const contentChanged =
              existingTask.title !== t.title ||
              existingTask.weekIndex !== t.weekIndex ||
              existingTask.order !== t.order ||
              (existingTask.notes ?? null) !== (t.notes ?? null);
            if (contentChanged) {
              await tx.timelineTask.update({
                where: { id: t.id },
                data: {
                  title: t.title,
                  weekIndex: t.weekIndex,
                  order: t.order,
                  notes: t.notes ?? null,
                  source: existingTask.source === "AGENT" ? "MODIFIED" : existingTask.source,
                  needsValidation: false, // humano revisó el contenido
                },
              });
            }
          } else {
            // CREATE: task nueva del CSE — se acumula para un único createMany
            tasksToCreate.push({
              phaseId,
              title: t.title,
              weekIndex: t.weekIndex,
              order: t.order,
              notes: t.notes ?? null,
              source: "HUMAN",
              status: "PENDING",
              needsValidation: false,
            });
          }
        }
      }

      // 5. CREATE batcheado: un solo round trip para todas las tareas nuevas
      if (tasksToCreate.length > 0) {
        await tx.timelineTask.createMany({ data: tasksToCreate });
      }
    },
    // Red de seguridad: un re-armado grande (p.ej. aplicar una propuesta de la
    // IA que toca todas las tareas) sigue siendo secuencial sobre un pooler
    // remoto — los 5000ms default del interactive transaction quedan cortos.
    { maxWait: 10000, timeout: 30000 });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 400) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    throw err;
  }

  // 5. Re-cargar el estado final
  const updated = await loadTimeline(projectId);

  // 6. #4 — registrar el cambio con su razón + snapshot del estado resultante.
  // El snapshot (estado canónico tras aplicar) deja a D.3 comparar lo "vendido"
  // (primer snapshot) contra lo "real" (último) y explicar los desvíos con su motivo.
  // skipAudit (auto-guardados) NO escribe: el audit vive en el "Subir" y en la IA.
  if (!skipAudit && timelineId && "exists" in updated && updated.exists) {
    await prisma.timelineChange.create({
      data: {
        timelineId,
        reason,
        kind: changeKind,
        instruction: changeInstruction,
        changedByEmail: guard.user.email ?? null,
        snapshot: {
          anchorStartDate: updated.anchorStartDate,
          phases: updated.phases.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            activityType: p.activityType,
            status: p.status,
            tasks: p.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              weekIndex: t.weekIndex,
              order: t.order,
              status: t.status,
            })),
          })),
        } as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json(updated);
}

// ── DELETE (cascade borra todas las phases y tasks) ──────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
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
