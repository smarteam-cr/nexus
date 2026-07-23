import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { ensureExploracionCanvas } from "@/lib/canvas/exploracion-generate";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET /api/projects/[projectId]/exploracion
 *
 * Estado de la guía de Exploración de UN proyecto (canvas on-demand, 1:1). Devuelve el
 * canvas si existe, si está GENERADA (≥1 bloque source=AGENT — el `cierre` curado nace
 * HUMAN y no cuenta, mismo criterio que el artifact-gate) y si el proyecto tiene handoff
 * generado, que es la fuente ANCLA: sin él la exploración arranca de cero y el CTA lo
 * avisa en vez de producir un documento hueco. Lo consume ProjectExploracionSection.
 *
 * NO expone nada de publicación: este documento es interno y no tiene camino externo
 * (congelado por `lib/canvas/exploracion-internal.test.ts`).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      canvases: { where: { name: { in: ["Exploración", "Handoff"] } }, select: { id: true, name: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canvasId = project.canvases.find((c) => c.name === "Exploración")?.id ?? null;
  const handoffCanvasId = project.canvases.find((c) => c.name === "Handoff")?.id ?? null;

  const [aiBlocks, handoffBlocks, lastRun] = await Promise.all([
    canvasId
      ? prisma.canvasBlock.count({ where: { source: "AGENT", section: { canvasId } } })
      : Promise.resolve(0),
    handoffCanvasId
      ? prisma.canvasBlock.count({ where: { section: { canvasId: handoffCanvasId } } })
      : Promise.resolve(0),
    prisma.agentRun.findFirst({
      where: { projectId, agent: { agentGroup: "exploracion" } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true },
    }),
  ]);

  return NextResponse.json({
    canvasId,
    generated: aiBlocks > 0,
    hasHandoff: handoffBlocks > 0,
    lastRun: lastRun ? { at: lastRun.createdAt, status: lastRun.status } : null,
  });
}

/**
 * POST /api/projects/[projectId]/exploracion
 *
 * "Ensure" idempotente del canvas (lo crea + reconcilia secciones) SIN correr el agente.
 * Lo usa el CTA para poder abrir el documento vacío y llenarlo a mano — la generación
 * con IA va por POST /api/clients/[id]/analyze, que es donde vive el gating de artefacto
 * (celda `exploracion.generate` / `.regenerate`) y la trazabilidad del AgentRun.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = await ensureExploracionCanvas(projectId);
  return NextResponse.json({ canvasId });
}
