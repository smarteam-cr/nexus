import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = Promise<{ projectId: string; sectionId: string }>;

/**
 * PATCH /api/projects/[projectId]/canvas-sections/[sectionId]
 *
 * Metadatos de cara al cliente de una sección (landing Kickoff), editados por el CSE:
 *   - { titleOverride }   → título grande (null/"" = vuelve al default de la plantilla)
 *   - { eyebrowOverride } → eyebrow / título pequeño (null/"" = default)
 *   - { undo: "title" | "eyebrow" } → deshacer de 1 nivel: intercambia el valor actual con
 *     `previous*` (toggle; permite deshacer y rehacer el último cambio).
 *
 * Al setear title/eyebrow se guarda el valor ACTUAL en `previous*` para habilitar el undo.
 * Guarded (interno/CSE).
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // La sección debe pertenecer a un canvas de ESTE proyecto. Traemos también los valores
  // actuales para poblar previous* (undo) en el mismo round-trip.
  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      titleOverride: true,
      eyebrowOverride: true,
      previousTitleOverride: true,
      previousEyebrowOverride: true,
      canvas: { select: { projectId: true } },
    },
  });
  if (!section || section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }

  let body: { titleOverride?: unknown; eyebrowOverride?: unknown; undo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const RESP_SELECT = { id: true, titleOverride: true, eyebrowOverride: true } as const;
  const norm = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  // ── Deshacer (toggle actual↔previous) ───────────────────────────────────────
  if (body.undo === "title" || body.undo === "eyebrow") {
    const data =
      body.undo === "title"
        ? { titleOverride: section.previousTitleOverride, previousTitleOverride: section.titleOverride }
        : { eyebrowOverride: section.previousEyebrowOverride, previousEyebrowOverride: section.eyebrowOverride };
    const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
    return NextResponse.json(updated);
  }

  // ── Set de title / eyebrow (guardando previous para el undo) ─────────────────
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
  return NextResponse.json(updated);
}
