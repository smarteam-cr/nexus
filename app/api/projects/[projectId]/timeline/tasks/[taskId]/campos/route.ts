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
 * Las operaciones viven en lib/timeline/una-tarea.ts, las mismas del plan general (2026-11-26).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineDelete, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { borrarTarea, editarCamposDeTarea, leerCamposDeTarea } from "@/lib/timeline/una-tarea";

type Ctx = { params: Promise<{ projectId: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, taskId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const campos = leerCamposDeTarea(raw);
  if (!campos.ok) return NextResponse.json({ error: campos.error }, { status: campos.status });

  // Ownership por traversal: la tarea es de una fase del cronograma de ESTE proyecto.
  const r = await editarCamposDeTarea({ projectId }, taskId, campos.valor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { updated, antes, timelineId, movida, cambiaDuracion } = r.valor;

  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId, actorEmail: guard.user.email ?? null, source: "UI_PATCH" },
    [
      {
        entityType: "TASK",
        entityId: antes.id,
        label: updated.title,
        action: movida || cambiaDuracion ? "MOVED" : "EDITED",
        before: movida || cambiaDuracion ? { weekIndex: antes.weekIndex, semanas: antes.semanas } : {},
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
  const r = await borrarTarea({ projectId }, taskId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await emitTimelineEventsSafe(
    prisma,
    { projectId, clientId: guard.clientId, timelineId: r.valor.timelineId, actorEmail: guard.user.email ?? null, source: "UI_PATCH" },
    [{ entityType: "TASK", entityId: r.valor.id, label: r.valor.title, action: "DELETED" }],
  );
  return NextResponse.json({ ok: true });
}
