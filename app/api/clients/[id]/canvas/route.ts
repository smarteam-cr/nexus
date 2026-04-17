import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EMPTY_CLIENT_CANVAS } from "@/lib/canvas/template";
import { deepMergeCanvas, validateCanvasKeys } from "@/lib/canvas/merge";
import type { ClientCanvas } from "@/lib/canvas/template";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { canvas: true, canvasConfidence: true, updatedAt: true },
  });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    canvas: (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS,
    confidence: (client.canvasConfidence as Record<string, string> | null) ?? {},
    updatedAt: client.updatedAt.toISOString(),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { canvas: updates, confidence: confidenceUpdates } = await req.json();

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "canvas object required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id },
    select: { canvas: true, canvasConfidence: true },
  });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const current = (client.canvas as ClientCanvas | null) ?? { ...EMPTY_CLIENT_CANVAS };
  const validated = validateCanvasKeys(EMPTY_CLIENT_CANVAS, updates);
  const merged = deepMergeCanvas(current, validated);

  // Merge confidence
  const currentConfidence = (client.canvasConfidence as Record<string, string> | null) ?? {};
  const mergedConfidence = confidenceUpdates
    ? { ...currentConfidence, ...confidenceUpdates }
    : currentConfidence;

  const updated = await prisma.client.update({
    where: { id },
    data: { canvas: merged as object, canvasConfidence: mergedConfidence as object },
    select: { canvas: true, canvasConfidence: true, updatedAt: true },
  });

  return NextResponse.json({
    canvas: updated.canvas,
    confidence: updated.canvasConfidence ?? {},
    updatedAt: updated.updatedAt.toISOString(),
  });
}
