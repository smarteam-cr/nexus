/**
 * PATCH /api/business-cases/[id]/canvas-sections/[sectionId]
 *
 * Metadatos de cara al cliente de una sección (titleOverride / eyebrowOverride) con
 * undo de 1 nivel. Espejo del PATCH de projects, con guardSalesAccess + pertenencia
 * al caso y SIN gating de handoff. (El landing del BC se titula por la config, así
 * que hoy el workspace no lo usa, pero completa el contrato del hook.)
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { parseSectionEntries, withBriefUpdated } from "@/lib/business-cases/section-briefs";

type Params = Promise<{ id: string; sectionId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      key: true,
      canvasId: true,
      titleOverride: true,
      eyebrowOverride: true,
      previousTitleOverride: true,
      previousEyebrowOverride: true,
      // El brief (guía del agente) vive en el Json del canvas, no en columna.
      canvas: { select: { businessCaseId: true, sections: true } },
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

  const norm = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  // Brief actual de la sección (desde el Json del canvas).
  const curEntry = parseSectionEntries(section.canvas.sections).find((e) => e.key === section.key);
  const curBrief = curEntry?.brief ?? null;
  const curPrevBrief = curEntry?.previousBrief ?? null;

  // ── Rama BRIEF (guía del agente): set o undo. Persiste en ProjectCanvas.sections. ──
  if (body.undo === "brief" || "agentBriefOverride" in body) {
    const newBrief = body.undo === "brief" ? curPrevBrief : norm(body.agentBriefOverride);
    const entries = withBriefUpdated(section.canvas.sections, section.key, newBrief, curBrief);
    await prisma.projectCanvas.update({
      where: { id: section.canvasId },
      data: { sections: entries as unknown as Prisma.InputJsonValue },
    });
    await touchCanvasContent(sectionId);
    return NextResponse.json({
      id: section.id,
      titleOverride: section.titleOverride,
      eyebrowOverride: section.eyebrowOverride,
      agentBriefOverride: newBrief,
    });
  }

  // ── Rama TITLE/EYEBROW (columnas estables): set o undo de 1 nivel. ──
  const RESP_SELECT = { id: true, titleOverride: true, eyebrowOverride: true } as const;
  if (body.undo === "title" || body.undo === "eyebrow") {
    const data =
      body.undo === "title"
        ? { titleOverride: section.previousTitleOverride, previousTitleOverride: section.titleOverride }
        : { eyebrowOverride: section.previousEyebrowOverride, previousEyebrowOverride: section.eyebrowOverride };
    const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
    await touchCanvasContent(sectionId);
    return NextResponse.json({ ...updated, agentBriefOverride: curBrief });
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
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
  await touchCanvasContent(sectionId);
  return NextResponse.json({ ...updated, agentBriefOverride: curBrief });
}
