/**
 * lib/projects/analyze-participants.ts
 *
 * Analiza el patrón de participantes del proyecto en sus últimas N sesiones y
 * persiste:
 *   - 1 ProjectParticipantSnapshot (sobreescribible) con stats + alerts
 *   - 1 AgentRun con sourceSessionIds = sesiones analizadas
 *
 * F5-B del rediseño. Llamado on-demand vía endpoint, y opcionalmente cada N
 * sesiones desde postProcessSession (TODO).
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";

const AGENT_ID_PARTICIPANTS_ANALYZER = "agent-participants-analyzer";
const MAX_SESSIONS_TO_ANALYZE = 8;

interface AnalyzerOutput {
  stats?: Record<string, unknown>;
  alerts?: { severity?: string; type?: string; text?: string }[];
}

export interface AnalyzeResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  snapshotId?: string;
  sessionsAnalyzed?: number;
  alertsCount?: number;
}

export async function analyzeProjectParticipants(
  projectId: string,
): Promise<AnalyzeResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
  });
  if (!project) return { status: "error", reason: "Project not found" };

  // Cargar últimas sesiones vinculadas al proyecto
  const links = await prisma.sessionProject.findMany({
    where: { projectId },
    orderBy: { session: { date: "desc" } },
    take: MAX_SESSIONS_TO_ANALYZE,
    select: {
      session: {
        select: {
          id: true,
          title: true,
          date: true,
          participants: true,
        },
      },
    },
  });

  if (links.length === 0) {
    return {
      status: "skipped",
      reason: "Project has no sessions assigned yet",
      sessionsAnalyzed: 0,
    };
  }

  // Equipo interno para separar Smarteam vs cliente
  const teamMembers = await prisma.teamMember.findMany({
    select: { email: true, name: true, role: true },
  });
  const internalEmails = new Set(teamMembers.map((m) => m.email.toLowerCase()));

  const sessionsBlock = links
    .map((l) => {
      const s = l.session;
      const team: string[] = [];
      const clientSide: string[] = [];
      for (const p of s.participants) {
        if (internalEmails.has(p.toLowerCase())) team.push(p);
        else clientSide.push(p);
      }
      return `- ${s.date.toISOString().slice(0, 10)} · "${s.title}"
  team_smarteam: ${team.join(", ") || "(ninguno)"}
  client_side:   ${clientSide.join(", ") || "(ninguno)"}`;
    })
    .join("\n");

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID_PARTICIPANTS_ANALYZER },
    select: { systemPrompt: true },
  });
  if (!agent) {
    return {
      status: "error",
      reason: "Analyzer agent not seeded — run npx tsx scripts/seed-participants-analyzer.ts",
    };
  }

  const userMessage = [
    `Proyecto: ${project.name}`,
    `Cliente: ${project.client.name}`,
    `Sesiones analizadas: ${links.length}`,
    "",
    sessionsBlock,
  ].join("\n");

  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    return { status: "error", reason: `Claude error: ${(e as Error).message}` };
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { status: "error", reason: "No JSON in response" };

  let parsed: AnalyzerOutput;
  try {
    parsed = JSON.parse(jsonMatch[0]) as AnalyzerOutput;
  } catch (e) {
    return { status: "error", reason: `JSON parse: ${(e as Error).message}` };
  }

  // Persistir AgentRun para trazabilidad
  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID_PARTICIPANTS_ANALYZER,
      clientId: project.client.id,
      projectId: project.id,
      status: "DONE",
      stepLabel: "Análisis de participantes",
      output: JSON.stringify(parsed),
      sourceSessionIds: links.map((l) => l.session.id),
    },
  });

  // Persistir snapshot (sobreescribible)
  const fullStats = {
    ...(parsed.stats ?? {}),
    alerts: parsed.alerts ?? [],
  };

  const snapshot = await prisma.projectParticipantSnapshot.upsert({
    where: { projectId },
    create: {
      projectId,
      stats: fullStats as unknown as object,
      sessionsAnalyzed: links.length,
      generatedByAgentRunId: run.id,
    },
    update: {
      stats: fullStats as unknown as object,
      sessionsAnalyzed: links.length,
      generatedByAgentRunId: run.id,
    },
  });

  return {
    status: "ok",
    snapshotId: snapshot.id,
    sessionsAnalyzed: links.length,
    alertsCount: (parsed.alerts ?? []).length,
  };
}
