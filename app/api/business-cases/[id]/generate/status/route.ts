/**
 * GET /api/business-cases/[id]/generate/status
 *
 * Fase actual de la generación EN CURSO (F5.2 — feedback de operaciones largas):
 * el POST /generate es síncrono (10-30s+); mientras está en vuelo, el workspace
 * pollea este GET liviano y muestra `currentPhase` junto al botón "Generando…".
 * Devuelve la última corrida del caso: { status, phase } — sin corrida, nulls.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const run = await prisma.agentRun.findFirst({
    where: { businessCaseId: id, agentSlug: "business-case" },
    orderBy: { createdAt: "desc" },
    select: { status: true, currentPhase: true },
  });

  return NextResponse.json({ status: run?.status ?? null, phase: run?.currentPhase ?? null });
}
