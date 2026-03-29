import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Secciones fijas del canvas default ("Canvas de servicio")
const DEFAULT_SECTIONS = [
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

const CARD_SELECT = {
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
} as const;

// Resolve sections for a canvas: default uses hardcoded, custom uses DB sections
async function getSectionsForCanvas(canvasId: string | null, projectId: string) {
  if (!canvasId) {
    // Default canvas — find it and check
    const defaultCanvas = await prisma.projectCanvas.findFirst({
      where: { projectId, isDefault: true },
    });
    if (defaultCanvas) {
      return { sections: DEFAULT_SECTIONS.map((s) => ({ ...s })), isDefault: true, resolvedCanvasId: defaultCanvas.id };
    }
    return { sections: DEFAULT_SECTIONS.map((s) => ({ ...s })), isDefault: true, resolvedCanvasId: null };
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { isDefault: true, sections: true },
  });

  if (!canvas) {
    return { sections: DEFAULT_SECTIONS.map((s) => ({ ...s })), isDefault: true, resolvedCanvasId: null };
  }

  if (canvas.isDefault) {
    return { sections: DEFAULT_SECTIONS.map((s) => ({ ...s })), isDefault: true, resolvedCanvasId: canvasId };
  }

  // Custom canvas — sections from DB
  const dbSections = (canvas.sections ?? []) as Array<{ key: string; label: string }>;
  return { sections: dbSections, isDefault: false, resolvedCanvasId: canvasId };
}

// GET: obtener cards del canvas agrupados por sección
// ?canvasId=xxx → canvas específico (null/omitted = default)
// ?include=suggestions → también devuelve cards off-canvas de agentes
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const url = new URL(_req.url);
  const canvasIdParam = url.searchParams.get("canvasId");
  const includeSuggestions = url.searchParams.get("include") === "suggestions";

  const { sections: sectionDefs, isDefault, resolvedCanvasId } = await getSectionsForCanvas(canvasIdParam, projectId);

  // Filter cards: for default canvas, canvasId IS NULL; for custom, canvasId = id
  const canvasFilter = isDefault && !canvasIdParam
    ? { canvasId: null }
    : { canvasId: resolvedCanvasId };

  const cards = await prisma.clientContextCard.findMany({
    where: {
      projectId,
      canvasSection: { not: null },
      ...canvasFilter,
    },
    orderBy: [
      { canvasOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: CARD_SELECT,
  });

  // Agrupar por sección
  const cardsBySection = new Map<string, typeof cards>();
  cards.forEach((card) => {
    const section = card.canvasSection!;
    if (!cardsBySection.has(section)) cardsBySection.set(section, []);
    cardsBySection.get(section)!.push(card);
  });

  // Construir respuesta con todas las secciones (incluso vacías)
  const sections: CanvasSection[] = sectionDefs.map(({ key, label }) => ({
    key,
    label,
    cards: (cardsBySection.get(key) ?? []).map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  }));

  // Sugerencias: cards off-canvas de agentes (solo para default canvas)
  let suggestions: Array<typeof cards[number] & { agentName?: string }> = [];
  if (includeSuggestions && isDefault) {
    const offCanvas = await prisma.clientContextCard.findMany({
      where: {
        projectId,
        canvasSection: null,
        canvasId: null,
        agentRunId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        ...CARD_SELECT,
        agentRun: { select: { agent: { select: { name: true } } } },
      },
    });
    suggestions = offCanvas.map((c) => ({
      ...c,
      agentName: c.agentRun?.agent?.name ?? undefined,
      createdAt: c.createdAt.toISOString() as unknown as Date,
      updatedAt: c.updatedAt.toISOString() as unknown as Date,
    }));
  }

  return NextResponse.json({
    sections,
    isDefault,
    ...(includeSuggestions ? {
      suggestions: suggestions.map(s => ({
        ...s,
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : s.createdAt.toISOString(),
        updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : s.updatedAt.toISOString(),
      }))
    } : {}),
  });
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

  const card = await prisma.clientContextCard.findFirst({
    where: { id: cardId, projectId, canvasSection: { not: null } },
  });

  if (!card) {
    return NextResponse.json({ error: "card not found in canvas" }, { status: 404 });
  }

  const fromSection = card.canvasSection!;
  const canvasIdFilter = card.canvasId ?? undefined;
  const isSameSection = fromSection === toSection;

  if (isSameSection) {
    const sectionCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: toSection, canvasId: canvasIdFilter ?? null },
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
    const fromCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: fromSection, canvasId: canvasIdFilter ?? null },
      orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const fromIds = fromCards.map((c) => c.id).filter((id) => id !== cardId);
    await Promise.all(
      fromIds.map((id, i) =>
        prisma.clientContextCard.update({ where: { id }, data: { canvasOrder: i } })
      )
    );

    const toCards = await prisma.clientContextCard.findMany({
      where: { projectId, canvasSection: toSection, canvasId: canvasIdFilter ?? null },
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
