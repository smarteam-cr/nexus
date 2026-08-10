/**
 * POST /api/projects/[projectId]/timeline/detail/apply-all
 *
 * Aplica el set CURADO de TODAS las fases del cronograma de una sola vez ("Regenerar todo el
 * cronograma", Tanda N) — la generalización de .../timeline/phases/[phaseId]/apply a N fases
 * en UNA transacción. Cada fase se aplica con applyCuratedPhaseTasks (mismas protecciones que
 * el apply por-fase: preserva DONE/iniciadas/manuales); al final, UNA sola invalidación de
 * pendingProgress + marca de edición humana.
 *
 * Gate MÁS ESTRICTO que el apply por-fase (guardTimelineFullRegen, no guardTimelineEdit): ver
 * el docblock de guardTimelineFullRegen en lib/auth/api-guards.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineFullRegen } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { normalizeCuratedTasks, applyCuratedPhaseTasks } from "@/lib/timeline/apply-curated-phase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineFullRegen(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const bodyPhases = (body as { phases?: unknown })?.phases;
  if (!Array.isArray(bodyPhases)) {
    return NextResponse.json({ error: "Falta la lista de fases" }, { status: 400 });
  }
  const reason =
    typeof (body as { reason?: unknown })?.reason === "string" && (body as { reason: string }).reason.trim()
      ? (body as { reason: string }).reason.trim()
      : "Regeneración completa del cronograma (curada)";

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      phases: {
        select: {
          id: true,
          durationWeeks: true,
          tasks: {
            select: { id: true, title: true, weekIndex: true, order: true, notes: true, party: true, type: true, source: true, status: true, actualStart: true },
          },
        },
      },
    },
  });
  if (!tl) {
    return NextResponse.json({ error: "El proyecto no tiene cronograma" }, { status: 404 });
  }

  const phaseById = new Map(tl.phases.map((p) => [p.id, p]));
  // Anti-alucinación: ignorar cualquier phaseId que no pertenezca a ESTE timeline — mismo
  // criterio que el resto del módulo de cronograma con ids del agente/cliente.
  const entries = bodyPhases
    .filter((e): e is { phaseId: string; tasks: unknown[] } => {
      if (!e || typeof e !== "object") return false;
      const rec = e as Record<string, unknown>;
      return typeof rec.phaseId === "string" && phaseById.has(rec.phaseId) && Array.isArray(rec.tasks);
    })
    .map((e) => ({ phase: phaseById.get(e.phaseId)!, rawTasks: e.tasks }));
  if (entries.length === 0) {
    return NextResponse.json({ error: "Sin fases válidas para aplicar" }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const { phase, rawTasks } of entries) {
      const existingIds = new Set(phase.tasks.map((t) => t.id));
      const curated = normalizeCuratedTasks(rawTasks, phase.durationWeeks, existingIds);
      await applyCuratedPhaseTasks(tx, {
        phaseId: phase.id, timelineId: tl.id, existingTasks: phase.tasks, curated, now,
        actorEmail: guard.user.email ?? null,
      });
    }
    // UNA sola invalidación de avance + marca de edición humana, tras aplicar TODAS las fases.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: { lastEditedByHuman: now, pendingProgress: Prisma.DbNull, pendingProgressRunId: null },
    });
  }, { maxWait: 20000, timeout: 60000 }); // más fases que un regen por fase → más margen

  // Audit best-effort POST-tx (no rollbackea): un solo snapshot del timeline completo.
  try {
    const snapPhases = await prisma.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: {
        id: true, name: true, order: true, durationWeeks: true, startWeek: true, sessionCount: true,
        activityType: true, status: true,
        tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { id: true, title: true, weekIndex: true, order: true, status: true } },
      },
    });
    const tlRow = await prisma.projectTimeline.findUnique({ where: { id: tl.id }, select: { anchorStartDate: true } });
    await prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason,
        kind: "AI_ASSIST",
        instruction: `Regeneración completa del cronograma (curada, ${entries.length} fases)`,
        changedByEmail: guard.user.email ?? null,
        snapshot: {
          anchorStartDate: tlRow?.anchorStartDate?.toISOString() ?? null,
          phases: snapPhases,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error("[timeline/detail/apply-all] audit best-effort falló:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, phasesApplied: entries.length });
}
