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
 * D.3 fundación:
 *   - captura las FECHAS REALES (actualEnd al DONE; actualStart si faltaba / al "hoy"),
 *     con las mismas reglas que lib/timeline/actual-dates.ts pero en bulk (par de updateMany).
 *   - escribe UN TimelineChange kind=PROGRESS por confirmación (quién + qué + cuándo),
 *     con un delta compacto que congela las fechas reales (auditable aunque luego se
 *     resetee un ítem a PENDING).
 *
 * Guarded con guardProjectHandoffAccess (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type ProgressRow = { id: string; status: string; actualStart: Date | null; actualEnd: Date | null };

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

  const now = new Date();
  let phasesDone = 0;
  let tasksDone = 0;

  await prisma.$transaction(
    async (tx) => {
      // Fases aceptadas → DONE + fecha real de fin (y de inicio si faltaba).
      if (phaseIds.length > 0) {
        const r = await tx.timelinePhase.updateMany({
          where: { id: { in: phaseIds }, timelineId: tl.id },
          data: { status: "DONE", actualEnd: now },
        });
        phasesDone = r.count;
        await tx.timelinePhase.updateMany({
          where: { id: { in: phaseIds }, timelineId: tl.id, actualStart: null },
          data: { actualStart: now },
        });
      }

      // Tareas aceptadas → DONE. Se resuelven primero por ownership (vía la fase del
      // timeline) y luego se actualizan por id (evita filtros de relación en updateMany).
      let validTaskIds: string[] = [];
      if (taskIds.length > 0) {
        const valid = await tx.timelineTask.findMany({
          where: { id: { in: taskIds }, phase: { timelineId: tl.id } },
          select: { id: true },
        });
        validTaskIds = valid.map((t) => t.id);
        if (validTaskIds.length > 0) {
          const r = await tx.timelineTask.updateMany({
            where: { id: { in: validTaskIds } },
            data: { status: "DONE", actualEnd: now },
          });
          tasksDone = r.count;
          await tx.timelineTask.updateMany({
            where: { id: { in: validTaskIds }, actualStart: null },
            data: { actualStart: now },
          });
        }
      }

      // El "hoy" → IN_PROGRESS, salvo que el CSE lo haya marcado DONE en esta misma tanda.
      // Inicio real si faltaba (no pisa el ya registrado).
      if (currentPhaseId) {
        await tx.timelinePhase.updateMany({
          where: { id: currentPhaseId, timelineId: tl.id, status: { not: "DONE" } },
          data: { status: "IN_PROGRESS" },
        });
        await tx.timelinePhase.updateMany({
          where: { id: currentPhaseId, timelineId: tl.id, actualStart: null },
          data: { actualStart: now },
        });
      }

      // El borrador ya se aplicó → limpiar.
      await tx.projectTimeline.update({
        where: { id: tl.id },
        data: { pendingProgress: Prisma.DbNull, pendingProgressRunId: null },
      });

      // D.3 fundación — auditar el EVENTO de avance (quién + qué + cuándo). Delta compacto
      // con las fechas reales ya escritas; sobrevive aunque luego se resetee un ítem.
      const touchedPhaseIds = [
        ...new Set([...phaseIds, ...(currentPhaseId ? [currentPhaseId] : [])]),
      ];
      if (touchedPhaseIds.length > 0 || validTaskIds.length > 0) {
        const [phaseRows, taskRows] = await Promise.all([
          touchedPhaseIds.length > 0
            ? tx.timelinePhase.findMany({
                where: { id: { in: touchedPhaseIds }, timelineId: tl.id },
                select: { id: true, status: true, actualStart: true, actualEnd: true },
              })
            : Promise.resolve([] as ProgressRow[]),
          validTaskIds.length > 0
            ? tx.timelineTask.findMany({
                where: { id: { in: validTaskIds } },
                select: { id: true, status: true, actualStart: true, actualEnd: true },
              })
            : Promise.resolve([] as ProgressRow[]),
        ]);
        await tx.timelineChange.create({
          data: {
            timelineId: tl.id,
            reason: "Avance confirmado",
            kind: "PROGRESS",
            changedByEmail: guard.user.email ?? null,
            snapshot: {
              confirmedAt: now.toISOString(),
              currentPhaseId,
              phases: phaseRows.map((p) => ({
                id: p.id,
                status: p.status,
                actualStart: p.actualStart?.toISOString() ?? null,
                actualEnd: p.actualEnd?.toISOString() ?? null,
              })),
              tasks: taskRows.map((t) => ({
                id: t.id,
                status: t.status,
                actualStart: t.actualStart?.toISOString() ?? null,
                actualEnd: t.actualEnd?.toISOString() ?? null,
              })),
            } as Prisma.InputJsonValue,
          },
        });
      }
    },
    { maxWait: 10000, timeout: 30000 },
  );

  return NextResponse.json({ applied: true, phasesDone, tasksDone });
}
