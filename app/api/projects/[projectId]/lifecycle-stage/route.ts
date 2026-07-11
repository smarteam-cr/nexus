/**
 * PATCH /api/projects/[projectId]/lifecycle-stage
 *
 * Ciclo de vida — override CURADO de la etapa (el sistema infiere, el CSE corrige).
 * Clon del patrón de /health. EXCLUSIVO de `seeAllClients`.
 *
 *   PATCH { stage: <ProjectLifecycleStage>, reason? } → fija el override
 *   PATCH { stage: null }                             → limpia (vuelve a la inferida)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { ProjectLifecycleStage } from "@prisma/client";

const STAGES: ProjectLifecycleStage[] = [
  "HAND_OFF", "EXPLORACION", "DIAGNOSTICO", "PLANIFICACION", "CONFIGURACION_TECNICA",
  "ADOPCION", "VALIDACION_USO", "ENTREGA", "OPERACION_CONTINUA", "FINALIZADO",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const body = (raw ?? {}) as { stage?: unknown; reason?: unknown };

  const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (body.stage === null || body.stage === undefined || body.stage === "") {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        lifecycleStageOverride: null,
        lifecycleStageOverrideReason: null,
        lifecycleStageOverrideAt: null,
        lifecycleStageOverrideBy: null,
      },
    });
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (typeof body.stage !== "string" || !(STAGES as string[]).includes(body.stage)) {
    return NextResponse.json(
      { error: `stage debe ser uno de ${STAGES.join("|")} o null para volver a la inferida` },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      lifecycleStageOverride: body.stage as ProjectLifecycleStage,
      lifecycleStageOverrideReason: reason,
      lifecycleStageOverrideAt: new Date(),
      lifecycleStageOverrideBy: guard.user.email ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
