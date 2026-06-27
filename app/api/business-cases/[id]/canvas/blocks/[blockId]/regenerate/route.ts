/**
 * POST /api/business-cases/[id]/canvas/blocks/[blockId]/regenerate { instruction }
 *
 * Reescribe el markdown de un bloque del canvas del business case según una
 * instrucción (edición por IA). Escribe el resultado (DRAFT/MODIFIED) y lo
 * devuelve. Gateado con guardSalesAccess + pertenencia.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { regenerateSectionMarkdown } from "@/lib/business-cases/canvas-agent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { id, blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const block = await prisma.canvasBlock.findUnique({
    where: { id: blockId },
    select: {
      content: true,
      sectionId: true,
      section: { select: { canvas: { select: { businessCaseId: true } } } },
    },
  });
  if (!block || block.section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "Bloque no existe" }, { status: 404 });
  }

  let body: { instruction?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "Indicá qué cambiar." }, { status: 400 });
  }

  try {
    const newMd = await regenerateSectionMarkdown(block.content ?? "", instruction);
    const updated = await prisma.canvasBlock.update({
      where: { id: blockId },
      data: { content: newMd, status: "DRAFT", source: "MODIFIED" },
    });
    await touchCanvasContent(block.sectionId);
    return NextResponse.json({ block: updated });
  } catch (e) {
    return NextResponse.json(
      { error: "La edición por IA falló: " + (e instanceof Error ? e.message : "error desconocido") },
      { status: 500 },
    );
  }
}
