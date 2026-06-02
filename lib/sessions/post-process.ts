/**
 * lib/sessions/post-process.ts
 *
 * Procesa el transcript de una FirefliesSession con el agente "Análisis
 * post-sesión" y persiste:
 *   - 1 SessionMinute (DRAFT)
 *   - N ActionItems vinculados a la sesión
 *
 * Reusable desde el endpoint manual (/api/sessions/[id]/post-process) y desde
 * el auto-trigger en `lib/google/meet-enrichment.ts`.
 *
 * Idempotente: si la sesión ya tiene `SessionMinute`, no la reemplaza
 * (a menos que se pase `force: true`).
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";

const AGENT_ID_POST_SESSION = "agent-post-session";

interface AgentOutput {
  minute?: {
    summary?: string;
    agreements?: { text: string }[];
    decisions?: { text: string; rationale?: string }[];
    risks?: { text: string; severity?: "low" | "med" | "high" }[];
    topics?: string[];
  };
  actionItems?: {
    text: string;
    ownerEmail?: string | null;
    dueDate?: string | null;
  }[];
  stageProgress?: { advance: boolean; reason?: string };
  // F5: sub-topics detectados (lead-scoring, workflow-builder, etc.)
  detectedTopics?: string[];
}

export interface PostProcessResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  sessionId: string;
  clientId?: string;
  minuteId?: string;
  actionItemsCreated?: number;
}

/**
 * Ejecuta el agente post-sesión sobre una sesión y persiste minuta + acciones.
 * Es seguro de llamar concurrentemente: la unicidad de SessionMinute.sessionId
 * en DB protege contra duplicados.
 */
export async function postProcessSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<PostProcessResult> {
  // 1. Cargar sesión con transcript
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      date: true,
      participants: true,
      manualClientId: true,
      transcript: true,
      summary: true,
    },
  });

  if (!session) {
    return { status: "error", sessionId, reason: "Session not found" };
  }
  if (!session.transcript || session.transcript.trim().length < 200) {
    return { status: "skipped", sessionId, reason: "No transcript (or too short)" };
  }

  // 2. Si ya hay minuta y no es force, saltar
  if (!opts.force) {
    const existing = await prisma.sessionMinute.findUnique({
      where: { sessionId },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        status: "skipped",
        sessionId,
        reason: `Already has minute (${existing.status})`,
        minuteId: existing.id,
      };
    }
  }

  // 3. Matchear sesión a cliente
  const [clients, categories, teamMembers] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true, company: true, emailDomains: true, industry: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
    prisma.teamMember.findMany({ select: { email: true, name: true, role: true } }),
  ]);

  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  const group = categorizeSession(
    {
      participants: session.participants,
      manualClientId: session.manualClientId,
      title: session.title,
    },
    ctx,
  );
  if (group.kind !== "client") {
    return {
      status: "skipped",
      sessionId,
      reason: `Session not matched to a client (categorized as ${group.kind})`,
    };
  }

  const client = clients.find((c) => c.id === group.id);
  if (!client) {
    return { status: "error", sessionId, reason: "Matched client not found" };
  }

  // 4a. Clasificador sesión→proyecto: persiste SessionProject (N:N) y devuelve
  //     el proyecto primario. Si el cliente tiene 1 proyecto, atajo trivial; si
  //     tiene 2+, llama al agente IA. Si tiene 0, primaryProjectId=null.
  const classify = await classifySessionToProjects(sessionId, client.id);
  const primaryProjectId = classify.primaryProjectId ?? null;

  // 4b. Cargar proyecto primario para usarlo en el prompt + metadata
  const project = primaryProjectId
    ? await prisma.project.findUnique({
        where: { id: primaryProjectId },
        select: { id: true, name: true, serviceType: true, currentStage: true, currentStep: true },
      })
    : null;

  const previousActionItems = await prisma.actionItem.findMany({
    where: { clientId: client.id, done: false },
    select: { text: true, status: true, ownerEmail: true, dueDate: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  // 5. Construir prompt
  const teamRoster = teamMembers
    .map((m) => `- ${m.name} <${m.email}>${m.role ? ` [${m.role}]` : ""}`)
    .join("\n");

  const previousItemsBlock =
    previousActionItems.length > 0
      ? `\n\n=== ACCIONES PENDIENTES PREVIAS DEL CLIENTE ===\n${previousActionItems
          .map((a) => `- [${a.status}] ${a.text}${a.ownerEmail ? ` (@${a.ownerEmail})` : ""}`)
          .join("\n")}`
      : "";

  const summaryBlock =
    session.summary && typeof session.summary === "object" && "overview" in (session.summary as object)
      ? `\n\n=== RESUMEN GENERADO POR GEMINI NOTES ===\n${(session.summary as { overview?: string }).overview ?? ""}`
      : "";

  const userMessage = [
    `=== CLIENTE ===`,
    `Nombre: ${client.name}`,
    client.company ? `Empresa: ${client.company}` : null,
    client.industry ? `Industria: ${client.industry}` : null,
    project ? `\nProyecto activo: ${project.name} (etapa ${project.currentStage}, paso ${project.currentStep})` : "",
    "",
    `=== EQUIPO INTERNO (emails válidos para ownerEmail) ===`,
    teamRoster,
    "",
    `=== REUNIÓN ===`,
    `Título: ${session.title}`,
    `Fecha: ${session.date.toISOString().slice(0, 10)}`,
    `Participantes: ${session.participants.join(", ")}`,
    summaryBlock,
    previousItemsBlock,
    "",
    `=== TRANSCRIPT ===`,
    session.transcript.slice(0, 60000), // protección contra transcripts gigantes
  ]
    .filter(Boolean)
    .join("\n");

  // 6. Llamar a Claude
  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: (await prisma.agent.findUnique({ where: { id: AGENT_ID_POST_SESSION }, select: { systemPrompt: true } }))?.systemPrompt ?? "",
      messages: [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    return { status: "error", sessionId, clientId: client.id, reason: `Claude error: ${(e as Error).message}` };
  }

  // 7. Parsear JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { status: "error", sessionId, clientId: client.id, reason: "No JSON in Claude response" };
  }
  let parsed: AgentOutput;
  try {
    parsed = JSON.parse(jsonMatch[0]) as AgentOutput;
  } catch (e) {
    return { status: "error", sessionId, clientId: client.id, reason: `JSON parse: ${(e as Error).message}` };
  }

  // 8. Crear AgentRun para trazabilidad
  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID_POST_SESSION,
      clientId: client.id,
      projectId: project?.id ?? null,
      status: "DONE",
      stepLabel: "Análisis post-sesión",
      output: JSON.stringify(parsed),
    },
  });

  // 9. Crear/reemplazar SessionMinute (idempotente)
  const minuteData = {
    summary: parsed.minute?.summary?.trim() ?? "(Sin resumen generado)",
    agreements: (parsed.minute?.agreements ?? []) as unknown as object,
    decisions: (parsed.minute?.decisions ?? []) as unknown as object,
    risks: (parsed.minute?.risks ?? []) as unknown as object,
    topics: (parsed.minute?.topics ?? []) as unknown as object,
    status: "DRAFT" as const,
    generatedByAgentRunId: run.id,
  };

  const minute = await prisma.sessionMinute.upsert({
    where: { sessionId },
    create: { sessionId, ...minuteData },
    update: opts.force
      ? { ...minuteData, status: "DRAFT", reviewedAt: null, reviewedByEmail: null }
      : minuteData, // solo entra aquí si NO había minute (else lo skipea arriba)
  });

  // 9b. Persistir detectedTopics en la sesión (F5-A)
  if (parsed.detectedTopics && Array.isArray(parsed.detectedTopics)) {
    const topics = parsed.detectedTopics
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length < 50)
      .slice(0, 10);
    if (topics.length > 0) {
      await prisma.firefliesSession.update({
        where: { id: sessionId },
        data: { detectedTopics: [...new Set(topics)] },
      });
    }
  }

  // 10. Crear ActionItems (deduplicar por text + clientId + source ya existente)
  const newItems = parsed.actionItems ?? [];
  let created = 0;
  for (const ai of newItems) {
    const text = (ai.text ?? "").trim();
    if (!text) continue;

    const existing = await prisma.actionItem.findFirst({
      where: {
        clientId: client.id,
        sessionId,
        text,
        source: "agent:post-session",
      },
      select: { id: true },
    });
    if (existing) continue;

    let dueDate: Date | null = null;
    if (ai.dueDate) {
      const d = new Date(ai.dueDate);
      if (!isNaN(d.getTime())) dueDate = d;
    }

    const ownerEmail = ai.ownerEmail?.trim().toLowerCase() || null;
    const validOwner = ownerEmail && teamMembers.some((m) => m.email.toLowerCase() === ownerEmail)
      ? ownerEmail
      : null;

    await prisma.actionItem.create({
      data: {
        text,
        clientId: client.id,
        projectId: project?.id ?? null,
        sessionId,
        ownerEmail: validOwner,
        dueDate,
        status: "PENDING",
        done: false,
        source: "agent:post-session",
        generatedByAgentRunId: run.id,
      },
    });
    created++;
  }

  // Refrescar el cache de heat ya que recién creamos un AgentRun.
  if (project) {
    const { invalidateProjectHeat } = await import("@/lib/projects/heat");
    invalidateProjectHeat(project.id);
  }

  console.log(
    `[post-session] ✓ "${session.title}" (cliente=${client.name}) — minuta DRAFT + ${created} action items`,
  );

  return {
    status: "ok",
    sessionId,
    clientId: client.id,
    minuteId: minute.id,
    actionItemsCreated: created,
  };
}
