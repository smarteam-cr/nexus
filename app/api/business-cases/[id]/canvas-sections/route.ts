/**
 * GET /api/business-cases/[id]/canvas-sections?canvasId=
 *
 * Secciones + bloques de un canvas del business case (contrato del hook
 * useCanvasSections; espejo de /api/projects/[projectId]/canvas-sections).
 * Gateado con guardSalesAccess + verificación de pertenencia al caso.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");
  if (!canvasId) {
    return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { businessCaseId: true },
  });
  if (!canvas || canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          blockType: true,
          content: true,
          data: true,
          previousContent: true,
          previousData: true,
          order: true,
          colSpan: true,
          colStart: true,
          rowSpan: true,
          source: true,
          status: true,
          agentRunId: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ sections });
}
