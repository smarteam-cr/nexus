/**
 * GET /api/sessions/analyses/[runId]
 *
 * Devuelve un AgentRun específico con sus cards generadas.
 * Usado por la UI del hub para abrir un análisis previo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

interface RouteCtx {
  params: Promise<{ runId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { runId } = await ctx.params;

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      agentSlug: true,
      clientId: true,
      status: true,
      filters: true,
      sourceSessionIds: true,
      createdAt: true,
      updatedAt: true,
      output: true,
      agent: { select: { id: true, name: true } },
      cards: {
        select: {
          id: true,
          title: true,
          content: true,
          canvasSection: true,
          order: true,
          source: true,
          cardType: true,
          canvasStatus: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ...run,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    sourceSessionCount: run.sourceSessionIds.length,
    // Reducimos payload: NO mandamos sourceSessionIds completo en este endpoint
  });
}
