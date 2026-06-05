import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/clients/[id]/handoffs
 *
 * Lista los handoffs (entidad cliente-level, model Handoff) de un cliente, con el
 * canvasId del canvas "Handoff" de cada proyecto — así la UI puede renderizar la
 * vista lineal del contenido (CanvasLinearView projectId+canvasId).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const rows = await prisma.handoff.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      hubspotDealId: true,
      hubspotProjectId: true,
      hubspotSyncStatus: true,
      hubspotSyncError: true,
      createdAt: true,
      project: {
        select: {
          name: true,
          // 1:1 con el Project — el canvas "Handoff" guarda el contenido.
          canvases: { where: { name: "Handoff" }, select: { id: true }, take: 1 },
        },
      },
    },
  });

  const handoffs = rows.map((h) => ({
    id: h.id,
    projectId: h.projectId,
    projectName: h.project.name,
    canvasId: h.project.canvases[0]?.id ?? null,
    hubspotDealId: h.hubspotDealId,
    hubspotProjectId: h.hubspotProjectId,
    hubspotSyncStatus: h.hubspotSyncStatus,
    hubspotSyncError: h.hubspotSyncError,
    createdAt: h.createdAt,
  }));

  return NextResponse.json({ handoffs });
}
