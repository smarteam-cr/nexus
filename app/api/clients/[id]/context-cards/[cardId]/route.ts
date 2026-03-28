import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string; cardId: string }> };

// PUT /api/clients/[id]/context-cards/[cardId]
// Body: { title?, content?, order? }
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireConsultantSession();
    const { id, cardId } = await params;
    const body = (await request.json()) as {
      title?: string;
      content?: string;
      order?: number;
      diagramData?: unknown;
    };

    // Si la card fue generada por el agente y se está editando, marcarla como MODIFIED
    const existing = await prisma.clientContextCard.findUnique({
      where: { id: cardId, clientId: id },
      select: { source: true },
    });
    const sourceUpdate = existing?.source === "AGENT" ? { source: "MODIFIED" as const } : {};

    const card = await prisma.clientContextCard.update({
      where: { id: cardId, clientId: id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.diagramData !== undefined ? { diagramData: body.diagramData as object } : {}),
        ...sourceUpdate,
      },
    });

    return NextResponse.json(card);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/clients/[id]/context-cards/[cardId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireConsultantSession();
    const { id, cardId } = await params;

    await prisma.clientContextCard.delete({
      where: { id: cardId, clientId: id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
