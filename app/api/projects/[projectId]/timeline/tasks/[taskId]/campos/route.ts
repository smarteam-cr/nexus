/**
 * /api/projects/[projectId]/timeline/tasks/[taskId]/campos — editar o borrar UNA tarea sin mandar el cronograma entero
 * (2026-11-19). La usa el plan general de la cuenta: muestra el MISMO Gantt y el MISMO panel de tarea con las fases de
 * varios proyectos, y cada cambio se guarda en la tarea de su proyecto. Con el PUT del cronograma tendría que reescribir
 * el árbol de cada proyecto por cada clic.
 *
 *   PATCH  { title?, notes?, weekIndex?, semanas?, party?, type?, startDateOverride?, dueDateOverride?, phaseId?, order? }
 *          → guardTimelineEdit (la misma guarda del PUT). Lo que no viene no se toca. La tarea tiene que caber en su
 *          fase: `semanas` se recorta a lo que queda de la fase (`semanasQueCaben`, como el PUT) y un `weekIndex` fuera
 *          de la fase es 400. `phaseId` la mueve a otra fase del MISMO cronograma (nunca a otro proyecto) y `order` la
 *          pone en ese lugar de su semana. Una tarea de la IA pasa a MODIFIED y deja de estar «por validar», como en el
 *          PUT. El estado NO va acá: sigue en el PATCH de la tarea (fase, tiempos y watchdog).
 *   DELETE → guardTimelineDelete (todos menos el CSE: el CSE suspende, no borra).
 *
 * Como el autoguardado del Gantt, no escribe TimelineChange: el historial con motivo vive en «Subir» y en la IA. Sí
 * marca `lastEditedByHuman` y le avisa al vigía de Éxito del cliente (MOVED / EDITED / DELETED), como el PUT. El Gantt
 * del proyecto abierto en otra pestaña lo nota por la versión del cronograma (T2) y pide recargar.
 */
import { NextRequest, NextResponse } from "next/server";
import type { TaskParty, TimelineTaskType } from "@prisma/client";
import { guardTimelineDelete, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { semanasQueCaben } from "@/lib/timeline/weeks";
import { PARTY_VALUES as PARTIES, TASK_TYPE_VALUES as TYPES } from "@/lib/timeline/validate";
import { esInstanteDeProyecto } from "@/lib/timeline/fecha-de-arranque";

type Ctx = { params: Promise<{ projectId: string; taskId: string }> };

const mal = (error: string) => NextResponse.json({ error }, { status: 400 });

function entero(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "number" && Number.isInteger(v) ? v : NaN;
}

/** undefined = no viene; null = volver a la automática; Date = fijar; false = inválida. La MISMA regla que el PUT
 *  (validate.ts): una fecha que se entiende y cae en el rango de un proyecto (esInstanteDeProyecto). */
function fecha(v: unknown): Date | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v)) || !esInstanteDeProyecto(v)) return false;
  return new Date(v);
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
    return mal("JSON inválido");
  }

  const data: {
    title?: string;
    notes?: string | null;
    party?: TaskParty | null;
    type?: TimelineTaskType | null;
    startDateOverride?: Date | null;
    dueDateOverride?: Date | null;
  } = {};
  if (raw.title !== undefined) {
    const t = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!t) return mal("La tarea necesita un título.");
    data.title = t;
  }
  if (raw.notes !== undefined) {
    if (raw.notes !== null && typeof raw.notes !== "string") return mal("notes debe ser texto");
    data.notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null;
  }
  if (raw.party !== undefined) {
    if (raw.party !== null && !(PARTIES as readonly unknown[]).includes(raw.party)) return mal("Responsable desconocido");
    data.party = raw.party as TaskParty | null;
  }
  if (raw.type !== undefined) {
    if (raw.type !== null && !(TYPES as readonly unknown[]).includes(raw.type)) return mal("Tipo desconocido");
    data.type = raw.type as TimelineTaskType | null;
  }
  for (const k of ["startDateOverride", "dueDateOverride"] as const) {
    const f = fecha(raw[k]);
    if (f === false) return mal(`${k} debe ser una fecha (aaaa-mm-dd)`);
    if (f !== undefined) data[k] = f;
  }
  const weekIndex = entero(raw.weekIndex);
  const semanas = entero(raw.semanas);
  const order = entero(raw.order);
  if (Number.isNaN(weekIndex) || weekIndex === null || (weekIndex != null && weekIndex < 0)) return mal("weekIndex debe ser un entero ≥ 0");
  if (Number.isNaN(semanas) || (semanas != null && semanas < 1)) return mal("semanas debe ser un entero ≥ 1");
  if (Number.isNaN(order) || order === null || (order != null && order < 0)) return mal("order debe ser un entero ≥ 0");
  const phaseIdNuevo = raw.phaseId === undefined ? undefined : typeof raw.phaseId === "string" && raw.phaseId ? raw.phaseId : null;
  if (phaseIdNuevo === null) return mal("phaseId inválido");
  const mueve = weekIndex !== undefined || phaseIdNuevo !== undefined || order !== undefined;
  if (Object.keys(data).length === 0 && semanas === undefined && !mueve) return mal("Nada que cambiar");

  // Ownership por traversal: la tarea es de una fase del cronograma de ESTE proyecto.
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: { projectId } } },
    select: {
      id: true,
      title: true,
      weekIndex: true,
      order: true,
      semanas: true,
      source: true,
      phaseId: true,
      phase: { select: { durationWeeks: true, timelineId: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada en este proyecto" }, { status: 404 });

  // La fase de destino: la misma, u otra del MISMO cronograma (mover entre proyectos no existe).
  let fase = { id: task.phaseId, durationWeeks: task.phase.durationWeeks };
  if (phaseIdNuevo !== undefined && phaseIdNuevo !== task.phaseId) {
    const otra = await prisma.timelinePhase.findFirst({
      where: { id: phaseIdNuevo, timelineId: task.phase.timelineId },
      select: { id: true, durationWeeks: true },
    });
    if (!otra) return mal("Una tarea solo se mueve a otra fase de su mismo cronograma.");
    fase = otra;
  }
  const semanaFinal = weekIndex ?? task.weekIndex;
  if (mueve && semanaFinal > Math.max(fase.durationWeeks - 1, 0)) {
    return mal(`La fase tiene ${fase.durationWeeks} ${fase.durationWeeks === 1 ? "semana" : "semanas"}: la tarea no puede arrancar en la ${semanaFinal + 1}.`);
  }
  // Cuánto dura: lo pedido o lo que tenía, recortado a lo que queda de la fase (mover no la estira, ni la saca).
  const semanasFinal =
    semanas !== undefined || mueve ? semanasQueCaben(semanas !== undefined ? semanas : task.semanas, semanaFinal, fase.durationWeeks) : undefined;

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.timelineTask.update({
      where: { id: taskId },
      // Editarla es revisarla: deja de estar «por validar» (como en el Gantt) y una tarea de la IA pasa a MODIFIED.
      data: {
        ...data,
        ...(semanasFinal !== undefined ? { semanas: semanasFinal } : {}),
        ...(mueve ? { phaseId: fase.id, weekIndex: semanaFinal } : {}),
        needsValidation: false,
        ...(task.source === "AGENT" ? { source: "MODIFIED" as const } : {}),
      },
      select: { id: true, title: true, phaseId: true, weekIndex: true, semanas: true, updatedAt: true },
    });
    if (mueve) {
      // El lugar dentro de su semana: `order` pedido, o al final si cambió de semana o de fase; los demás se corren.
      const hermanas = await tx.timelineTask.findMany({
        where: { phaseId: fase.id, weekIndex: semanaFinal, id: { not: taskId } },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      const mismaSemana = fase.id === task.phaseId && semanaFinal === task.weekIndex;
      const lugar = Math.min(order ?? (mismaSemana ? task.order : hermanas.length), hermanas.length);
      const ids = [...hermanas.map((h) => h.id)];
      ids.splice(lugar, 0, taskId);
      for (let i = 0; i < ids.length; i++) await tx.timelineTask.update({ where: { id: ids[i] }, data: { order: i } });
    }
    await tx.projectTimeline.update({ where: { id: task.phase.timelineId }, data: { lastEditedByHuman: now } });
    return t;
  });

  const movida = mueve && (updated.weekIndex !== task.weekIndex || updated.phaseId !== task.phaseId);
  const cambiaDuracion = semanasFinal !== undefined && semanasFinal !== (task.semanas ?? null);
  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId: task.phase.timelineId, actorEmail: guard.user.email ?? null, source: "UI_PATCH" },
    [
      {
        entityType: "TASK",
        entityId: task.id,
        label: updated.title,
        action: movida || cambiaDuracion ? "MOVED" : "EDITED",
        before: movida || cambiaDuracion ? { weekIndex: task.weekIndex, semanas: task.semanas ?? null } : {},
        after: movida || cambiaDuracion ? { weekIndex: updated.weekIndex, semanas: updated.semanas ?? null } : {},
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
