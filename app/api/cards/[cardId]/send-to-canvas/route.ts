import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const PROJECT_SECTIONS = [
  "objetivo_alcance",
  "hipotesis_recomendaciones",
  "procesos",
  "plan_implementacion",
  "documentos",
];

const CLIENT_SECTIONS = [
  "perfil",
  "stakeholders",
  "herramientas",
  "contexto_comercial",
  "madurez",
  "retos_estrategicos",
  "escala_rendimiento",
  "oportunidades_futuras",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const { target, section, targetProjectId } = await req.json();

  if (!target || !section) {
    return NextResponse.json({ error: "target and section required" }, { status: 400 });
  }

  // Buscar el card original
  const original = await prisma.clientContextCard.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      clientId: true,
      projectId: true,
      title: true,
      content: true,
      cardType: true,
      diagramData: true,
      chartConfig: true,
      source: true,
    },
  });

  if (!original) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  // ── Enviar al canvas de proyecto ──
  if (target === "project") {
    if (!PROJECT_SECTIONS.includes(section)) {
      return NextResponse.json({ error: "invalid project section" }, { status: 400 });
    }

    // Verificar si ya existe un clon en el proyecto destino
    const destProjectId = targetProjectId || original.projectId;
    const existing = await prisma.clientContextCard.findFirst({
      where: { parentCardId: cardId, projectId: destProjectId, canvasSection: { not: null } },
      select: { id: true, canvasSection: true },
    });

    if (existing) {
      return NextResponse.json({
        error: "already_in_canvas",
        cloneId: existing.id,
        section: existing.canvasSection,
      }, { status: 409 });
    }

    // Calcular siguiente orden en la sección
    const maxOrder = await prisma.clientContextCard.aggregate({
      where: {
        projectId: destProjectId,
        canvasSection: section,
      },
      _max: { canvasOrder: true },
    });
    const nextOrder = (maxOrder._max.canvasOrder ?? -1) + 1;

    // Clonar el card al proyecto destino
    const clone = await prisma.clientContextCard.create({
      data: {
        clientId: original.clientId,
        projectId: destProjectId,
        title: original.title,
        content: original.content,
        cardType: original.cardType,
        diagramData: original.diagramData ?? undefined,
        chartConfig: original.chartConfig ?? undefined,
        source: original.source,
        canvasSection: section,
        canvasOrder: nextOrder,
        parentCardId: original.id,
      },
    });

    return NextResponse.json({ ok: true, cloneId: clone.id, section });
  }

  // ── Enviar al canvas de empresa (como sugerencia) ──
  if (target === "client") {
    if (!CLIENT_SECTIONS.includes(section)) {
      return NextResponse.json({ error: "invalid client section" }, { status: 400 });
    }

    // Crear CanvasSuggestion
    const suggestion = await prisma.canvasSuggestion.create({
      data: {
        clientId: original.clientId,
        section,
        field: original.title,
        suggestedValue: original.content,
        status: "pending",
      },
    });

    return NextResponse.json({ ok: true, suggestionId: suggestion.id, section });
  }

  return NextResponse.json({ error: "invalid target (project or client)" }, { status: 400 });
}

// GET: verificar si un card ya fue enviado al canvas + sección sugerida por el agente
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  const [clone, card] = await Promise.all([
    prisma.clientContextCard.findFirst({
      where: { parentCardId: cardId, canvasSection: { not: null } },
      select: { id: true, canvasSection: true },
    }),
    prisma.clientContextCard.findUnique({
      where: { id: cardId },
      select: {
        agentRun: {
          select: {
            agent: {
              select: { defaultCanvasSection: true },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    inCanvas: !!clone,
    cloneId: clone?.id ?? null,
    section: clone?.canvasSection ?? null,
    suggestedSection: card?.agentRun?.agent?.defaultCanvasSection ?? null,
  });
}
