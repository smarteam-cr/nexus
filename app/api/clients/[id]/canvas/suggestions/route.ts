import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EMPTY_CLIENT_CANVAS } from "@/lib/canvas/template";
import { deepMergeCanvas } from "@/lib/canvas/merge";
import type { ClientCanvas } from "@/lib/canvas/template";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const suggestions = await prisma.canvasSuggestion.findMany({
    where: { clientId: id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ suggestions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { suggestionId, action } = await req.json();

  if (!suggestionId || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "suggestionId and action (accept|reject) required" }, { status: 400 });
  }

  const suggestion = await prisma.canvasSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion || suggestion.clientId !== id) {
    return NextResponse.json({ error: "suggestion not found" }, { status: 404 });
  }

  if (action === "reject") {
    await prisma.canvasSuggestion.update({
      where: { id: suggestionId },
      data: { status: "rejected" },
    });
    return NextResponse.json({ ok: true });
  }

  // Accept: merge suggested value into client canvas
  const client = await prisma.client.findUnique({
    where: { id },
    select: { canvas: true, canvasConfidence: true },
  });
  const current = (client?.canvas as ClientCanvas | null) ?? { ...EMPTY_CLIENT_CANVAS };

  // Si la sección es un array y la sugerencia es un solo item, append en vez de reemplazar
  const sectionKey = suggestion.section as keyof ClientCanvas;
  const currentSectionValue = current[sectionKey];
  let sectionUpdate: Partial<ClientCanvas>;

  if (Array.isArray(currentSectionValue) && !Array.isArray(suggestion.suggested)) {
    // Append single item to existing array
    sectionUpdate = { [sectionKey]: [...currentSectionValue, suggestion.suggested] } as Partial<ClientCanvas>;
  } else {
    sectionUpdate = { [sectionKey]: suggestion.suggested } as Partial<ClientCanvas>;
  }

  const merged = deepMergeCanvas(current, sectionUpdate);

  // Update confidence for accepted section
  const currentConfidence = (client?.canvasConfidence as Record<string, string> | null) ?? {};
  const mergedConfidence = { ...currentConfidence, [sectionKey]: "confirmed" };

  await Promise.all([
    prisma.client.update({
      where: { id },
      data: { canvas: merged as object, canvasConfidence: mergedConfidence as object },
    }),
    prisma.canvasSuggestion.update({
      where: { id: suggestionId },
      data: { status: "accepted" },
    }),
  ]);

  return NextResponse.json({ ok: true, canvas: merged, confidence: mergedConfidence });
}
