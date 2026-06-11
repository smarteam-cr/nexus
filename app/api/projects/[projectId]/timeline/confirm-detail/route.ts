/**
 * /api/projects/[projectId]/timeline/confirm-detail
 *
 * Confirmación del CRONOGRAMA DETALLADO (tareas) — el gate que habilita que
 * las acciones por semana crucen a la vista externa del cliente
 * (lib/external/kickoff-view.ts solo incluye tasks si detailConfirmedAt != null).
 *
 *   GET    → { confirmed, confirmedAt }
 *   POST   → confirma (detailConfirmedAt = now)
 *   DELETE → quita la confirmación (detailConfirmedAt = null)
 *
 * Endpoint dedicado y no flag del PUT: confirmar no es editar (el PUT setea
 * lastEditedByHuman y diffea), es un acto explícito tipo "publicar" — espejo
 * de publish-kickoff. La confirmación es sticky: ediciones posteriores no la
 * invalidan; el CSE la quita a mano si quiere ocultar el detalle.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

async function getTimeline(projectId: string) {
  return prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, detailConfirmedAt: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await getTimeline(projectId);
  return NextResponse.json({
    confirmed: !!tl?.detailConfirmedAt,
    confirmedAt: tl?.detailConfirmedAt?.toISOString() ?? null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await getTimeline(projectId);
  if (!tl) {
    return NextResponse.json({ error: "No hay cronograma para confirmar" }, { status: 404 });
  }

  const now = new Date();
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { detailConfirmedAt: now },
  });
  return NextResponse.json({ confirmed: true, confirmedAt: now.toISOString() });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await getTimeline(projectId);
  if (!tl) {
    return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });
  }

  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { detailConfirmedAt: null },
  });
  return NextResponse.json({ confirmed: false, confirmedAt: null });
}
