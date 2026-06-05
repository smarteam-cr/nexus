import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { guardAccessToClient } from "@/lib/auth/api-guards";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: {
      // Presencia de handoff: el picker del CTA solo ofrece proyectos sin handoff
      // (Handoff es 1:1 con Project).
      handoff: { select: { id: true } },
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
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json()) as { name?: string };
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
}
