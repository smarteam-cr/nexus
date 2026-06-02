import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = Promise<{ projectId: string; sectionId: string }>;

// POST: create a block manually
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { blockType, content, data } = await req.json();

  const maxOrder = await prisma.canvasBlock.aggregate({
    where: { sectionId },
    _max: { order: true },
  });

  const block = await prisma.canvasBlock.create({
    data: {
      sectionId,
      blockType: blockType ?? "TEXT",
      content: content ?? "",
      data: data ?? undefined,
      order: (maxOrder._max.order ?? -1) + 1,
      source: "HUMAN",
      status: "CONFIRMED",
    },
  });

  return NextResponse.json(block, { status: 201 });
}

// PUT: update block content/data or accept/reject draft
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();

  if (!body.blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findFirst({
    where: { id: body.blockId, sectionId },
  });

  if (!block) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if ("content" in body) updateData.content = body.content;
  if ("data" in body) updateData.data = body.data;
  if ("status" in body) updateData.status = body.status;
  if ("colSpan" in body) updateData.colSpan = Math.min(4, Math.max(1, Number(body.colSpan)));
  if ("colStart" in body) updateData.colStart = body.colStart === null ? null : Math.min(4, Math.max(1, Number(body.colStart)));
  if ("rowSpan" in body) updateData.rowSpan = Math.max(1, Number(body.rowSpan));

  const updated = await prisma.canvasBlock.update({
    where: { id: body.blockId },
    data: updateData,
  });

  return NextResponse.json(updated);
}

// DELETE: remove a block
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { blockId } = await req.json();

  if (!blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  await prisma.canvasBlock.deleteMany({
    where: { id: blockId, sectionId },
  });

  return NextResponse.json({ ok: true });
}
