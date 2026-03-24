import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET: obtener tags del proyecto
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tags: true },
  });
  return NextResponse.json({ tags: project?.tags ?? [] });
}

// PUT: actualizar tags del proyecto
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { tags } = await req.json();

  if (!Array.isArray(tags)) {
    return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { tags },
  });

  return NextResponse.json({ ok: true });
}
