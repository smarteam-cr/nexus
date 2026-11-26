/**
 * POST /api/projects/[projectId]/timeline/tasks
 *
 * Agrega UNA tarea al cronograma. Endpoint dedicado (no por el PUT bulk) para el
 * gesto "+ tarea" del Gantt. Gateado por `guardTimelineEdit`: agregar/editar/mover/
 * poner fechas lo puede TODO interno —incluido el CSE— vía `editTimeline`. Lo único
 * reservado a no-CSE es BORRAR (`deleteTimeline`).
 *
 * ⚠ Hasta 2026-08-11 usaba `guardAccessToProject` —solo acceso al cliente, sin
 * `editTimeline`—, contradiciendo este mismo docblock: era el único endpoint que
 * MUTA el cronograma con un gate de lectura. Cualquiera con acceso al cliente podía
 * escribirle tareas al plan.
 *
 * La tarea nace `source=HUMAN`, `status=PENDING`. El `order` se calcula al final
 * de su semana. La edición/estado posteriores van por PUT/PATCH (guardTimelineEdit).
 * La operación vive en lib/timeline/una-tarea.ts (la misma del plan general, 2026-11-26); acá quedan la guarda y el
 * aviso al vigía.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { crearTarea, leerPedidoDeTarea } from "@/lib/timeline/una-tarea";

export async function POST(
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
  const pedido = leerPedidoDeTarea(raw);
  if (!pedido.ok) return NextResponse.json({ error: pedido.error }, { status: pedido.status });

  // Ownership por traversal: la fase debe pertenecer al timeline de ESTE proyecto.
  const r = await crearTarea({ projectId }, pedido.valor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const created = r.valor.task;

  // Evento crudo para el watchdog (best-effort).
  await emitTimelineEventsSafe(
    prisma,
    {
      projectId,
      clientId: guard.clientId,
      timelineId: r.valor.timelineId,
      actorEmail: guard.user.email ?? null,
      source: "UI_PATCH",
    },
    [
      {
        entityType: "TASK",
        entityId: created.id,
        label: created.title,
        action: "CREATED",
        after: { weekIndex: created.weekIndex, party: created.party, type: created.type },
      },
    ],
  );

  return NextResponse.json({ task: created }, { status: 201 });
}
