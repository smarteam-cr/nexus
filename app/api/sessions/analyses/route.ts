/**
 * GET /api/sessions/analyses?clientId=xxx
 *
 * Lista los AgentRun previos generados por el hub de análisis (Fase 9)
 * para un Client específico. Ordenados desc por fecha.
 *
 * Solo trae metadata — las cards se cargan lazy via /api/sessions/analyses/[runId].
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // Solo runs creados desde el hub de análisis (tienen agentSlug)
  const runs = await prisma.agentRun.findMany({
    where: {
      clientId,
      agentSlug: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      agentSlug: true,
      status: true,
      filters: true,
      sourceSessionIds: true,
      createdAt: true,
      updatedAt: true,
      agent: { select: { id: true, name: true } },
    },
  });

  // Reducir payload: en lugar de mandar todos los sourceSessionIds, solo el count
  const summary = runs.map((r) => ({
    id: r.id,
    agentSlug: r.agentSlug,
    agentName: r.agent?.name ?? null,
    status: r.status,
    filters: r.filters,
    sourceSessionCount: r.sourceSessionIds.length,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json(summary);
}
