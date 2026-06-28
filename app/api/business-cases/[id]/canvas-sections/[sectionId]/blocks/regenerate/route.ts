/**
 * POST /api/business-cases/[id]/canvas-sections/[sectionId]/blocks/regenerate
 *
 * Edición por IA de UNA sección estructurada: toma { blockId, instruction, base? }
 * y DEVUELVE el `data` regenerado de esa sección — NO escribe (el guardado lo hace
 * el front por el PUT). Usa el agente del business case (regenerateSectionData);
 * a diferencia del de projects, NO exige canvas "Kickoff".
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { regenerateSectionData } from "@/lib/business-cases/canvas-agent";
import { briefsByKeyFrom } from "@/lib/business-cases/section-briefs";

type Params = Promise<{ id: string; sectionId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => ({}))) as {
    blockId?: string;
    instruction?: string;
    base?: { content?: string | null; data?: unknown };
  };
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!blockId || !instruction) {
    return NextResponse.json({ error: "blockId e instruction requeridos" }, { status: 400 });
  }
  const base = body.base && typeof body.base === "object" ? body.base : null;

  // Bloque + key de su sección + pertenencia al business case (+ briefs del canvas).
  const block = await prisma.canvasBlock.findFirst({
    where: { id: blockId, sectionId },
    select: { data: true, section: { select: { key: true, canvas: { select: { businessCaseId: true, sections: true } } } } },
  });
  if (!block || block.section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
  }

  try {
    const current = base ? base.data : block.data;
    // Guía efectiva de esta sección (override del CSE en el Json del canvas, si hay).
    const brief = briefsByKeyFrom(block.section.canvas.sections)[block.section.key];
    const data = await regenerateSectionData(block.section.key, current, instruction, brief);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[bc blocks/regenerate] error:", e);
    return NextResponse.json({ error: "regenerate_failed" }, { status: 500 });
  }
}
