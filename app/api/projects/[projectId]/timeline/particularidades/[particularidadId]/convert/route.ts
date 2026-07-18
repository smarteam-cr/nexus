/**
 * POST /api/projects/[projectId]/timeline/particularidades/[particularidadId]/convert
 *
 * Convierte un HECHO en TRABAJO: crea la tarea del cronograma que va a perseguir esta
 * particularidad, y deja el link para que la fila deje de pedir acción.
 *
 * POR QUÉ existe: un `COMPROMISO` (y su antecesor deprecado `SOLICITUD`) no es una desviación —
 * es trabajo que alguien debe, con dueño y fecha. Vivía en la misma tabla que los atrasos, así que
 * nadie lo perseguía: en un proyecto real quedaron 4 filas de "X se comprometió a…" sin que nadie
 * las estuviera haciendo. Una tarea sí vence, sí avisa, y si es del cliente él la ve.
 *
 * INVARIANTES:
 *  - La particularidad NO se borra. Sigue siendo el registro de POR QUÉ pasó; la tarea es quién lo
 *    hace y para cuándo. Además hace trivial el "Deshacer" (borrar la tarea + nulear el link);
 *    borrarla la recrearía sin `dedupeKey` y el agente la re-propondría en la corrida siguiente.
 *  - **No toca `kind` ni `weeksImpact`.** El PATCH hermano tiene un invariante ATRASO≥1 que dispara
 *    solo si el patch toca esos dos campos; tocarlos acá volvería inconvertibles justo a las filas
 *    sin cuantificar, que son las que más necesitan este gesto.
 *  - Si el hecho NO tiene semanas → se fuerza `visibleExternal = false`. Un hecho sin semanas no
 *    explica nada del corrimiento: su único contenido es "falta esto", y eso ahora lo dice la tarea.
 *    Sin esto el cliente lee lo mismo dos veces — exactamente el bug que deprecó `SOLICITUD`.
 *  - Idempotente por diseño: si ya está convertida, 409 (no se crean dos tareas para el mismo hecho).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TaskParty } from "@prisma/client";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";

const PARTIES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
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
    committedDueDate?: unknown;
  } | null;

  const phaseId = typeof body?.phaseId === "string" ? body.phaseId : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const weekIndexRaw = body?.weekIndex;
  if (!phaseId) return NextResponse.json({ error: "Elegí en qué fase va la tarea." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "La tarea necesita un título." }, { status: 400 });
  if (typeof weekIndexRaw !== "number" || !Number.isInteger(weekIndexRaw) || weekIndexRaw < 0) {
    return NextResponse.json({ error: "Elegí la semana de la tarea." }, { status: 400 });
  }
  const party =
    typeof body?.party === "string" && (PARTIES as readonly string[]).includes(body.party)
      ? (body.party as TaskParty)
      : null;
  let committedDueDate: Date | null = null;
  if (typeof body?.committedDueDate === "string" && body.committedDueDate.trim() !== "") {
    const d = new Date(body.committedDueDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "La fecha comprometida no es válida." }, { status: 400 });
    }
    committedDueDate = d;
  }

  // Ownership por traversal, en las DOS puntas: la particularidad y la fase tienen que colgar del
  // timeline de ESTE proyecto. Sin esto, conocer un id ajeno alcanzaría para escribir acá.
  const [particularidad, phase] = await Promise.all([
    prisma.particularidad.findFirst({
      where: { id: particularidadId, timeline: { projectId } },
      select: {
        id: true,
        title: true,
        kind: true,
        weeksImpact: true,
        visibleExternal: true,
        convertedTaskId: true,
        dedupeKey: true,
        timelineId: true,
      },
    }),
    prisma.timelinePhase.findFirst({
      where: { id: phaseId, timeline: { projectId } },
      select: {
        id: true,
        durationWeeks: true,
        timeline: { select: { id: true, project: { select: { clientId: true } } } },
      },
    }),
  ]);
  if (!particularidad) {
    return NextResponse.json({ error: "Particularidad no encontrada en este proyecto" }, { status: 404 });
  }
  if (!phase) {
    return NextResponse.json({ error: "Fase no encontrada en este proyecto" }, { status: 404 });
  }
  if (particularidad.convertedTaskId) {
    return NextResponse.json(
      { error: "Este hecho ya tiene una tarea persiguiéndolo." },
      { status: 409 },
    );
  }

  const weekIndex = Math.min(weekIndexRaw, Math.max(phase.durationWeeks - 1, 0));
  const order = await prisma.timelineTask.count({ where: { phaseId, weekIndex } });
  // Un hecho sin semanas deja de explicar el corrimiento en cuanto se vuelve tarea → sale de la
  // vista del cliente. Con semanas se queda: explica un número que el cliente también lee.
  const ocultarDelCliente = !particularidad.weeksImpact && particularidad.visibleExternal;

  const { task } = await prisma.$transaction(async (tx) => {
    const created = await tx.timelineTask.create({
      data: {
        phaseId,
        title,
        weekIndex,
        order,
        party,
        type: "TASK", // un compromiso nunca es una reunión
        source: "HUMAN",
        status: "PENDING",
        committedDueDate,
        // La huella del hecho viaja a la tarea: es lo que le permite al agente saber, en su próxima
        // corrida, que este hecho YA tiene quien lo persiga y no re-proponerlo.
        originFingerprint: particularidad.dedupeKey,
      },
      select: {
        id: true, title: true, weekIndex: true, order: true, party: true,
        type: true, status: true, source: true, committedDueDate: true,
      },
    });
    await tx.particularidad.update({
      where: { id: particularidad.id },
      data: {
        convertedTaskId: created.id,
        convertedAt: new Date(),
        convertedByEmail: guard.user.email ?? null,
        ...(ocultarDelCliente ? { visibleExternal: false } : {}),
      },
    });
    return { task: created };
  });

  // Evento crudo para el watchdog (best-effort, fuera de la transacción).
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
        entityId: task.id,
        label: task.title,
        action: "CREATED",
        after: {
          weekIndex: task.weekIndex,
          party: task.party,
          fromParticularidadId: particularidad.id,
        },
      },
    ],
  );

  return NextResponse.json(
    { task, hiddenFromClient: ocultarDelCliente },
    { status: 201 },
  );
}

/**
 * DELETE — deshacer la conversión: borra la tarea creada y nulea el link. Reversible por diseño
 * (mismo criterio que los gates de etapa). La particularidad vuelve a pedir acción.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const particularidad = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true, convertedTaskId: true },
  });
  if (!particularidad) {
    return NextResponse.json({ error: "Particularidad no encontrada en este proyecto" }, { status: 404 });
  }
  if (!particularidad.convertedTaskId) {
    return NextResponse.json({ error: "Esta particularidad no está convertida." }, { status: 409 });
  }

  const taskId = particularidad.convertedTaskId;
  await prisma.$transaction(async (tx) => {
    await tx.particularidad.update({
      where: { id: particularidad.id },
      data: { convertedTaskId: null, convertedAt: null, convertedByEmail: null },
    });
    // deleteMany y no delete: si el CSE ya borró la tarea a mano, deshacer igual tiene que limpiar
    // el link en vez de reventar con un 500.
    await tx.timelineTask.deleteMany({ where: { id: taskId, phase: { timeline: { projectId } } } });
  });

  return NextResponse.json({ undone: true });
}
