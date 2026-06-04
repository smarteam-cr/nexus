import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

// GET: list canvases for a project (default first, then by createdAt)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      order: true,
      sections: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ canvases });
}

// POST: create a new custom canvas
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { name } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.create({
    data: {
      projectId,
      name: name.trim(),
      isDefault: false,
      sections: [],
    },
    select: { id: true, name: true, isDefault: true, sections: true },
  });

  return NextResponse.json(canvas, { status: 201 });
}
