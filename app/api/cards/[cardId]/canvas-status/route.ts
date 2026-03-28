import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PUT: cambiar status del card en el canvas (draft → confirmed, o quitar del canvas)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const { action } = await req.json();

  if (action === "accept") {
    // Get the card to check if it's an update
    const card = await prisma.clientContextCard.findUnique({
      where: { id: cardId },
      select: { parentCardId: true, content: true, title: true, diagramData: true, cardType: true },
    });

    if (card?.parentCardId) {
      // This is an update — replace the original card's content with the new one
      await prisma.clientContextCard.update({
        where: { id: card.parentCardId },
        data: {
          content: card.content,
          title: card.title,
          ...(card.cardType === "FLOWCHART" && card.diagramData ? { diagramData: card.diagramData } : {}),
          source: "AGENT",
        },
      });
      // Remove the draft (it replaced the original)
      await prisma.clientContextCard.delete({ where: { id: cardId } });
      return NextResponse.json({ ok: true, status: "merged" });
    }

    // Regular draft (not an update) — just confirm
    await prisma.clientContextCard.update({
      where: { id: cardId },
      data: { canvasStatus: "confirmed" },
    });
    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  if (action === "reject") {
    // Rechazar draft → quitar del canvas (canvasSection = null)
    await prisma.clientContextCard.update({
      where: { id: cardId },
      data: { canvasSection: null, canvasOrder: null, canvasStatus: "confirmed" },
    });
    return NextResponse.json({ ok: true, status: "removed" });
  }

  return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
}
