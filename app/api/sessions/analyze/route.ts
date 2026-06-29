/**
 * POST /api/sessions/analyze
 *
 * Hub de análisis contextual (Fase 9).
 * Ejecuta un agente (Sales o Service) sobre las sesiones de un Client filtradas.
 * Persiste el AgentRun + ClientContextCard[] siguiendo el patrón estándar del sistema.
 *
 * Body:
 *   {
 *     clientId: string,
 *     agentSlug: "sales-analysis" | "service-analysis",
 *     filters: { from?, to?, teamRoles?: string[], onlyWithContent?: boolean }
 *   }
 *
 * Respuesta:
 *   { runId: string, status: "DONE" | "ERROR", cardCount: number, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { buildAnalysisContext, type AnalysisFilters } from "@/lib/sessions/analysis-context";

// Slugs estables — mismos del seed scripts/seed-analysis-agents.ts
const AGENT_SLUG_TO_ID: Record<string, string> = {
  "sales-analysis": "agent-sales-analysis",
  "service-analysis": "agent-service-analysis",
};

interface RequestBody {
  clientId?: string;
  agentSlug?: string;
  filters?: AnalysisFilters;
}

export const POST = withAuth(async (req) => {
  // ── Parse body ──
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { clientId, agentSlug, filters = {} } = body;

  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }
  if (!agentSlug || !AGENT_SLUG_TO_ID[agentSlug]) {
    return NextResponse.json(
      { error: `agentSlug inválido. Esperado: ${Object.keys(AGENT_SLUG_TO_ID).join(" | ")}` },
      { status: 400 }
    );
  }

  const agentId = AGENT_SLUG_TO_ID[agentSlug];

  // ── Cargar datos en paralelo ──
  const [client, agent, allSessions, teamMembers] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, company: true, emailDomains: true },
    }),
    prisma.agent.findUnique({ where: { id: agentId } }),
    // Solo las sesiones del CLIENTE (ownership = resolvedClientId/manualClientId).
    // Antes traía TODAS y filtraba en memoria con un matcher de título débil.
    prisma.firefliesSession.findMany({
      where: {
        date: { lt: new Date() },
        OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
      },
      select: {
        id: true, title: true, date: true, participants: true,
        transcript: true, summary: true, manualClientId: true,
      },
    }),
    prisma.teamMember.findMany({
      select: { email: true, area: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado en BD. Correr scripts/seed-analysis-agents.ts" }, { status: 500 });
  }
  if (agent.status !== "ACTIVE") {
    return NextResponse.json({ error: "Agente está inactivo" }, { status: 409 });
  }

  // ── Construir contexto ──
  const ctx = buildAnalysisContext(allSessions, client, teamMembers, filters);

  if (ctx.count === 0) {
    return NextResponse.json(
      { error: "No hay sesiones que matcheen los filtros" },
      { status: 400 }
    );
  }

  // ── Crear AgentRun en RUNNING ──
  const run = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      clientId: client.id,
      status: "RUNNING",
      agentSlug: agentSlug,
      sourceSessionIds: ctx.sessions.map((s) => s.id),
      filters: filters as object,
    },
  });

  // ── Llamar a Claude ──
  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: `${agent.systemPrompt}\n\nESTILO (OBLIGATORIO): español con TUTEO neutro ("tú"): "Transforma", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "tenés", "querés", "podés" ni "vos".`,
      messages: [{ role: "user", content: ctx.userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    const errMsg = (e as Error).message ?? "Error desconocido";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "ERROR", output: errMsg },
    });
    const status = errMsg.includes("credit") || errMsg.includes("billing") ? 402 : 500;
    return NextResponse.json({ runId: run.id, status: "ERROR", error: errMsg }, { status });
  }

  // ── Parsear JSON ──
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "ERROR", output: rawText },
    });
    return NextResponse.json(
      { runId: run.id, status: "ERROR", error: "Respuesta de Claude no contiene JSON válido" },
      { status: 500 }
    );
  }

  let parsed: { cards: { title: string; content: string; canvasSection?: string }[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "ERROR", output: rawText },
    });
    return NextResponse.json(
      { runId: run.id, status: "ERROR", error: "Error al parsear JSON de Claude" },
      { status: 500 }
    );
  }

  if (!parsed?.cards?.length) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "ERROR", output: rawText },
    });
    return NextResponse.json(
      { runId: run.id, status: "ERROR", error: "El análisis no produjo cards" },
      { status: 500 }
    );
  }

  // ── Persistir cards + marcar DONE ──
  await prisma.$transaction([
    prisma.clientContextCard.createMany({
      data: parsed.cards.map((card, idx) => ({
        clientId: client.id,
        agentRunId: run.id,
        title: card.title,
        content: card.content,
        canvasSection: card.canvasSection ?? null,
        source: "AGENT",
        cardType: "TEXT",
        order: idx,
      })),
    }),
    prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: rawText },
    }),
  ]);

  return NextResponse.json({
    runId: run.id,
    status: "DONE",
    cardCount: parsed.cards.length,
    sourceSessionCount: ctx.count,
  });
});
