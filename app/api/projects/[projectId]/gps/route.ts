import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { normalize, extractTitleTerms } from "@/lib/utils/matching";
import { enrichClient } from "@/lib/matching/enrichment";
import { sessionMatchesClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";
import type { RawTranscript } from "@/lib/fireflies/sync";

interface PendingItem {
  text: string;
  done: boolean;
  source?: string;
  addedAt?: string;
}

// Slugs del objeto Proyectos en HubSpot (mismos que usa sync-projects)
const PROJECT_SLUGS = ["projects", "PROJECT", "0-18", "0-49"];

// Resolve HubSpot pipeline stage ID → human-readable label
async function fetchHubspotStageLabel(serviceId: string): Promise<string | null> {
  try {
    const hs = await getSystemHubspotClient();

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

// Buscar sesiones del cliente (Google Meet + Fireflies legacy) y devolver
// la próxima futura y la última pasada.
async function getClientSessionBookends(clientId: string): Promise<{
  next: {
    sessionId: string;
    title: string;
    date: string;
    googleEventId: string | null;
    googleDocId: string | null;
  } | null;
  last: {
    sessionId: string;
    title: string;
    date: string;
    summary: string | null;
    googleDocId: string | null;
  } | null;
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: { select: { id: true } } },
  });

  if (!client) return { next: null, last: null };

  const [enriched, teamEmails] = await Promise.all([
    enrichClient(client),
    prisma.teamMember
      .findMany({ select: { email: true } })
      .then((ms) => new Set(ms.map((m) => normalize(m.email)))),
  ]);

  for (const te of teamEmails) {
    enriched.companyContactEmails.delete(te);
    enriched.dealContactEmails.delete(te);
  }

  const titleTerms = client.name ? extractTitleTerms(client.name) : [];
  const matcher: EnrichedClientMatcher = {
    clientId,
    name: client.name ?? "",
    titleTerms,
    enriched,
  };

  const hasMatchingSignal =
    titleTerms.length > 0 ||
    enriched.domains.size > 0 ||
    enriched.companyContactEmails.size > 0 ||
    enriched.dealContactEmails.size > 0;

  if (!hasMatchingSignal) return { next: null, last: null };

  // Cargar todas las sesiones (manualClientId override + matching cascade)
  // Optimización: traer solo lo que necesitamos para matching + bookends
  const allSessions = await prisma.firefliesSession.findMany({
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      participants: true,
      googleEventId: true,
      googleDocId: true,
      summary: true,
      manualClientId: true,
    },
    orderBy: { date: "desc" },
  });

  const matched = allSessions.filter((s) => {
    // Override manual: si la sesión tiene manualClientId, solo matchea con ese
    if (s.manualClientId) return s.manualClientId === clientId;

    // Cascade automático
    const raw: RawTranscript = {
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      duration: s.duration,
      participants: s.participants,
    };
    return sessionMatchesClient(raw, matcher, teamEmails);
  });

  const now = Date.now();
  // matched está ordenado DESC por date → reversa para encontrar la primera futura ASC
  const future = [...matched].reverse().filter((s) => s.date.getTime() > now);
  const past = matched.filter((s) => s.date.getTime() <= now);

  const nextRaw = future[0] ?? null;
  const lastRaw = past[0] ?? null;

  const extractSummaryText = (summary: unknown): string | null => {
    if (!summary || typeof summary !== "object") return null;
    const s = summary as Record<string, unknown>;
    // Estructura típica de Fireflies: { overview, shorthand_bullet, action_items, ... }
    if (typeof s.overview === "string") return s.overview;
    if (typeof s.shorthand_bullet === "string") return s.shorthand_bullet;
    return null;
  };

  return {
    next: nextRaw
      ? {
          sessionId: nextRaw.id,
          title: nextRaw.title,
          date: nextRaw.date.toISOString(),
          googleEventId: nextRaw.googleEventId,
          googleDocId: nextRaw.googleDocId,
        }
      : null,
    last: lastRaw
      ? {
          sessionId: lastRaw.id,
          title: lastRaw.title,
          date: lastRaw.date.toISOString(),
          summary: extractSummaryText(lastRaw.summary),
          googleDocId: lastRaw.googleDocId,
        }
      : null,
  };
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
      clientId: true,
      name: true,
      nextSessionDate: true,
      nextSessionNote: true,
      lastSessionSummary: true,
      pendingItems: true,
      currentStage: true,
      currentStep: true,
      serviceType: true,
      hubspotServiceId: true,
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotCreatedAt: true,
      hubspotPipelineName: true,
      createdAt: true,
    },
  });

  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Estado actual (HubSpot first, fallback a stage/step internos)
  let currentState: string;
  if (project.hubspotServiceId) {
    const hsLabel = await fetchHubspotStageLabel(project.hubspotServiceId);
    currentState = hsLabel ?? "Sin etapa";
  } else {
    const stageSteps = getStageSteps(project.serviceType);
    const stageLabel = STAGE_LABELS[project.currentStage] ?? `Etapa ${project.currentStage}`;
    const steps = stageSteps[project.currentStage] ?? [];
    const stepLabel = steps[project.currentStep]?.label ?? `Paso ${project.currentStep + 1}`;
    currentState = `${stageLabel} → ${stepLabel}`;
  }

  // Auto-rellenado de próxima y última sesión desde FirefliesSession (Google Meet + legacy)
  const sessionBookends = await getClientSessionBookends(project.clientId);

  // Resolver con override manual (si Project.* está seteado, prevalece)
  const manualNextDate = project.nextSessionDate?.toISOString() ?? null;
  const manualLastSummary = project.lastSessionSummary ?? null;

  const nextSession = {
    date: manualNextDate ?? sessionBookends.next?.date ?? null,
    title: sessionBookends.next?.title ?? null,
    note: project.nextSessionNote ?? null,
    googleEventId: sessionBookends.next?.googleEventId ?? null,
    source: (manualNextDate
      ? "manual"
      : sessionBookends.next
      ? "auto"
      : null) as "manual" | "auto" | null,
  };

  const lastSession = {
    date: sessionBookends.last?.date ?? null,
    title: sessionBookends.last?.title ?? null,
    summary: manualLastSummary ?? sessionBookends.last?.summary ?? null,
    googleDocId: sessionBookends.last?.googleDocId ?? null,
    source: (manualLastSummary
      ? "manual"
      : sessionBookends.last
      ? "auto"
      : null) as "manual" | "auto" | null,
  };

  // ── Info del proyecto (propiedades de HubSpot + base) ────────────────────
  const projectInfo = {
    name: project.name,
    pipelineName: project.hubspotPipelineName,
    cseEncargado: project.hubspotOwnerName,
    cseEncargadoEmail: project.hubspotOwnerEmail,
    createdAt: (project.hubspotCreatedAt ?? project.createdAt)?.toISOString() ?? null,
    createdAtSource: project.hubspotCreatedAt ? "hubspot" : "nexus",
  };

  return NextResponse.json({
    // Campos legacy (compatibilidad hacia atrás con el UI actual)
    nextSessionDate: nextSession.date,
    nextSessionNote: nextSession.note,
    lastSessionSummary: lastSession.summary,
    pendingItems: (project.pendingItems as PendingItem[] | null) ?? [],
    currentState,

    // Campos enriquecidos (nueva API)
    nextSession,
    lastSession,
    projectInfo,
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
