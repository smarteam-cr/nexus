import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

// GET: sections + blocks for a non-default canvas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");

  if (!canvasId) {
    return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, isDefault: true },
  });

  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          blockType: true,
          content: true,
          data: true,
          previousContent: true,
          previousData: true,
          order: true,
          colSpan: true,
          colStart: true,
          rowSpan: true,
          source: true,
          status: true,
          agentRunId: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ sections });
}

// PUT: reorder blocks within/between sections
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { blockId, toSectionId, toIndex } = await req.json();

  if (!blockId || !toSectionId || typeof toIndex !== "number") {
    return NextResponse.json({ error: "blockId, toSectionId, toIndex required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findUnique({
    where: { id: blockId },
    include: { section: { select: { canvasId: true, canvas: { select: { projectId: true } } } } },
  });

  if (!block || block.section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }

  const fromSectionId = block.sectionId;

  if (fromSectionId === toSectionId) {
    // Reorder within same section
    const sectionBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const ids = sectionBlocks.map((b) => b.id).filter((id) => id !== blockId);
    ids.splice(toIndex, 0, blockId);
    await Promise.all(ids.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));
  } else {
    // Move to different section
    const fromBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: fromSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const fromIds = fromBlocks.map((b) => b.id).filter((id) => id !== blockId);
    await Promise.all(fromIds.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));

    const toBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const toIds = toBlocks.map((b) => b.id);
    toIds.splice(toIndex, 0, blockId);
    await Promise.all(toIds.map((id, i) =>
      prisma.canvasBlock.update({ where: { id }, data: { sectionId: toSectionId, order: i } })
    ));
  }

  return NextResponse.json({ ok: true });
}
