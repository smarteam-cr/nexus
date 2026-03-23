import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { stage, step } = await req.json();

  if (typeof stage !== "number" || typeof step !== "number") {
    return NextResponse.json({ error: "stage and step required" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: stage, currentStep: step },
  });

  return NextResponse.json({ ok: true });
}
