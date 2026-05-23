import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";

export const GET = withAuth(async (
  _req,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;

  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          stageNotes: true,
          contextCards: true,
          documents: true,
          agentRuns: true,
        },
      },
    },
  });

  return NextResponse.json({ projects });
});

export const POST = withAuth(async (
  req,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;
  const body = await req.json() as { name?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name requerido" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      clientId,
      name: body.name.trim(),
      status: "active",
    },
  });

  await createDefaultCanvases(project.id);

  return NextResponse.json({ project }, { status: 201 });
});
