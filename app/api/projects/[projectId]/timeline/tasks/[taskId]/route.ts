/**
 * PATCH /api/projects/[projectId]/timeline/tasks/[taskId]
 *
 * Cambio de estado de UNA tarea del cronograma — la interacción más frecuente
 * del Gantt interno. Endpoint dedicado a propósito:
 *   - por PUT bulk habría que reescribir el árbol completo por cada click,
 *     con carrera entre dos PUT concurrentes pisándose;
 *   - el estado viaja SOLO por acá (PUT = estructura, PATCH = operación).
 *
 * Reglas D.1 (deliberadas, para no contaminar las heurísticas de D.2):
 *   - NO flipea `source` (precedente: cambios de solo-status en blocks).
 *   - NO toca `lastEditedByHuman` (esa señal es de ediciones estructurales).
 * En D.1 el estado lo pone el CSE a mano; el agente solo crea PENDING.
 *
 * La operación (con la coherencia fase↔tarea) vive en lib/timeline/una-tarea.ts, la misma del plan general (2026-11-26);
 * acá quedan la guarda, el aviso al vigía y «¿cuánto te tomó?», que son de un proyecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { alDesmarcarTareas, alMarcarTareasHechas } from "@/lib/tiempos/disparar";
import { cambiarEstadoDeTarea, leerEstado } from "@/lib/timeline/una-tarea";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await params;
  // Cambiar estado es EDITAR el cronograma → exige editTimeline (la tiene TODO interno,
  // incluido el CSE) + acceso al cliente del proyecto. Lo único reservado a no-CSE es BORRAR.
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const estado = leerEstado(raw);
  if (!estado.ok) return NextResponse.json({ error: estado.error }, { status: estado.status });
  const status = estado.valor;

  // Ownership por traversal: la task debe pertenecer a una fase del timeline de ESTE proyecto.
  const r = await cambiarEstadoDeTarea({ projectId }, taskId, status, guard.user.email ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { updated, antes, timelineId, ahora } = r.valor;

  // Evento crudo para el watchdog — POST-tx y best-effort: un fallo del insert de telemetría NUNCA rollbackea ni 500ea
  // el cambio de status. Skip si no-op. El auto-cierre/reapertura de fase NO se emite: es derivativo.
  if (antes.status !== status) {
    await emitTimelineEventsSafe(
      prisma,
      {
        projectId,
        clientId: guard.clientId,
        timelineId,
        actorEmail: guard.user.email ?? null,
        source: "UI_PATCH",
      },
      [
        {
          entityType: "TASK",
          entityId: antes.id,
          label: antes.title,
          action: "STATUS_CHANGED",
          before: { status: antes.status },
          after: { status },
        },
      ],
    );
  }

  // Tiempos (2026-10-05): al quedar hecha puede llevar «¿cuánto te tomó?»; al desmarcarla, su pregunta pendiente se
  // retira. Después de escribir y sin lanzar nunca (lib/tiempos/disparar.ts).
  let preguntasDeTiempo: Awaited<ReturnType<typeof alMarcarTareasHechas>> = [];
  if (status === "DONE" && antes.status !== "DONE") {
    preguntasDeTiempo = await alMarcarTareasHechas({ email: guard.user.email, taskIds: [taskId], origen: "cronograma", ahora });
  } else if (antes.status === "DONE" && status !== "DONE") {
    await alDesmarcarTareas([taskId]);
  }

  return NextResponse.json({ ...updated, preguntasDeTiempo });
}
