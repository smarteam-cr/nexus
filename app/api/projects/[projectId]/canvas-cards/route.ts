import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Secciones del canvas de proyecto en orden
const CANVAS_SECTIONS = [
  { key: "objetivo_alcance", label: "Objetivo y alcance" },
  { key: "hipotesis_recomendaciones", label: "Hipótesis y recomendaciones" },
  { key: "procesos", label: "Procesos" },
  { key: "plan_implementacion", label: "Plan de implementación" },
] as const;

export type CanvasSection = {
  key: string;
  label: string;
  cards: Array<{
    id: string;
    title: string;
    content: string;
    cardType: string;
    canvasOrder: number | null;
    canvasStatus: string;
    diagramData: unknown;
    source: string;
    parentCardId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

// GET: obtener cards del canvas agrupados por sección
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const cards = await prisma.clientContextCard.findMany({
    where: {
      projectId,
      canvasSection: { not: null },
    },
    orderBy: [
      { canvasOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      title: true,
      content: true,
      cardType: true,
      canvasSection: true,
      canvasOrder: true,
      canvasStatus: true,
      diagramData: true,
      source: true,
      publishedToClient: true,
      publishedContent: true,
      parentCardId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Agrupar por sección
  const cardsBySection = new Map<string, typeof cards>();
  cards.forEach((card) => {
    const section = card.canvasSection!;
    if (!cardsBySection.has(section)) cardsBySection.set(section, []);
    cardsBySection.get(section)!.push(card);
  });

  // Construir respuesta con todas las secciones (incluso vacías)
  const sections: CanvasSection[] = CANVAS_SECTIONS.map(({ key, label }) => ({
    key,
    label,
    cards: (cardsBySection.get(key) ?? []).map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  }));

  return NextResponse.json({ sections });
}

// PUT: reordenar cards dentro/entre secciones
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { cardId, toSection, toIndex } = await req.json();

  if (!cardId || !toSection || typeof toIndex !== "number") {
    return NextResponse.json({ error: "cardId, toSection, toIndex required" }, { status: 400 });
  }

  // Verificar que el card pertenece al proyecto
  const card = await prisma.clientContextCard.findFirst({
    where: { id: cardId, projectId, canvasSection: { not: null } },
  });

  if (!card) {
    return NextResponse.json({ error: "card not found in canvas" }, { status: 404 });
  }

  const fromSection = card.canvasSection!;
  const isSameSection = fromSection === toSection;

  if (isSameSection) {
    // Reordenar dentro de la misma sección
    const sectionCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: toSection },
      orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    const ids = sectionCards.map((c) => c.id).filter((id) => id !== cardId);
    ids.splice(toIndex, 0, cardId);

    await Promise.all(
      ids.map((id, i) =>
        prisma.clientContextCard.update({
          where: { id },
          data: { canvasOrder: i },
        })
      )
    );
  } else {
    // Mover a otra sección
    // 1. Reordenar sección origen (sin el card)
    const fromCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: fromSection },
      orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const fromIds = fromCards.map((c) => c.id).filter((id) => id !== cardId);
    await Promise.all(
      fromIds.map((id, i) =>
        prisma.clientContextCard.update({ where: { id }, data: { canvasOrder: i } })
      )
    );

    // 2. Insertar en sección destino
    const toCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: toSection },
      orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const toIds = toCards.map((c) => c.id);
    toIds.splice(toIndex, 0, cardId);
    await Promise.all(
      toIds.map((id, i) =>
        prisma.clientContextCard.update({
          where: { id },
          data: { canvasSection: toSection, canvasOrder: i },
        })
      )
    );
  }

  return NextResponse.json({ ok: true });
}

// DELETE: quitar un card del canvas (no lo borra, solo limpia canvasSection)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { cardId } = await req.json();

  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  await prisma.clientContextCard.updateMany({
    where: { id: cardId, projectId },
    data: { canvasSection: null, canvasOrder: null },
  });

  return NextResponse.json({ ok: true });
}
