/**
 * lib/sessions/classify-session-project.ts
 *
 * Dado una sesión + el cliente al que pertenece, decide a qué proyecto(s)
 * activo(s) del cliente pertenece. Persiste filas SessionProject (N:N con
 * isPrimary).
 *
 * Reglas:
 *   - Si el cliente tiene 0 proyectos activos → no hace nada, devuelve null.
 *   - Si tiene 1 → asigna directo con isPrimary=true, confidence=1, source=agent.
 *     No llama a Claude (innecesario y costoso).
 *   - Si tiene 2+ → llama al agente IA `agent-session-project-classifier` y
 *     persiste sus assignments.
 *
 * NUNCA sobreescribe assignments con source="manual" — el override del CSE
 * siempre gana.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { getSystemHubspotClient } from "@/lib/hubspot/client";

export const AGENT_ID_SESSION_PROJECT_CLASSIFIER = "agent-session-project-classifier";

interface ClassifierOutput {
  assignments?: {
    projectId?: string;
    isPrimary?: boolean;
    confidence?: number;
    rationale?: string;
  }[];
}

export interface ClassifyResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  primaryProjectId?: string | null;
  assignmentsCreated?: number;
}

/**
 * Clasifica una sesión a los proyectos activos del cliente.
 * Retorna el projectId primario (o null si no hay proyecto asignado).
 */
export async function classifySessionToProjects(
  sessionId: string,
  clientId: string,
): Promise<ClassifyResult> {
  // 1. Cargar proyectos activos del cliente (excluyendo el de estrategia)
  const projects = await prisma.project.findMany({
    where: {
      clientId,
      status: "active",
      serviceType: { not: "__strategy__" },
    },
    select: { id: true, name: true, serviceType: true, currentStage: true, createdAt: true, hubspotDealId: true },
    orderBy: { createdAt: "desc" },
  });

  if (projects.length === 0) {
    return { status: "skipped", reason: "Client has no active projects", primaryProjectId: null };
  }

  // 2. Cargar assignments existentes para respetar overrides manuales
  const existing = await prisma.sessionProject.findMany({
    where: { sessionId },
    select: { projectId: true, source: true, isPrimary: true },
  });
  const manualLocked = existing.some((e) => e.source === "manual");
  if (manualLocked) {
    const primary = existing.find((e) => e.isPrimary);
    return {
      status: "skipped",
      reason: "Has manual overrides — agent will not touch",
      primaryProjectId: primary?.projectId ?? null,
    };
  }

  // 3. Atajo: 1 solo proyecto → asignación trivial sin Claude
  if (projects.length === 1) {
    const p = projects[0];
    await prisma.sessionProject.upsert({
      where: { sessionId_projectId: { sessionId, projectId: p.id } },
      create: {
        sessionId,
        projectId: p.id,
        isPrimary: true,
        source: "agent",
        confidence: 1,
        rationale: "Único proyecto activo del cliente",
      },
      update: {
        isPrimary: true,
        source: "agent",
        confidence: 1,
        rationale: "Único proyecto activo del cliente",
      },
    });
    return { status: "ok", primaryProjectId: p.id, assignmentsCreated: 1 };
  }

  // 4. 2+ proyectos → llamar al clasificador IA
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      participants: true,
      transcript: true,
      date: true,
    },
  });
  if (!session) return { status: "error", reason: "Session not found" };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });
  if (!client) return { status: "error", reason: "Client not found" };

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID_SESSION_PROJECT_CLASSIFIER },
    select: { systemPrompt: true },
  });
  if (!agent) {
    return {
      status: "error",
      reason: "Classifier agent not seeded — run npx tsx scripts/seed-session-project-classifier.ts",
    };
  }

  // Cruce temporal: traer el closedate de los deals ancla de los proyectos candidatos,
  // para que el clasificador desempate proyectos secuenciales o de fechas cercanas. El
  // closedate vive en el deal de HubSpot (no se desnormaliza). Best-effort: si HubSpot
  // falla, se clasifica sin fechas de cierre (NO se tumba la clasificación).
  const closeDateByDeal = new Map<string, string>();
  const dealIds = projects.map((p) => p.hubspotDealId).filter((d): d is string => !!d);
  if (dealIds.length > 0) {
    try {
      const hs = await getSystemHubspotClient();
      const res = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/deals/batch/read",
        body: { properties: ["closedate"], inputs: dealIds.map((id) => ({ id })) },
      });
      const data = (await res.json()) as {
        results?: { id: string; properties: { closedate?: string | null } }[];
      };
      for (const d of data.results ?? []) {
        if (d.properties.closedate) closeDateByDeal.set(d.id, d.properties.closedate);
      }
    } catch (e) {
      console.warn("[classify] no se pudo traer closedate de deals:", (e as Error).message);
    }
  }

  const day = (raw: string): string => {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
  };
  const projectsBlock = projects
    .map((p) => {
      const cierre = p.hubspotDealId
        ? closeDateByDeal.has(p.hubspotDealId)
          ? day(closeDateByDeal.get(p.hubspotDealId)!)
          : "(deal sin fecha de cierre)"
        : "(sin deal)";
      return `- id: ${p.id} | name: "${p.name}" | serviceType: ${p.serviceType ?? "(none)"} | stage: ${p.currentStage} | creado: ${day(p.createdAt.toISOString())} | cierre del deal: ${cierre}`;
    })
    .join("\n");

  const userMessage = [
    `=== CLIENTE ===`,
    `Nombre: ${client.name}`,
    "",
    `=== REUNIÓN ===`,
    `Título: ${session.title}`,
    `Fecha: ${session.date.toISOString().slice(0, 10)}`,
    `Participantes: ${session.participants.join(", ")}`,
    "",
    `=== PROYECTOS ACTIVOS DEL CLIENTE ===`,
    projectsBlock,
    "",
    `=== TRANSCRIPT ===`,
    (session.transcript ?? "").slice(0, 30000),
  ].join("\n");

  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    return { status: "error", reason: `Claude error: ${(e as Error).message}` };
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { status: "error", reason: "No JSON in classifier response" };

  let parsed: ClassifierOutput;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ClassifierOutput;
  } catch (e) {
    return { status: "error", reason: `JSON parse: ${(e as Error).message}` };
  }

  const assignments = (parsed.assignments ?? []).filter((a) => {
    if (!a.projectId) return false;
    if (!projects.some((p) => p.id === a.projectId)) return false;
    if ((a.confidence ?? 0) < 0.4) return false;
    return true;
  });

  if (assignments.length === 0) {
    return { status: "ok", primaryProjectId: null, assignmentsCreated: 0 };
  }

  // Garantizar exactamente UN primario (el primero marcado o el de mayor confidence)
  const primary =
    assignments.find((a) => a.isPrimary === true) ??
    [...assignments].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  // Persistir AgentRun para trazabilidad
  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID_SESSION_PROJECT_CLASSIFIER,
      clientId,
      status: "DONE",
      stepLabel: "Clasificación sesión→proyecto",
      output: JSON.stringify(parsed),
      sourceSessionIds: [sessionId],
    },
  });

  let count = 0;
  for (const a of assignments) {
    const isPrimary = a.projectId === primary.projectId;
    await prisma.sessionProject.upsert({
      where: {
        sessionId_projectId: { sessionId, projectId: a.projectId! },
      },
      create: {
        sessionId,
        projectId: a.projectId!,
        isPrimary,
        source: "agent",
        confidence: a.confidence ?? null,
        rationale: a.rationale ?? null,
        generatedByAgentRunId: run.id,
      },
      update: {
        // No tocar si fue overrideado manualmente (chequeo extra)
        isPrimary,
        source: "agent",
        confidence: a.confidence ?? null,
        rationale: a.rationale ?? null,
        generatedByAgentRunId: run.id,
      },
    });
    count++;
  }

  // Limpiar assignments del agente que ya no están (proyectos que dejó de proponer)
  const proposedIds = new Set(assignments.map((a) => a.projectId!));
  await prisma.sessionProject.deleteMany({
    where: {
      sessionId,
      source: "agent",
      projectId: { notIn: [...proposedIds] },
    },
  });

  return {
    status: "ok",
    primaryProjectId: primary.projectId ?? null,
    assignmentsCreated: count,
  };
}

/**
 * Lookup rápido del proyecto primario de una sesión, leyendo SessionProject.
 * Usado por endpoints/UI que necesitan el proyecto sin re-clasificar.
 */
export async function getPrimaryProjectIdForSession(sessionId: string): Promise<string | null> {
  const row = await prisma.sessionProject.findFirst({
    where: { sessionId, isPrimary: true },
    select: { projectId: true },
  });
  return row?.projectId ?? null;
}
