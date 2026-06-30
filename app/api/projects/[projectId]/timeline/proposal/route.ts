/**
 * DELETE /api/projects/[projectId]/timeline/proposal
 *
 * Descarta la propuesta pendiente de re-generación del cronograma (la que guarda
 * `persistTimelineFromAgentOutput` cuando el agente re-corre sobre un proyecto que YA
 * tiene timeline). NO toca el cronograma: solo limpia `pendingProposal`/`pendingProposalRunId`.
 *
 * "Aplicar" la propuesta es un PUT normal a /timeline (que también limpia el pendiente);
 * "Descartar" no debe escribir el cronograma, por eso este sub-recurso dedicado.
 *
 * Guarded con guardProjectHandoffAccess (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ cleared: false, reason: "no_timeline" }, { status: 404 });
  }

  await prisma.projectTimeline.update({
    where: { projectId },
    data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
  });

  return NextResponse.json({ cleared: true });
}
