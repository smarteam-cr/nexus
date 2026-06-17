import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createHandoffCanvas } from "@/lib/canvas/default-canvases";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/[projectId]/handoff
 *
 * Estado del handoff de UN proyecto (handoff por-proyecto, 1:1). Devuelve si la
 * entidad existe, el canvas, si está GENERADO (canvas con ≥1 bloque), las sesiones
 * fuente del último run y cuántas sesiones tiene clasificadas el proyecto (para saber
 * si se puede generar). Lo consume ProjectHandoffSection.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      handoff: { select: { id: true } },
      canvases: { where: { name: "Handoff" }, select: { id: true }, take: 1 },
    },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canvasId = project.canvases[0]?.id ?? null;
  const blockCount = canvasId
    ? await prisma.canvasBlock.count({ where: { section: { canvasId } } })
    : 0;

  const lastRun = await prisma.agentRun.findFirst({
    where: { projectId, agent: { agentGroup: "handoff" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true, sourceSessionIds: true },
  });

  let sourceSessions: { id: string; title: string; date: string }[] = [];
  if (lastRun?.sourceSessionIds?.length) {
    const sessions = await prisma.firefliesSession.findMany({
      where: { id: { in: lastRun.sourceSessionIds } },
      select: { id: true, title: true, date: true },
    });
    sourceSessions = sessions.map((s) => ({
      id: s.id,
      title: s.title ?? "(sin título)",
      date: s.date.toISOString(),
    }));
  }

  const projectSessionCount = await prisma.sessionProject.count({ where: { projectId } });

  // Id del agente de handoff resuelto por grupo (no hardcodeado) — el front lo usa
  // para disparar /analyze sin embeber el cuid.
  const handoffAgent = await prisma.agent.findFirst({
    where: { agentGroup: "handoff" },
    select: { id: true },
  });

  return NextResponse.json({
    handoffId: project.handoff?.id ?? null,
    agentId: handoffAgent?.id ?? null,
    canvasId,
    generated: blockCount > 0,
    blockCount,
    lastRunAt: lastRun?.createdAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    sourceSessions,
    projectSessionCount,
  });
}

/**
 * POST /api/projects/[projectId]/handoff
 *
 * Asegura (idempotente) la entidad Handoff + el canvas "Handoff" del proyecto, para
 * poder generar el documento. NO corre el agente (eso lo hace el cliente vía /analyze
 * async). Devuelve { handoffId, canvasId }.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      handoff: { select: { id: true } },
      canvases: { where: { name: "Handoff" }, select: { id: true }, take: 1 },
    },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let canvasId = project.canvases[0]?.id ?? null;
  let handoffId = project.handoff?.id ?? null;

  if (!canvasId || !handoffId) {
    const r = await prisma.$transaction(async (tx) => {
      const cId = canvasId ?? (await createHandoffCanvas(projectId, tx));
      const hId =
        handoffId ??
        (await tx.handoff.create({
          data: { clientId: project.clientId, projectId, hubspotSyncStatus: "pending" },
          select: { id: true },
        })).id;
      return { cId, hId };
    });
    canvasId = r.cId;
    handoffId = r.hId;
  }

  return NextResponse.json({ handoffId, canvasId });
}
