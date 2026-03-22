import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/context-cards
// ?noRun=true  → solo cards manuales (agentRunId IS NULL)
// Sin param    → cards del último AgentRun DONE; fallback a manuales si no hay runs.
export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const noRun = new URL(req.url).searchParams.get("noRun") === "true";

  try {
    // Modo noRun: solo anotaciones manuales sin run asociado
    if (noRun) {
      const manualCards = await prisma.clientContextCard.findMany({
        where: { clientId: id, agentRunId: null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json(manualCards);
    }

    const latestRun = await prisma.agentRun.findFirst({
      where: { clientId: id, status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (latestRun) {
      const runCards = await prisma.clientContextCard.findMany({
        where: { agentRunId: latestRun.id },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      // Si el run tiene cards propias, retornarlas
      if (runCards.length > 0) return NextResponse.json(runCards);
      // Si no (run legacy sin cards vinculadas), caer al fallback manual
    }

    // Fallback: cards manuales o legacy (sin run asociado)
    const manualCards = await prisma.clientContextCard.findMany({
      where: { clientId: id, agentRunId: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(manualCards);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Unknown error");
  }
});

// POST /api/clients/[id]/context-cards
// Body: { title, content?, order? }
export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { title, content, order, agentRunId } = (await req.json()) as {
    title: string;
    content?: string;
    order?: number;
    agentRunId?: string;
  };

  if (!title?.trim()) return apiError("title es requerido", 400);

  try {
    const card = await prisma.clientContextCard.create({
      data: {
        clientId:   id,
        title:      title.trim(),
        content:    content ?? "",
        order:      order ?? 0,
        source:     "HUMAN",
        agentRunId: agentRunId ?? null,
      },
    });
    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Unknown error");
  }
});
