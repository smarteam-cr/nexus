import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withClientAccess, apiError } from "@/lib/api";
import { parseRunError } from "@/lib/agents/run-error";

type Params = { params: Promise<{ id: string; runId: string }> };

export const GET = withClientAccess(async (_req: NextRequest, { params }: Params) => {
  const { id: clientId, runId } = await params;

  const run = await prisma.agentRun.findFirst({
    where: { id: runId, clientId },
    select: {
      id: true, status: true, createdAt: true, stepLabel: true, serviceType: true, output: true,
      currentPhase: true,
      agent: { select: { name: true, outputType: true } },
      cards: { orderBy: { order: "asc" }, select: { id: true, title: true, content: true, order: true, source: true, cardType: true, diagramData: true, chartConfig: true } },
    },
  });

  if (!run) return apiError("not_found", 404);

  // El run falló → exponer la razón real (markError la guardó humanizada en output).
  // El polling la lee y el frontend la muestra en vez de "el agente falló".
  if (run.status === "ERROR") {
    return NextResponse.json({
      id: run.id, status: run.status, createdAt: run.createdAt,
      agentName: run.agent?.name ?? null, error: parseRunError(run.output),
    });
  }

  const outputType = run.agent?.outputType ?? "CARDS";

  // ── FLOWCHART: leer desde output JSON ────────────────────────────────────────
  if (outputType === "FLOWCHART") {
    let flowchart = null;
    try {
      flowchart = JSON.parse(run.output ?? "{}");
    } catch { /* malformado */ }
    return NextResponse.json({
      id: run.id, status: run.status, createdAt: run.createdAt,
      stepLabel: run.stepLabel, serviceType: run.serviceType, currentPhase: run.currentPhase,
      agentName: run.agent?.name ?? null, outputType,
      flowchart,
    });
  }

  // ── CARDS_AND_FLOWCHARTS: cards desde DB + flowcharts desde output ────────────
  if (outputType === "CARDS_AND_FLOWCHARTS") {
    let flowcharts: unknown[] = [];
    try {
      const parsed = JSON.parse(run.output ?? "{}");
      flowcharts = parsed.flowcharts ?? [];
    } catch { /* malformado */ }
    return NextResponse.json({
      id: run.id, status: run.status, createdAt: run.createdAt,
      stepLabel: run.stepLabel, serviceType: run.serviceType, currentPhase: run.currentPhase,
      agentName: run.agent?.name ?? null, outputType,
      cards: run.cards,
      flowcharts,
    });
  }

  // ── CARDS_AND_CHARTS: cards TEXT + cards CHART (chartConfig) desde DB ─────────
  if (outputType === "CARDS_AND_CHARTS") {
    return NextResponse.json({
      id: run.id, status: run.status, createdAt: run.createdAt,
      stepLabel: run.stepLabel, serviceType: run.serviceType, currentPhase: run.currentPhase,
      agentName: run.agent?.name ?? null, outputType,
      cards: run.cards, // incluye cardType TEXT y CHART (con chartConfig)
    });
  }

  // ── CARDS: leer desde ClientContextCard o fallback a output ──────────────────
  let cards = run.cards;
  if (cards.length === 0) {
    try {
      const parsed = JSON.parse(run.output ?? "{}");
      cards = (parsed.cards ?? []).map((c: { title: string; content: string }, i: number) => ({
        id: `legacy-${i}`, title: c.title, content: c.content, order: i, source: "AGENT" as const,
      }));
    } catch { /* output malformado */ }
  }

  return NextResponse.json({
    id: run.id, status: run.status, createdAt: run.createdAt,
    stepLabel: run.stepLabel, serviceType: run.serviceType, currentPhase: run.currentPhase,
    agentName: run.agent?.name ?? null, outputType,
    cards,
  });
});

// PATCH /api/clients/:id/analyze/:runId  →  archivar ejecución
export const PATCH = withClientAccess(async (_req: NextRequest, { params }: Params) => {
  const { id: clientId, runId } = await params;

  const run = await prisma.agentRun.findFirst({ where: { id: runId, clientId } });
  if (!run) return apiError("not_found", 404);

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ ok: true });
});

// PUT /api/clients/:id/analyze/:runId  →  guardar flowcharts editados
export const PUT = withClientAccess(async (req: NextRequest, { params }: Params) => {
  const { id: clientId, runId } = await params;

  const run = await prisma.agentRun.findFirst({
    where: { id: runId, clientId },
    select: { output: true, agent: { select: { outputType: true } } },
  });
  if (!run) return apiError("not_found", 404);

  const body = await req.json();
  const outputType = run.agent?.outputType ?? "CARDS";

  let newOutput: string;
  if (outputType === "CARDS_AND_FLOWCHARTS" && body.flowcharts) {
    let current: Record<string, unknown> = {};
    try { current = JSON.parse(run.output ?? "{}"); } catch { /* malformado */ }
    current.flowcharts = body.flowcharts;
    newOutput = JSON.stringify(current);
  } else if (outputType === "FLOWCHART" && body.flowchart) {
    newOutput = JSON.stringify(body.flowchart);
  } else {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  await prisma.agentRun.update({ where: { id: runId }, data: { output: newOutput } });
  return NextResponse.json({ ok: true });
});
