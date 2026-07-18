import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectEditHandoff, guardProjectGenerateHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { computeHandoffReadiness } from "@/lib/handoff/feeding";
import { createHandoffCanvas, reconcileHandoffCanvasSections } from "@/lib/canvas/default-canvases";

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
      implementationType: true,
      handoff: { select: { id: true, contextExclusions: true } },
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

  // Solo miembros (included=true): las excluidas por humano no cuentan como material.
  const projectSessionCount = await prisma.sessionProject.count({
    where: { projectId, included: true },
  });

  // Readiness: qué alimentaría el handoff HOY (política + regla) y si hay material real.
  // El front lo muestra antes de generar ("N sesiones alimentarán este handoff…").
  const handoffReadiness = await computeHandoffReadiness(projectId);

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
    handoffReadiness,
    contextExclusions: project.handoff?.contextExclusions ?? null,
    implementationType: project.implementationType,
  });
}

/**
 * PATCH /api/projects/[projectId]/handoff
 *
 * Guarda las EXCLUSIONES DE CONTEXTO del CSE (texto libre, ej. "ignorá el proyecto
 * DocuSign") — se inyectan como reglas duras en el prompt del agente al generar.
 * Body: { contextExclusions: string | null }. Mismo guard de edición que el POST.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectEditHandoff(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { contextExclusions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.contextExclusions !== "string" && body.contextExclusions !== null) {
    return NextResponse.json({ error: "contextExclusions (string|null) requerido" }, { status: 400 });
  }
  const value =
    typeof body.contextExclusions === "string"
      ? body.contextExclusions.trim().slice(0, 5000) || null
      : null;

  // Upsert: el Handoff 1:1 puede no existir todavía (lo crea el ensure POST al generar).
  await prisma.handoff.upsert({
    where: { projectId },
    create: { clientId: guard.clientId, projectId, contextExclusions: value },
    update: { contextExclusions: value },
  });

  return NextResponse.json({ ok: true, contextExclusions: value });
}

/**
 * POST /api/projects/[projectId]/handoff
 *
 * Asegura (idempotente) la entidad Handoff + el canvas "Handoff" del proyecto, para
 * poder generar el documento. NO corre el agente (eso lo hace el cliente vía /analyze
 * async). Devuelve { handoffId, canvasId }.
 *
 * Gate: `guardProjectGenerateHandoff` (generate/regenerate/write) — NO `handoffAnywhere`
 * (=write). El ensure es prerrequisito de la generación; exigir "Editar handoff" acá dejaba
 * inútil el permiso "Regenerar con IA" (403 antes del gate de IA). El gate fino vive en /analyze.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectGenerateHandoff(projectId);
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

  const canvasId = project.canvases[0]?.id ?? null;
  const handoffId = project.handoff?.id ?? null;

  // Ensure: canvas Handoff (creado fresco con la estructura actual si falta) o RECONCILIADO
  // a la estructura canónica si ya existe (crea secciones nuevas como "desarrollo", nunca borra
  // bloques) — así el agente no descarta secciones que el canvas viejo no tenía. + entidad Handoff.
  const ensured = await prisma.$transaction(async (tx) => {
    const cId = canvasId ?? (await createHandoffCanvas(projectId, tx));
    if (canvasId) await reconcileHandoffCanvasSections(canvasId, tx);
    const hId =
      handoffId ??
      (await tx.handoff.create({
        data: { clientId: project.clientId, projectId, hubspotSyncStatus: "pending" },
        select: { id: true },
      })).id;
    return { canvasId: cId, handoffId: hId };
  });

  return NextResponse.json({ handoffId: ensured.handoffId, canvasId: ensured.canvasId });
}
