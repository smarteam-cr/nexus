import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";

interface PendingItem {
  text: string;
  done: boolean;
}

// GET: obtener datos del GPS del proyecto
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      nextSessionDate: true,
      nextSessionNote: true,
      lastSessionSummary: true,
      pendingItems: true,
      currentStage: true,
      currentStep: true,
      serviceType: true,
    },
  });

  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Derivar estado actual (etapa + subetapa)
  const stageSteps = getStageSteps(project.serviceType);
  const stageLabel = STAGE_LABELS[project.currentStage] ?? `Etapa ${project.currentStage}`;
  const steps = stageSteps[project.currentStage] ?? [];
  const stepLabel = steps[project.currentStep]?.label ?? `Paso ${project.currentStep + 1}`;

  return NextResponse.json({
    nextSessionDate: project.nextSessionDate?.toISOString() ?? null,
    nextSessionNote: project.nextSessionNote ?? null,
    lastSessionSummary: project.lastSessionSummary ?? null,
    pendingItems: (project.pendingItems as PendingItem[] | null) ?? [],
    currentState: `${stageLabel} → ${stepLabel}`,
  });
}

// PUT: actualizar datos del GPS
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};

  if ("nextSessionDate" in body) {
    data.nextSessionDate = body.nextSessionDate ? new Date(body.nextSessionDate) : null;
  }
  if ("nextSessionNote" in body) {
    data.nextSessionNote = body.nextSessionNote || null;
  }
  if ("lastSessionSummary" in body) {
    data.lastSessionSummary = body.lastSessionSummary || null;
  }
  if ("pendingItems" in body) {
    data.pendingItems = body.pendingItems ?? [];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json({ ok: true });
}
