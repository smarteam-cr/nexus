import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

type Params = { params: Promise<{ id: string; runId: string }> };

export const GET = withAuth(async (_req: NextRequest, { params }: Params) => {
  const { id: clientId, runId } = await params;

  const run = await prisma.agentRun.findFirst({
    where: { id: runId, clientId },
    select: {
      id: true, status: true, createdAt: true, stepLabel: true, serviceType: true, output: true,
      agent: { select: { name: true, outputType: true } },
      cards: { orderBy: { order: "asc" }, select: { id: true, title: true, content: true, order: true, source: true } },
    },
  });

  if (!run) return apiError("not_found", 404);

  const outputType = run.agent?.outputType ?? "CARDS";

  // ── FLOWCHART: leer desde output JSON ────────────────────────────────────────
  if (outputType === "FLOWCHART") {
    let flowchart = null;
    try {
      flowchart = JSON.parse(run.output ?? "{}");
    } catch { /* malformado */ }
    return NextResponse.json({
      id: run.id, status: run.status, createdAt: run.createdAt,
      stepLabel: run.stepLabel, serviceType: run.serviceType,
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
      stepLabel: run.stepLabel, serviceType: run.serviceType,
      agentName: run.agent?.name ?? null, outputType,
      cards: run.cards,
      flowcharts,
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
    stepLabel: run.stepLabel, serviceType: run.serviceType,
    agentName: run.agent?.name ?? null, outputType,
    cards,
  });
});

// PATCH /api/clients/:id/analyze/:runId  →  archivar ejecución
export const PATCH = withAuth(async (_req: NextRequest, { params }: Params) => {
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
export const PUT = withAuth(async (req: NextRequest, { params }: Params) => {
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
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await prisma.agentRun.update({ where: { id: runId }, data: { output: newOutput } });
  return NextResponse.json({ ok: true });
});
