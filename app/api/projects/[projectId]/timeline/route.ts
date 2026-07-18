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
import { guardAccessToProject, guardTimelineEdit, guardTimelineDelete } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { countDeliverySessionsByPhase } from "@/lib/timeline/delivery-sessions";
import { Prisma } from "@prisma/client";
import type {
  TimelinePhaseSource,
  TimelineActivityType,
  TimelineTaskStatus,
  TimelineChangeKind,
  TaskParty,
  TimelineTaskType,
} from "@prisma/client";

// Validador + tipos del body compartidos con POST /timeline/assist (la IA
// emite exactamente este shape para que aplicar su propuesta sea un PUT normal).
import { validateTimelinePayload, type PutBody } from "@/lib/timeline/validate";
// Eventos crudos para el watchdog de Éxito del cliente. El PUT los acumula
// mientras camina su propio diff y los emite DESPUÉS de la tx (best-effort):
// la tx ya sufrió P2028 contra el pooler — no se engorda con más writes.
import { emitTimelineEventsSafe, diffFields, type DraftEvent } from "@/lib/cs/timeline-events";

// Normaliza un string de fecha entrante al MISMO ISO que produce el lado DB
// (Date.toISOString()). El validador acepta cualquier formato parseable: comparar
// el string crudo generaba updates no-op y eventos MOVED espurios hacia el watchdog.
const isoDate = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toISOString();
};

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

// Borrador de una particularidad propuesta por el agente (el CSE acepta por-ítem en el banner).
export interface PendingParticularidad {
  kind: string;
  party: string;
  title: string;
  detail: string | null;
  weeksImpact: number | null;
  /** Fecha ISO de la sesión del hecho (occurredAt de la particularidad). null = default now(). */
  occurredAt: string | null;
  /** Cita interna que respalda el hecho. NUNCA cruza al cliente (fail-closed en el chokepoint). */
  sourceQuote: string | null;
  phaseId: string | null;
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
  // Borrador de PARTICULARIDADES propuestas por el agente (separado de pendingProgress; apply propio).
  pendingParticularidades: PendingParticularidad[] | null;
  pendingParticularidadesRunId: string | null;
  // Particularidades (desviaciones curadas) — el CSE ve TODAS (visibles y ocultas), con la
  // marca visibleExternal para saber cuáles cruzan al cliente. Orden por occurredAt desc.
  particularidades: Array<{
    id: string;
    kind: string;
    party: string;
    title: string;
    detail: string | null;
    sourceQuote: string | null; // cita interna para el CSE — NO cruza al cliente
    weeksImpact: number | null;
    visibleExternal: boolean;
    source: string;
    needsValidation: boolean;
    phaseId: string | null;
    occurredAt: string;
  }>;
  phases: Array<{
    id: string;
    name: string;
    order: number;
    durationWeeks: number;
    /** Inicio explícito (offset 0-based). null = contigua tras la anterior. Habilita paralelo/solape. */
    startWeek: number | null;
    sessionCount: number | null;
    /** Sesiones de entrega (CSE/dev + cliente) ejecutadas en la ventana de la fase.
     *  Calculado en lectura (no persistido). number en fases ya iniciadas; null en
     *  futuras o si no hay anchorStartDate → la UI cae al estimado `sessionCount`. */
    actualSessionCount: number | null;
    notes: string | null;
    activityType: TimelineActivityType | null;
    source: TimelinePhaseSource;
    status: TimelineTaskStatus;
    needsValidation: boolean;
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
      pendingParticularidades: true,
      pendingParticularidadesRunId: true,
      publishedSnapshot: true,
      project: { select: { timelinePublishedAt: true } },
      particularidades: {
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          kind: true,
          party: true,
          title: true,
          detail: true,
          sourceQuote: true,
          weeksImpact: true,
          visibleExternal: true,
          source: true,
          needsValidation: true,
          phaseId: true,
          occurredAt: true,
        },
      },
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          startWeek: true,
          sessionCount: true,
          notes: true,
          activityType: true,
          source: true,
          status: true,
          needsValidation: true,
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
              statusSource: true,
              statusChangedByEmail: true,
              statusChangedAt: true,
              party: true,
              type: true,
              startDateOverride: true,
              dueDateOverride: true,
            },
          },
        },
      },
    },
  });
  if (!tl) return { exists: false };
  const kickoffDate = await getKickoffSessionDate(projectId);
  // Sesiones de entrega reales por fase (calculado, no persistido). null por fase
  // = futura o sin anchor → la UI usa el estimado `sessionCount`.
  const deliveryByPhase = await countDeliverySessionsByPhase({
    projectId,
    anchorStartDate: tl.anchorStartDate,
    phases: tl.phases.map((p) => ({ id: p.id, durationWeeks: p.durationWeeks, startWeek: p.startWeek })),
  });
  const phases = tl.phases.map((p) => ({
    ...p,
    actualSessionCount: deliveryByPhase?.get(p.id) ?? null,
  }));
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
    pendingParticularidades: (tl.pendingParticularidades as PendingParticularidad[] | null) ?? null,
    pendingParticularidadesRunId: tl.pendingParticularidadesRunId,
    particularidades: tl.particularidades.map((pt) => ({
      ...pt,
      occurredAt: pt.occurredAt.toISOString(),
    })),
    phases,
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
  const guard = await guardTimelineEdit(projectId);
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
  const draftEvents: DraftEvent[] = []; // eventos crudos del watchdog (se emiten post-tx)

  // Transacción: upsert del timeline + diff de phases + diff de tasks por phase
  try {
    await prisma.$transaction(async (tx) => {
      // Anchor previo (solo para detectar ANCHOR_CHANGED — select trivial por PK).
      const prevTl = await tx.projectTimeline.findUnique({
        where: { projectId },
        select: { anchorStartDate: true },
      });
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

      // ANCHOR_CHANGED: solo si el timeline ya existía y la fecha de arranque cambió.
      if (prevTl && (prevTl.anchorStartDate?.getTime() ?? null) !== (anchorDate?.getTime() ?? null)) {
        draftEvents.push({
          entityType: "TIMELINE",
          entityId: tl.id,
          label: "Fecha de arranque",
          action: "ANCHOR_CHANGED",
          before: { anchorStartDate: prevTl.anchorStartDate?.toISOString() ?? null },
          after: { anchorStartDate: anchorDate?.toISOString() ?? null },
        });
      }

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
          startWeek: true,
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
              party: true,
              type: true,
              startDateOverride: true,
              dueDateOverride: true,
            },
          },
        },
      });
      const existingById = new Map(existingPhases.map((p) => [p.id, p]));
      const incomingIds = new Set(
        incomingPhases.filter((p) => p.id).map((p) => p.id as string),
      );

      // 3. DELETE: phases en DB que no aparecen en el body (cascade borra tasks).
      // NB: el "no borrar" del CSE se aplica en la UI (sin botones de borrar fase/tarea);
      // acá NO se bloquea porque un MOVE entre fases borra-del-origen + crea-en-destino, y
      // bloquearlo duplicaría la tarea. El nuke del cronograma entero (DELETE) sí está gateado.
      const idsToDelete = existingPhases
        .filter((p) => !incomingIds.has(p.id))
        .map((p) => p.id);
      if (idsToDelete.length > 0) {
        await tx.timelinePhase.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        for (const pid of idsToDelete) {
          const prev = existingById.get(pid);
          draftEvents.push({
            entityType: "PHASE",
            entityId: pid,
            label: prev?.name ?? "(fase)",
            action: "DELETED",
            before: { order: prev?.order, durationWeeks: prev?.durationWeeks, tasks: prev?.tasks.length ?? 0 },
          });
        }
      }

      // Tareas nuevas de TODAS las fases — se insertan en un solo createMany
      // al final (cada create individual era un round trip más al pooler).
      const tasksToCreate: {
        phaseId: string;
        title: string;
        weekIndex: number;
        order: number;
        notes: string | null;
        party: TaskParty | null;
        type: TimelineTaskType | null;
        startDateOverride: Date | null;
        dueDateOverride: Date | null;
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
            (p.startWeek !== undefined && (existing.startWeek ?? null) !== (p.startWeek ?? null)) ||
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
                startWeek: p.startWeek, // undefined = sin cambio (Prisma lo ignora)
                sessionCount: p.sessionCount,
                notes: p.notes,
                activityType: p.activityType,
                source: newSource,
                needsValidation: false, // humano revisó la fase → se limpia el flag "estimada"
              },
            });
            // Evento del watchdog: diff MATERIAL (notes = cosmético, se ignora).
            // MOVED si cambió el timing (duración/inicio/orden); EDITED el resto.
            const d = diffFields(
              {
                name: existing.name,
                order: existing.order,
                durationWeeks: existing.durationWeeks,
                startWeek: existing.startWeek ?? null,
                sessionCount: existing.sessionCount ?? null,
                activityType: existing.activityType ?? null,
              },
              {
                name: p.name,
                order: p.order,
                durationWeeks: p.durationWeeks,
                startWeek: p.startWeek !== undefined ? (p.startWeek ?? null) : (existing.startWeek ?? null),
                sessionCount: p.sessionCount ?? null,
                activityType: p.activityType !== undefined ? p.activityType : (existing.activityType ?? null),
              },
            );
            if (d) {
              const moved = ["durationWeeks", "startWeek", "order"].some((k) => k in d.after);
              draftEvents.push({
                entityType: "PHASE",
                entityId: p.id,
                label: p.name,
                action: moved ? "MOVED" : "EDITED",
                before: d.before,
                after: d.after,
              });
            }
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
              startWeek: p.startWeek ?? null,
              sessionCount: p.sessionCount,
              notes: p.notes,
              activityType: p.activityType ?? null,
              source: "HUMAN",
            },
            select: { id: true },
          });
          phaseId = created.id;
          draftEvents.push({
            entityType: "PHASE",
            entityId: created.id,
            label: p.name,
            action: "CREATED",
            after: { order: p.order, durationWeeks: p.durationWeeks, startWeek: p.startWeek ?? null },
          });
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
          for (const tid of taskIdsToDelete) {
            const prev = existingTaskById.get(tid);
            draftEvents.push({
              entityType: "TASK",
              entityId: tid,
              label: prev?.title ?? "(tarea)",
              action: "DELETED",
              before: { weekIndex: prev?.weekIndex, party: prev?.party ?? null, type: prev?.type ?? null },
            });
          }
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
              (existingTask.notes ?? null) !== (t.notes ?? null) ||
              (t.party !== undefined && (existingTask.party ?? null) !== (t.party ?? null)) ||
              (t.type !== undefined && (existingTask.type ?? null) !== (t.type ?? null)) ||
              (t.startDateOverride !== undefined && (existingTask.startDateOverride?.toISOString() ?? null) !== isoDate(t.startDateOverride)) ||
              (t.dueDateOverride !== undefined && (existingTask.dueDateOverride?.toISOString() ?? null) !== isoDate(t.dueDateOverride));
            if (contentChanged) {
              await tx.timelineTask.update({
                where: { id: t.id },
                data: {
                  title: t.title,
                  weekIndex: t.weekIndex,
                  order: t.order,
                  notes: t.notes ?? null,
                  party: t.party, // undefined = sin cambio (Prisma lo ignora)
                  type: t.type, // undefined = sin cambio
                  // #4 — override de fechas por tarea (undefined = sin cambio; null = volver a derivada).
                  startDateOverride: t.startDateOverride !== undefined ? (t.startDateOverride ? new Date(t.startDateOverride) : null) : undefined,
                  dueDateOverride: t.dueDateOverride !== undefined ? (t.dueDateOverride ? new Date(t.dueDateOverride) : null) : undefined,
                  source: existingTask.source === "AGENT" ? "MODIFIED" : existingTask.source,
                  needsValidation: false, // humano revisó el contenido
                },
              });
              // Evento del watchdog: diff MATERIAL (order intra-semana y notes =
              // cosméticos, se ignoran). MOVED si cambió semana/fechas; EDITED el resto.
              const d = diffFields(
                {
                  title: existingTask.title,
                  weekIndex: existingTask.weekIndex,
                  party: existingTask.party ?? null,
                  type: existingTask.type ?? null,
                  startDateOverride: existingTask.startDateOverride?.toISOString() ?? null,
                  dueDateOverride: existingTask.dueDateOverride?.toISOString() ?? null,
                },
                {
                  title: t.title,
                  weekIndex: t.weekIndex,
                  party: t.party !== undefined ? (t.party ?? null) : (existingTask.party ?? null),
                  type: t.type !== undefined ? (t.type ?? null) : (existingTask.type ?? null),
                  startDateOverride:
                    t.startDateOverride !== undefined
                      ? isoDate(t.startDateOverride)
                      : (existingTask.startDateOverride?.toISOString() ?? null),
                  dueDateOverride:
                    t.dueDateOverride !== undefined
                      ? isoDate(t.dueDateOverride)
                      : (existingTask.dueDateOverride?.toISOString() ?? null),
                },
              );
              if (d) {
                const moved = ["weekIndex", "startDateOverride", "dueDateOverride"].some((k) => k in d.after);
                draftEvents.push({
                  entityType: "TASK",
                  entityId: t.id,
                  label: t.title,
                  action: moved ? "MOVED" : "EDITED",
                  before: d.before,
                  after: d.after,
                });
              }
            }
          } else {
            // CREATE: task nueva del CSE — se acumula para un único createMany
            tasksToCreate.push({
              phaseId,
              title: t.title,
              weekIndex: t.weekIndex,
              order: t.order,
              notes: t.notes ?? null,
              party: t.party ?? null,
              type: t.type ?? null,
              startDateOverride: t.startDateOverride ? new Date(t.startDateOverride) : null,
              dueDateOverride: t.dueDateOverride ? new Date(t.dueDateOverride) : null,
              source: "HUMAN",
              status: "PENDING",
              needsValidation: false,
            });
            // Evento del watchdog (sin entityId: createMany no devuelve ids; el
            // label + weekIndex alcanzan para el triage).
            draftEvents.push({
              entityType: "TASK",
              label: t.title,
              action: "CREATED",
              after: { weekIndex: t.weekIndex, party: t.party ?? null, type: t.type ?? null },
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

  // Eventos crudos del watchdog — DESPUÉS de la tx, best-effort (perder un evento
  // es aceptable; alargar la tx no). Incluye los guardados skipAudit (auto-guardados:
  // son ediciones reales del CSE) y el apply de propuesta IA (source distinto).
  if (draftEvents.length > 0) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true },
    });
    if (proj) {
      await emitTimelineEventsSafe(
        prisma,
        {
          projectId,
          clientId: proj.clientId,
          timelineId,
          actorEmail: guard.user.email ?? null,
          source: changeKind === "AI_ASSIST" ? "AI_ASSIST_APPLY" : "UI_PUT",
        },
        draftEvents,
      );
    }
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
            startWeek: p.startWeek,
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
  const guard = await guardTimelineDelete(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, project: { select: { clientId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ deleted: false, reason: "no_timeline" }, { status: 404 });
  }

  await prisma.projectTimeline.delete({
    where: { projectId },
  });

  // Evento crudo del watchdog: borrar el cronograma ENTERO es exactamente el tipo
  // de acción que la líder de CS debe poder ver (best-effort; timelineId queda
  // como string — el evento sobrevive al borrado).
  await emitTimelineEventsSafe(
    prisma,
    {
      projectId,
      clientId: existing.project.clientId,
      timelineId: existing.id,
      actorEmail: guard.user.email ?? null,
      source: "UI_PATCH",
    },
    [{ entityType: "TIMELINE", entityId: existing.id, label: "Cronograma", action: "TIMELINE_DELETED" }],
  );

  return NextResponse.json({ deleted: true });
}
