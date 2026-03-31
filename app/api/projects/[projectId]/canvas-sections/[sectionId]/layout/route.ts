import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type Params = Promise<{ projectId: string; sectionId: string }>;

// PUT: save RGL layout for a section
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { sectionId } = await params;
  const { layout } = await req.json();

  if (!Array.isArray(layout)) {
    return NextResponse.json({ error: "layout must be an array" }, { status: 400 });
  }

  await prisma.canvasSection.update({
    where: { id: sectionId },
    data: { layout },
  });

  return NextResponse.json({ ok: true });
}
