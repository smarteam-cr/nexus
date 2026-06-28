/**
 * PATCH /api/business-cases/[id]/canvas-sections/[sectionId]
 *
 * Metadatos de cara al cliente de una sección (titleOverride / eyebrowOverride) con
 * undo de 1 nivel. Espejo del PATCH de projects, con guardSalesAccess + pertenencia
 * al caso y SIN gating de handoff. (El landing del BC se titula por la config, así
 * que hoy el workspace no lo usa, pero completa el contrato del hook.)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";

type Params = Promise<{ id: string; sectionId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      titleOverride: true,
      eyebrowOverride: true,
      agentBriefOverride: true,
      previousTitleOverride: true,
      previousEyebrowOverride: true,
      previousAgentBriefOverride: true,
      canvas: { select: { businessCaseId: true } },
    },
  });
  if (!section || section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }

  let body: { titleOverride?: unknown; eyebrowOverride?: unknown; agentBriefOverride?: unknown; undo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const RESP_SELECT = { id: true, titleOverride: true, eyebrowOverride: true, agentBriefOverride: true } as const;
  const norm = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  if (body.undo === "title" || body.undo === "eyebrow" || body.undo === "brief") {
    const data =
      body.undo === "title"
        ? { titleOverride: section.previousTitleOverride, previousTitleOverride: section.titleOverride }
        : body.undo === "eyebrow"
          ? { eyebrowOverride: section.previousEyebrowOverride, previousEyebrowOverride: section.eyebrowOverride }
          : { agentBriefOverride: section.previousAgentBriefOverride, previousAgentBriefOverride: section.agentBriefOverride };
    const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
    await touchCanvasContent(sectionId);
    return NextResponse.json(updated);
  }

  const data: Record<string, unknown> = {};
  if ("titleOverride" in body) {
    data.titleOverride = norm(body.titleOverride);
    data.previousTitleOverride = section.titleOverride;
  }
  if ("eyebrowOverride" in body) {
    data.eyebrowOverride = norm(body.eyebrowOverride);
    data.previousEyebrowOverride = section.eyebrowOverride;
  }
  if ("agentBriefOverride" in body) {
    data.agentBriefOverride = norm(body.agentBriefOverride);
    data.previousAgentBriefOverride = section.agentBriefOverride;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}
