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
import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";

const AGENT_ID_PARTICIPANTS_ANALYZER = "agent-participants-analyzer";
const MAX_SESSIONS_TO_ANALYZE = 8;
/**
 * Cuántas sesiones matched-pero-huérfanas (sin SessionProject) auto-clasificar
 * por llamada para no gastar tokens en proyectos con muchas sesiones viejas.
 */
const MAX_AUTO_CLASSIFY = 5;

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
  /** Cantidad de sesiones huérfanas auto-clasificadas al cliente en este call. */
  autoClassified?: number;
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
  let links = await prisma.sessionProject.findMany({
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

  // Si no hay nada asignado, intentar auto-clasificar sesiones huérfanas
  // (matched al cliente vía cascade pero sin SessionProject row).
  let autoClassified = 0;
  if (links.length === 0) {
    autoClassified = await autoClassifyOrphanSessions(project.client.id);
    if (autoClassified > 0) {
      // Releer links después de la auto-clasificación
      links = await prisma.sessionProject.findMany({
        where: { projectId },
        orderBy: { session: { date: "desc" } },
        take: MAX_SESSIONS_TO_ANALYZE,
        select: {
          session: {
            select: { id: true, title: true, date: true, participants: true },
          },
        },
      });
    }
  }

  if (links.length === 0) {
    return {
      status: "skipped",
      reason:
        autoClassified === 0
          ? "Project has no sessions assigned yet (and no orphan sessions found for this client)"
          : `Auto-classified ${autoClassified} sessions but none ended up on this project — they went to another project of the same client`,
      sessionsAnalyzed: 0,
      autoClassified,
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
    autoClassified,
  };
}

/**
 * Helper: para un cliente dado, encuentra hasta MAX_AUTO_CLASSIFY sesiones
 * matched a él vía cascade (`categorizeSession`) que NO tienen aún
 * `SessionProject` row, y las clasifica vía `classifySessionToProjects`.
 *
 * Devuelve cuántas sesiones se pudieron clasificar exitosamente.
 *
 * Esto cierra el agujero de UX donde un proyecto creado/poblado antes del
 * cutover de F2 (SessionProject) queda con sesiones huérfanas y los flujos
 * dependientes (analyze-participants, meetings tab) responden vacío.
 */
async function autoClassifyOrphanSessions(clientId: string): Promise<number> {
  // 1. Cargar cliente + categorías + todas las sesiones (solo lo mínimo)
  const [client, categories, allSessions, existingLinks] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, company: true, emailDomains: true },
    }),
    prisma.sessionCategory.findMany({
      select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
    }),
    prisma.firefliesSession.findMany({
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        manualClientId: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.sessionProject.findMany({
      where: { project: { clientId } },
      select: { sessionId: true },
    }),
  ]);
  if (!client) return 0;

  const alreadyLinkedIds = new Set(existingLinks.map((l) => l.sessionId));

  // 2. Filtrar sesiones matched al cliente vía cascade, que no estén ya linkeadas
  const ctx: CategorizeContext = {
    clients: [client],
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };

  const orphans = allSessions.filter((s) => {
    if (alreadyLinkedIds.has(s.id)) return false;
    const group = categorizeSession(s, ctx);
    return group.kind === "client" && group.id === clientId;
  });

  if (orphans.length === 0) return 0;

  // 3. Clasificar las primeras N (máximo MAX_AUTO_CLASSIFY para no gastar tokens)
  const toClassify = orphans.slice(0, MAX_AUTO_CLASSIFY);
  let classified = 0;
  for (const session of toClassify) {
    try {
      const result = await classifySessionToProjects(session.id, clientId);
      if (result.status === "ok" && (result.assignmentsCreated ?? 0) > 0) {
        classified++;
      }
    } catch (e) {
      console.log(
        `[analyze-participants] auto-classify falló para sesión ${session.id}: ${(e as Error).message}`,
      );
    }
  }

  console.log(
    `[analyze-participants] auto-classify cliente=${client.name}: ${classified}/${toClassify.length} sesiones clasificadas`,
  );
  return classified;
}
