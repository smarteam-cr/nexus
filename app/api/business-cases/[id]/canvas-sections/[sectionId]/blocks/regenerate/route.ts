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
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { templateDefsByKey, findDefAcrossTemplates } from "@/components/landing/configs/templates.defs";

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
    select: {
      data: true,
      section: {
        select: {
          key: true,
          canvas: {
            select: {
              businessCaseId: true,
              sections: true,
              businessCase: { select: { id: true, caseType: true, caseSubtype: true } },
            },
          },
        },
      },
    },
  });
  if (!block || block.section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
  }

  try {
    const current = base ? base.data : block.data;
    // Guía efectiva: desde la Plantilla (v0) del BC; fallback al canvas propio (legacy).
    const template = await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, version: 0 },
      select: { sections: true },
    });
    const briefSource = template?.sections ?? block.section.canvas.sections;
    const brief = briefsByKeyFrom(briefSource)[block.section.key];
    const resolved = block.section.canvas.businessCase
      ? resolveCaseTypeFor(block.section.canvas.businessCase, template?.sections)
      : null;
    // Secciones determinísticas (agentGenerated:false, p.ej. casos_de_uso): el LLM
    // NO puede reescribirlas — "resumí esto" alteraría precios del catálogo que
    // luego se publican congelados. Se editan solo a mano.
    const def =
      templateDefsByKey(resolved?.templateId)[block.section.key] ??
      findDefAcrossTemplates(block.section.key);
    if (def?.agentGenerated === false) {
      return NextResponse.json(
        { error: "Esta sección se llena desde el catálogo y se edita a mano (sin IA)." },
        { status: 400 },
      );
    }
    const data = await regenerateSectionData(
      block.section.key,
      current,
      instruction,
      brief,
      resolved?.templateId,
    );
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[bc blocks/regenerate] error:", e);
    return NextResponse.json({ error: "regenerate_failed" }, { status: 500 });
  }
}
