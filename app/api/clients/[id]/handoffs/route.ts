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

  // ── Sesiones de ventas con las que se armó cada handoff (item de validación) ──
  // Tomamos el último run del agente Handoff por proyecto que tenga sourceSessionIds.
  const projectIds = rows.map((h) => h.projectId);
  const runs = projectIds.length
    ? await prisma.agentRun.findMany({
        where: {
          projectId: { in: projectIds },
          agent: { agentGroup: "handoff" },
          sourceSessionIds: { isEmpty: false },
        },
        orderBy: { createdAt: "desc" },
        select: { projectId: true, sourceSessionIds: true },
      })
    : [];
  const sessionIdsByProject = new Map<string, string[]>();
  for (const r of runs) {
    if (r.projectId && !sessionIdsByProject.has(r.projectId)) {
      sessionIdsByProject.set(r.projectId, r.sourceSessionIds);
    }
  }
  const allSessionIds = [...new Set([...sessionIdsByProject.values()].flat())];
  const sessions = allSessionIds.length
    ? await prisma.firefliesSession.findMany({
        where: { id: { in: allSessionIds } },
        select: { id: true, title: true, date: true },
      })
    : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const handoffs = rows.map((h) => {
    const ids = sessionIdsByProject.get(h.projectId) ?? [];
    const sourceSessions = ids
      .map((id) => sessionById.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ id: s.id, title: s.title ?? "(sin título)", date: s.date.toISOString() }));
    return {
      id: h.id,
      projectId: h.projectId,
      projectName: h.project.name,
      canvasId: h.project.canvases[0]?.id ?? null,
      hubspotDealId: h.hubspotDealId,
      hubspotProjectId: h.hubspotProjectId,
      hubspotSyncStatus: h.hubspotSyncStatus,
      hubspotSyncError: h.hubspotSyncError,
      createdAt: h.createdAt,
      sourceSessions,
    };
  });

  return NextResponse.json({ handoffs });
}
