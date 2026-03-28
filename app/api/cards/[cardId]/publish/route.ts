import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PUT: toggle publishedToClient and/or update publishedContent
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const body = await req.json();

  const card = await prisma.clientContextCard.findUnique({
    where: { id: cardId },
    select: { id: true, publishedToClient: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  // Toggle published status
  if (typeof body.published === "boolean") {
    data.publishedToClient = body.published;
  }

  // Update published content (version for client)
  if (typeof body.publishedContent === "string") {
    data.publishedContent = body.publishedContent || null;
  }

  const updated = await prisma.clientContextCard.update({
    where: { id: cardId },
    data,
    select: { id: true, publishedToClient: true, publishedContent: true },
  });

  return NextResponse.json(updated);
}
