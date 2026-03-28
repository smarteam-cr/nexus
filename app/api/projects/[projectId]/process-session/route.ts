import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { EMPTY_CLIENT_CANVAS } from "@/lib/canvas/template";
import type { ClientCanvas } from "@/lib/canvas/template";
import { enrichClient } from "@/lib/matching/enrichment";
import { sessionMatchesClient } from "@/lib/matching/cascade";
import type { EnrichedClientMatcher } from "@/lib/matching/cascade";
import { extractTitleTerms } from "@/lib/utils/matching";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, serviceType: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const clientId = project.clientId;

  const agent = await prisma.agent.findFirst({
    where: { agentType: "SESSION_PROCESSOR", status: "ACTIVE" },
    select: { id: true, name: true, systemPrompt: true, additionalInstructions: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "No session processor agent configured" }, { status: 400 });
  }

  // Last run of this agent for this project
  const lastRun = await prisma.agentRun.findFirst({
    where: { agentId: agent.id, projectId, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, company: true, canvas: true, hubspotCompanyId: true,
      hubspotAccount: { select: { id: true } },
    },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Get recent Fireflies sessions and match to client
  const recentSessions = await prisma.firefliesSession.findMany({
    where: lastRun ? { date: { gt: lastRun.createdAt } } : {},
    orderBy: { date: "desc" },
    take: 50,
  });

  // Match sessions to this client using cascade matching
  const enriched = await enrichClient(client);
  const postMatcher: EnrichedClientMatcher = {
    clientId: client.id,
    name: client.name ?? "",
    titleTerms: extractTitleTerms(client.name ?? ""),
    enriched,
  };
  const matchedSessions = recentSessions.filter((s) =>
    sessionMatchesClient(s as unknown as { title: string; participants: string[] }, postMatcher)
  );

  if (matchedSessions.length === 0) {
    return NextResponse.json({ error: "No hay sesiones nuevas por procesar", cards: [] });
  }

  // Take latest 5
  const sessionsToProcess = matchedSessions.slice(0, 5);

  // Get canvas cards for context
  const canvasCards = await prisma.clientContextCard.findMany({
    where: { projectId, canvasSection: { not: null } },
    select: { title: true, content: true, canvasSection: true },
    orderBy: { canvasOrder: "asc" },
  });

  const clientCanvas = (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS;

  const canvasContext = canvasCards.length > 0
    ? canvasCards.map((c) => `[${c.canvasSection}] ${c.title}: ${c.content.slice(0, 300)}`).join("\n")
    : "(Canvas vacío)";

  const sessionsText = sessionsToProcess.map((s) => {
    const date = s.date?.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) ?? "";
    const content = s.transcript || (typeof s.summary === "string" ? s.summary : JSON.stringify(s.summary)) || "(Sin transcripción)";
    return `=== SESIÓN: ${s.title} (${date}) ===\n${String(content).slice(0, 8000)}`;
  }).join("\n\n");

  const systemPrompt = agent.additionalInstructions
    ? `${agent.systemPrompt}\n\n${agent.additionalInstructions}`
    : agent.systemPrompt;

  const userMessage = `Empresa: ${client.name ?? ""}
Tipo de servicio: ${project.serviceType ?? "No especificado"}

=== CANVAS DE PROYECTO (información ya validada — NO repetir) ===
${canvasContext}

=== CANVAS DE EMPRESA ===
${JSON.stringify(clientCanvas, null, 2)}

=== SESIONES POR PROCESAR (${sessionsToProcess.length}) ===
${sessionsText}

Procesa las sesiones y genera los cards correspondientes. Solo incluye cards que tengan contenido relevante.`;

  // Create AgentRun
  const run = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      clientId,
      projectId,
      status: "RUNNING",
      stepLabel: `Sesión: ${sessionsToProcess[0].title}`,
      serviceType: project.serviceType,
    },
  });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: text } });
      return NextResponse.json({ error: "Invalid agent response" }, { status: 500 });
    }

    let result: {
      cards?: Array<{ title: string; content: string }>;
      session_title?: string;
    };

    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: text } });
      return NextResponse.json({ error: "Invalid JSON response" }, { status: 500 });
    }

    const validCards = (result.cards ?? []).filter((c) => c.title?.trim() && c.content?.trim());

    if (validCards.length > 0) {
      await prisma.clientContextCard.createMany({
        data: validCards.map((card, i) => ({
          clientId,
          projectId,
          agentRunId: run.id,
          title: card.title.trim(),
          content: card.content,
          order: i,
          source: "AGENT" as const,
          cardType: "TEXT" as const,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify(result) },
    });

    const savedCards = await prisma.clientContextCard.findMany({
      where: { agentRunId: run.id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      ok: true,
      cards: savedCards,
      sessionsProcessed: sessionsToProcess.length,
      sessionTitle: result.session_title ?? sessionsToProcess[0].title,
      run: { id: run.id, createdAt: run.createdAt },
    });
  } catch (e) {
    console.error("[process-session] Error:", e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR" } });
    return NextResponse.json({ error: "Error al procesar sesión" }, { status: 500 });
  }
}

// GET: check if there are unprocessed sessions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const client = await prisma.client.findUnique({
    where: { id: project.clientId },
    select: {
      id: true, name: true, company: true, hubspotCompanyId: true,
      hubspotAccount: { select: { id: true } },
    },
  });
  if (!client) {
    return NextResponse.json({ unprocessed: 0, lastProcessed: null });
  }

  const agent = await prisma.agent.findFirst({
    where: { agentType: "SESSION_PROCESSOR", status: "ACTIVE" },
    select: { id: true },
  });

  const lastRun = agent ? await prisma.agentRun.findFirst({
    where: { agentId: agent.id, projectId, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  }) : null;

  // Get recent sessions and match to client
  const recentSessions = await prisma.firefliesSession.findMany({
    where: lastRun ? { date: { gt: lastRun.createdAt } } : {},
    orderBy: { date: "desc" },
    take: 50,
    select: { title: true, participants: true },
  });

  let unprocessed = 0;
  try {
    const enriched = await enrichClient(client);
    const matcher: EnrichedClientMatcher = {
      clientId: client.id,
      name: client.name ?? "",
      titleTerms: extractTitleTerms(client.name ?? ""),
      enriched,
    };
    unprocessed = recentSessions.filter((s) =>
      sessionMatchesClient(s as unknown as { title: string; participants: string[] }, matcher)
    ).length;
  } catch {
    // If matching fails, return 0
  }

  return NextResponse.json({
    unprocessed,
    lastProcessed: lastRun?.createdAt?.toISOString() ?? null,
  });
}
