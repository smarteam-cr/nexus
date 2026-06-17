/**
 * POST /api/projects/[projectId]/timeline/progress/apply
 *
 * Aplica el avance que el CSE confirmó del borrador (pendingProgress). Es el ÚNICO
 * lugar donde el avance propuesto por el agente se vuelve STATUS real — y lo dispara
 * el CSE (invariante D.1/D.2: el status lo escribe el humano, nunca el agente).
 *
 * Body = subconjunto ACEPTADO por el CSE (puede haber destildado ítems):
 *   { phaseIds: string[], taskIds: string[], currentPhaseId: string | null }
 *
 * En una transacción: las fases/tareas aceptadas → status DONE; currentPhaseId →
 * IN_PROGRESS (si no quedó DONE); limpia pendingProgress. NO flipea `source` ni
 * toca lastEditedByHuman (es avance, no edición estructural — misma regla que el
 * PATCH de status de tareas).
 *
 * Guarded con guardProjectHandoffAccess (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function POST(
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
  const body = (raw ?? {}) as { phaseIds?: unknown; taskIds?: unknown; currentPhaseId?: unknown };
  const asIds = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  const phaseIds = asIds(body.phaseIds);
  const taskIds = asIds(body.taskIds);
  const currentPhaseId = typeof body.currentPhaseId === "string" ? body.currentPhaseId : null;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });

  let phasesDone = 0;
  let tasksDone = 0;

  await prisma.$transaction(async (tx) => {
    // Fases aceptadas → DONE (acotado al timeline de ESTE proyecto).
    if (phaseIds.length > 0) {
      const r = await tx.timelinePhase.updateMany({
        where: { id: { in: phaseIds }, timelineId: tl.id },
        data: { status: "DONE" },
      });
      phasesDone = r.count;
    }

    // Tareas aceptadas → DONE. Se resuelven primero por ownership (vía la fase del
    // timeline) y luego se actualizan por id (evita filtros de relación en updateMany).
    if (taskIds.length > 0) {
      const valid = await tx.timelineTask.findMany({
        where: { id: { in: taskIds }, phase: { timelineId: tl.id } },
        select: { id: true },
      });
      if (valid.length > 0) {
        const r = await tx.timelineTask.updateMany({
          where: { id: { in: valid.map((t) => t.id) } },
          data: { status: "DONE" },
        });
        tasksDone = r.count;
      }
    }

    // El "hoy" → IN_PROGRESS, salvo que el CSE lo haya marcado DONE en esta misma tanda.
    if (currentPhaseId) {
      await tx.timelinePhase.updateMany({
        where: { id: currentPhaseId, timelineId: tl.id, status: { not: "DONE" } },
        data: { status: "IN_PROGRESS" },
      });
    }

    // El borrador ya se aplicó → limpiar.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: { pendingProgress: Prisma.DbNull, pendingProgressRunId: null },
    });
  });

  return NextResponse.json({ applied: true, phasesDone, tasksDone });
}
