import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { updateCanvasAsync } from "@/lib/canvas/update-agent";

/**
 * POST /api/projects/{projectId}/canvas/refresh
 * Recopila todas las cards del proyecto y re-ejecuta el agente de canvas.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Recopilar todas las cards del proyecto (del último run de cada agente)
  const cards = await prisma.clientContextCard.findMany({
    where: { projectId, source: { not: "HUMAN" } },
    select: { title: true, content: true },
    orderBy: { createdAt: "desc" },
  });

  // También incluir cards manuales
  const manualCards = await prisma.clientContextCard.findMany({
    where: { projectId, source: "HUMAN" },
    select: { title: true, content: true },
  });

  const allCards = [...cards, ...manualCards];

  if (allCards.length === 0) {
    return NextResponse.json({ error: "No hay cards para procesar" }, { status: 400 });
  }

  try {
    await updateCanvasAsync(project.clientId, projectId, "manual-refresh", allCards);
    return NextResponse.json({ ok: true, cardsProcessed: allCards.length });
  } catch (e) {
    console.error("[canvas-refresh] Error:", e);
    return NextResponse.json({ error: "Error al actualizar canvas" }, { status: 500 });
  }
}
