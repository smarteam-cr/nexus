import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/stage-notes?stage=1&step=1
export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const stage = parseInt(searchParams.get("stage") ?? "0");
  const step  = parseInt(searchParams.get("step")  ?? "0");

  if (!stage || !step) return apiError("stage y step son requeridos", 400);

  try {
    const note = await prisma.stageNote.findUnique({
      where: { clientId_stage_step: { clientId: id, stage, step } },
    });
    return NextResponse.json(note ?? { content: "" });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Unknown error");
  }
});

// PUT /api/clients/[id]/stage-notes
// Body: { stage, step, content }
export const PUT = withAuth(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { stage, step, content } = (await req.json()) as {
    stage: number;
    step: number;
    content: string;
  };

  if (!stage || !step) return apiError("stage y step son requeridos", 400);

  try {
    const note = await prisma.stageNote.upsert({
      where: { clientId_stage_step: { clientId: id, stage, step } },
      create: { clientId: id, stage, step, content: content ?? "" },
      update: { content: content ?? "" },
    });
    return NextResponse.json(note);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Unknown error");
  }
});
