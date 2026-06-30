/**
 * /api/projects/[projectId]/timeline/progress
 *
 *   POST   → regenera el BORRADOR de avance a mano (mismo motor que el disparo de
 *            postProcessSession). Útil para "re-chequear avance" desde la UI y para
 *            pruebas. No aplica nada: solo recalcula pendingProgress.
 *   DELETE → descarta el borrador (limpia pendingProgress/pendingProgressRunId). NO
 *            toca el cronograma ni el status real. "Aplicar" es /progress/apply.
 *
 * Espejo de /timeline/proposal (la propuesta estructural). Guarded (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { regenerateTimelineProgress } from "@/lib/timeline/regenerate-progress";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  try {
    const result = await regenerateTimelineProgress(projectId);
    return NextResponse.json(result);
  } catch (e) {
    // El agente de avance falló (créditos, key, rate limit, …) → razón real al CSE.
    console.error("[timeline/progress] error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ status: "error", error: humanizeAgentError(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ cleared: false, reason: "no_timeline" }, { status: 404 });
  }

  await prisma.projectTimeline.update({
    where: { projectId },
    data: { pendingProgress: Prisma.DbNull, pendingProgressRunId: null },
  });

  return NextResponse.json({ cleared: true });
}
