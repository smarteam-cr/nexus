import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";

// GET: get current share token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { shareToken: true },
  });
  return NextResponse.json({ shareToken: project?.shareToken ?? null });
}

// POST: generate a new share token (or regenerate)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const token = randomUUID().replace(/-/g, "").slice(0, 24);

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: token },
    select: { shareToken: true },
  });

  return NextResponse.json({ shareToken: project.shareToken });
}

// DELETE: revoke share token
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  await prisma.project.update({
    where: { id: projectId },
    data: { shareToken: null },
  });

  return NextResponse.json({ ok: true });
}
