/**
 * /api/clients/[id]/documentos/[canvasId]/canvas-sections/[sectionId] — el encabezado y el ojo de una sección de un
 * documento de la EMPRESA (R3 etapa 3, 2026-10-27). Espejo del PATCH de proyecto:
 *   { titleOverride } · { eyebrowOverride } · { undo: "title" | "eyebrow" } · { hidden }.
 * `hidden` vive en el Json del documento (como en los de proyecto: lo leen el enlace y el PDF).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { patchSectionEntry } from "@/lib/business-cases/section-briefs";
import { guardDocumentoDeLaEmpresa, seccionDelDocumento } from "@/lib/clients/documento-de-la-empresa-guard";

type Params = { params: Promise<{ id: string; canvasId: string; sectionId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, canvasId, sectionId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  const section = await seccionDelDocumento(canvasId, sectionId);
  if (!section) return NextResponse.json({ error: "section not found" }, { status: 404 });

  let body: { titleOverride?: unknown; eyebrowOverride?: unknown; hidden?: unknown; undo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const RESP = { id: true, titleOverride: true, eyebrowOverride: true } as const;
  const norm = (raw: unknown): string | null => (typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 200) : null);

  if ("hidden" in body) {
    const hidden = body.hidden === true;
    await prisma.projectCanvas.update({
      where: { id: canvasId },
      data: { sections: patchSectionEntry(doc.sections, section.key, { hidden, ocultaPorLaPlantilla: false }) as unknown as Prisma.InputJsonValue },
    });
    await touchCanvasContent(sectionId);
    return NextResponse.json({ id: section.id, hidden });
  }
  if (body.undo === "title" || body.undo === "eyebrow") {
    const data =
      body.undo === "title"
        ? { titleOverride: section.previousTitleOverride, previousTitleOverride: section.titleOverride }
        : { eyebrowOverride: section.previousEyebrowOverride, previousEyebrowOverride: section.eyebrowOverride };
    const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP });
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
  if (!Object.keys(data).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP });
  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}
