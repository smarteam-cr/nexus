import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { updateCanvasAsync } from "@/lib/canvas/update-agent";

/**
 * POST /api/clients/{id}/canvas/refresh
 * Recopila cards de todos los proyectos del cliente y re-ejecuta el agente de canvas.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  // Buscar el proyecto más reciente activo
  const project = await prisma.project.findFirst({
    where: { clientId, status: "active" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "No hay proyectos activos" }, { status: 400 });
  }

  // Recopilar todas las cards del cliente (de todos los proyectos)
  const cards = await prisma.clientContextCard.findMany({
    where: { clientId },
    select: { title: true, content: true },
    orderBy: { createdAt: "desc" },
  });

  if (cards.length === 0) {
    return NextResponse.json({ error: "No hay cards para procesar" }, { status: 400 });
  }

  try {
    await updateCanvasAsync(clientId, project.id, "manual-refresh", cards);
    return NextResponse.json({ ok: true, cardsProcessed: cards.length });
  } catch (e) {
    console.error("[client-canvas-refresh] Error:", e);
    return NextResponse.json({ error: "Error al actualizar canvas" }, { status: 500 });
  }
}
