import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = Promise<{ projectId: string; canvasId: string }>;

// PUT: update canvas name or sections
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();

  const data: Record<string, unknown> = {};
  if ("name" in body && body.name?.trim()) data.name = body.name.trim();
  if ("sections" in body) data.sections = body.sections;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.update({
    where: { id: canvasId },
    data,
    select: { id: true, name: true, isDefault: true, sections: true },
  });

  return NextResponse.json(canvas);
}

// DELETE: delete a custom canvas (not default)
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { isDefault: true },
  });

  if (!canvas) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (canvas.isDefault) {
    return NextResponse.json({ error: "cannot delete default canvas" }, { status: 400 });
  }

  // Move cards off-canvas before deleting
  await prisma.clientContextCard.updateMany({
    where: { canvasId },
    data: { canvasId: null, canvasSection: null, canvasOrder: null },
  });

  await prisma.projectCanvas.delete({ where: { id: canvasId } });

  return NextResponse.json({ ok: true });
}
