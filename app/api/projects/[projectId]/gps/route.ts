import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { getSystemHubspotClient } from "@/lib/hubspot/client";

interface PendingItem {
  text: string;
  done: boolean;
}

// Slugs del objeto Proyectos en HubSpot (mismos que usa sync-services)
const PROJECT_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

// Resolve HubSpot pipeline stage ID → human-readable label
async function fetchHubspotStageLabel(serviceId: string): Promise<string | null> {
  try {
    const hs = await getSystemHubspotClient();

    // Probar cada slug hasta encontrar el objeto
    let pipelineId: string | null = null;
    let stageId: string | null = null;
    let workingSlug: string | null = null;

    for (const slug of PROJECT_SLUGS) {
      try {
        const res = await hs.apiRequest({
          method: "GET",
          path: `/crm/v3/objects/${slug}/${serviceId}?properties=hs_pipeline,hs_pipeline_stage`,
        });
        const data = (await res.json()) as {
          id?: string;
          properties?: { hs_pipeline?: string; hs_pipeline_stage?: string };
          status?: string;
        };
        if (data.status === "error" || !data.id) continue;
        pipelineId = data.properties?.hs_pipeline ?? null;
        stageId = data.properties?.hs_pipeline_stage ?? null;
        workingSlug = slug;
        break;
      } catch {
        continue;
      }
    }

    if (!pipelineId || !stageId || !workingSlug) return null;

    // Resolver el label del stage consultando el pipeline
    const pipelineRes = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/pipelines/${workingSlug}/${pipelineId}/stages`,
    });
    const pipelineData = (await pipelineRes.json()) as {
      results?: Array<{ id: string; label: string }>;
    };
    const stage = pipelineData.results?.find((s) => s.id === stageId);
    return stage?.label ?? null;
  } catch {
    return null;
  }
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
      hubspotServiceId: true,
    },
  });

  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Try to get live stage from HubSpot first
  let currentState: string;
  if (project.hubspotServiceId) {
    const hsLabel = await fetchHubspotStageLabel(project.hubspotServiceId);
    currentState = hsLabel ?? "Sin etapa";
  } else {
    // Fallback: derive from internal stage/step
    const stageSteps = getStageSteps(project.serviceType);
    const stageLabel = STAGE_LABELS[project.currentStage] ?? `Etapa ${project.currentStage}`;
    const steps = stageSteps[project.currentStage] ?? [];
    const stepLabel = steps[project.currentStep]?.label ?? `Paso ${project.currentStep + 1}`;
    currentState = `${stageLabel} → ${stepLabel}`;
  }

  return NextResponse.json({
    nextSessionDate: project.nextSessionDate?.toISOString() ?? null,
    nextSessionNote: project.nextSessionNote ?? null,
    lastSessionSummary: project.lastSessionSummary ?? null,
    pendingItems: (project.pendingItems as PendingItem[] | null) ?? [],
    currentState,
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
