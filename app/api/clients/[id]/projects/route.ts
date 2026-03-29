import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireConsultantSession(); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

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
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireConsultantSession(); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

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
}
