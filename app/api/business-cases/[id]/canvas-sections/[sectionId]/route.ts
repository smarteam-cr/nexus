/**
 * /api/business-cases/[id]/canvas-sections/[sectionId]
 *   PATCH  → metadatos de cara al cliente (titleOverride / eyebrowOverride) con undo de
 *            1 nivel, el brief del agente y el flag `hidden`. Espejo del PATCH de
 *            projects, con guardSalesAccess + pertenencia al caso y SIN gating de handoff.
 *   DELETE → borra una sección PERSONALIZADA (solo esas — ver el guard del handler).
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { parseSectionEntries, withBriefUpdated, patchSectionEntry } from "@/lib/business-cases/section-briefs";
import { esCustomKey } from "@/lib/landing/custom-sections";

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

  let body: { titleOverride?: unknown; eyebrowOverride?: unknown; agentBriefOverride?: unknown; hidden?: unknown; undo?: unknown };
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

  // ── Rama OCULTAR (hidden): el CSE oculta/muestra la sección. Persiste en el Json. ──
  if ("hidden" in body) {
    const hidden = body.hidden === true;
    const entries = patchSectionEntry(section.canvas.sections, section.key, { hidden });
    await prisma.projectCanvas.update({
      where: { id: section.canvasId },
      data: { sections: entries as unknown as Prisma.InputJsonValue },
    });
    await touchCanvasContent(sectionId);
    return NextResponse.json({ id: section.id, hidden });
  }

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

/**
 * DELETE — borra una sección PERSONALIZADA con su bloque y su entry del Json.
 *
 * Por qué existe (ocultar no alcanza): para las 12 de la plantilla el universo es cerrado
 * y "ocultar" es la operación correcta; para las personalizadas el universo lo crea el
 * vendedor, así que tres clics equivocados dejarían tres fantasmas colapsados para siempre
 * en el editor — y encima se arrastrarían a cada versión nueva por el carry-forward.
 *
 * ⚠ Y por qué el guard `esCustomKey` es lo más importante del handler: un DELETE genérico
 * sobre `canvas-sections` permitiría borrar `hero` o `inversion` de un canvas, y para el
 * BC NO existe reconciliador (a diferencia del Handoff) — el documento quedaría mutilado
 * sin más salida que regenerarlo entero.
 *
 * Sin undo: el front confirma. Atenuante honesto para el copy — esto borra la sección de
 * ESTA versión del caso; las versiones anteriores del dropdown conservan la suya, y una
 * propuesta ya publicada conserva la suya en el snapshot.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: { key: true, canvasId: true, canvas: { select: { businessCaseId: true, sections: true } } },
  });
  if (!section || section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }
  if (!esCustomKey(section.key)) {
    return NextResponse.json(
      { error: "Solo se pueden borrar las secciones personalizadas. Las de la plantilla se ocultan." },
      { status: 400 },
    );
  }

  // El touch va ANTES del delete: lee la fila para dar con el canvas.
  await touchCanvasContent(sectionId);
  await prisma.$transaction([
    // Los bloques caen por `onDelete: Cascade`.
    prisma.canvasSection.delete({ where: { id: sectionId } }),
    prisma.projectCanvas.update({
      where: { id: section.canvasId },
      data: {
        sections: parseSectionEntries(section.canvas.sections).filter(
          (e) => e.key !== section.key,
        ) as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
