import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EMPTY_PROJECT_CANVAS } from "@/lib/canvas/template";
import { deepMergeCanvas, validateCanvasKeys } from "@/lib/canvas/merge";
import type { ProjectCanvas } from "@/lib/canvas/template";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { canvas: true, updatedAt: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Merge con el template: incluir nuevas secciones, excluir keys obsoletas
  const stored = (project.canvas as Record<string, unknown> | null) ?? {};
  const templateKeys = new Set(Object.keys(EMPTY_PROJECT_CANVAS));
  const cleaned: Record<string, unknown> = {};
  for (const key of templateKeys) {
    cleaned[key] = key in stored ? stored[key] : (EMPTY_PROJECT_CANVAS as Record<string, unknown>)[key];
  }
  const canvas = cleaned as ProjectCanvas;

  return NextResponse.json({
    canvas,
    updatedAt: project.updatedAt.toISOString(),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { canvas: updates } = await req.json();

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "canvas object required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { canvas: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Merge con template para que nuevas secciones sean aceptadas
  const stored = (project.canvas as ProjectCanvas | null) ?? {};
  const current = { ...EMPTY_PROJECT_CANVAS, ...stored } as ProjectCanvas;
  const validated = validateCanvasKeys(EMPTY_PROJECT_CANVAS, updates);
  const merged = deepMergeCanvas(current, validated);

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { canvas: merged as object },
    select: { canvas: true, updatedAt: true },
  });

  return NextResponse.json({
    canvas: updated.canvas,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
