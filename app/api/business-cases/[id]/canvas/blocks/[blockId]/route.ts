/**
 * /api/business-cases/[id]/canvas/blocks/[blockId]
 *   PUT  { content? | status? } → editar contenido o aceptar/reabrir
 *   DELETE → eliminar el bloque
 *
 * Opera sobre CanvasBlock del canvas del business case. Gateado con
 * guardSalesAccess + verificación de pertenencia (el bloque cuelga de una sección
 * de un canvas de ESTE business case).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";

async function blockSectionFor(blockId: string, bcId: string): Promise<string | null> {
  const block = await prisma.canvasBlock.findUnique({
    where: { id: blockId },
    select: {
      sectionId: true,
      source: true,
      section: { select: { canvas: { select: { businessCaseId: true } } } },
    },
  });
  if (!block || block.section.canvas.businessCaseId !== bcId) return null;
  return block.sectionId;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { id, blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const sectionId = await blockSectionFor(blockId, id);
  if (!sectionId) {
    return NextResponse.json({ error: "Bloque no existe" }, { status: 404 });
  }

  let body: { content?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const block = await prisma.canvasBlock.findUnique({ where: { id: blockId }, select: { source: true } });
  const data: Record<string, unknown> = {};
  if (typeof body.content === "string") {
    data.content = body.content;
    if (block?.source === "AGENT") data.source = "MODIFIED";
  }
  if (body.status === "DRAFT" || body.status === "CONFIRMED") data.status = body.status;

  const updated = await prisma.canvasBlock.update({ where: { id: blockId }, data });
  await touchCanvasContent(sectionId);
  return NextResponse.json({ block: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { id, blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const sectionId = await blockSectionFor(blockId, id);
  if (!sectionId) {
    return NextResponse.json({ error: "Bloque no existe" }, { status: 404 });
  }

  await prisma.canvasBlock.delete({ where: { id: blockId } });
  await touchCanvasContent(sectionId);
  return NextResponse.json({ ok: true });
}
