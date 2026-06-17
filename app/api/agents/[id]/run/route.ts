import { withAuth } from "@/lib/api";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

// Etiquetas de los pasos (para dar contexto al agente)
const STEP_LABELS: Record<string, Record<number, string>> = {
  "1": {
    1: "Análisis inicial",
    2: "Kickoff — Alinear solicitudes",
    3: "Auditoría de HubSpot",
    4: "Entrevistas y Focus Groups",
    5: "Análisis del funnel",
    6: "Mapeo de proceso, rutina y estructura",
    7: "Disponibilidad de datos",
    8: "Informe de diagnóstico",
  },
  "2": {
    1: "Rediseño del proceso (Inbound)",
    2: "Rediseño de la rutina (Loop)",
    3: "Políticas y conceptos del Loop",
    4: "Plan y cronograma del piloto",
    5: "Habilitar CRM",
    6: "Entrenar al grupo piloto",
  },
};

export const POST = withAuth(async (
  request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: agentId } = await params;
  const body = await request.json();
  const { clientId, stage, step } = body as {
    clientId: string;
    stage?: number;
    step?: number;
  };

  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // Acceso a nivel cliente: un CSE solo corre agentes en clientes que puede ver.
  const access = await guardAccessToClient(clientId);
  if (access instanceof NextResponse) return access;

  // Cargar agente y cliente en paralelo
  const [agent, client] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId } }),
    prisma.client.findUnique({ where: { id: clientId } }),
  ]);

  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  if (agent.status !== "ACTIVE") {
    return NextResponse.json({ error: "El agente no está activo" }, { status: 400 });
  }

  // Cargar en paralelo: nota del paso, documentos del paso, documentos globales, context cards
  let stageNoteContent = "";
  let stepDocuments: Array<{ title: string; content: string | null; url: string | null }> = [];
  let globalDocuments: Array<{ title: string; content: string | null; url: string | null }> = [];
  let contextCards: Array<{ title: string; content: string }> = [];

  const [contextCardsResult, globalDocsResult] = await Promise.all([
    prisma.clientContextCard.findMany({
      where: { clientId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { title: true, content: true },
    }),
    prisma.clientDocument.findMany({
      where: { clientId, stage: null },
      select: { title: true, content: true, url: true },
    }),
  ]);

  contextCards = contextCardsResult.filter((c) => c.content.trim());
  globalDocuments = globalDocsResult;

  if (stage && step) {
    const [stageNote, docs] = await Promise.all([
      prisma.stageNote.findUnique({
        where: { clientId_stage_step: { clientId, stage, step } },
        select: { content: true },
      }),
      prisma.clientDocument.findMany({
        where: { clientId, stage, step },
        select: { title: true, content: true, url: true },
      }),
    ]);
    stageNoteContent = stageNote?.content ?? "";
    stepDocuments = docs;
  }

  // Construir el mensaje del usuario con contexto del cliente y paso
  const stepLabel =
    stage && step
      ? STEP_LABELS[String(stage)]?.[step] ?? `Etapa ${stage}, Paso ${step}`
      : null;

  const allDocuments = [...globalDocuments, ...stepDocuments];

  const contextLines: string[] = [
    `Cliente: ${client.name}`,
    client.company ? `Empresa: ${client.company}` : null,
    client.industry ? `Industria: ${client.industry}` : null,
    client.notes ? `\nNotas del cliente:\n${client.notes}` : null,
    contextCards.length > 0
      ? `\n## Contexto del cliente\n${contextCards
          .map((c) => `### ${c.title}\n${c.content}`)
          .join("\n\n")}`
      : null,
    stepLabel ? `\n## Contexto actual: Etapa ${stage} — ${stepLabel}` : null,
    stageNoteContent
      ? `\nNota existente en este paso:\n${stageNoteContent}`
      : "\nNota existente en este paso: (vacío)",
    allDocuments.length > 0
      ? `\n## Documentos adjuntos:\n${allDocuments
          .map(
            (d) =>
              `- ${d.title}: ${d.content ? d.content.slice(0, 500) : d.url ?? ""}`
          )
          .join("\n")}`
      : null,
  ].filter(Boolean) as string[];

  const userMessage = contextLines.join("\n");

  // Construir system prompt completo del agente
  const systemPrompt = [
    agent.systemPrompt,
    agent.additionalInstructions ? `\n\n${agent.additionalInstructions}` : "",
  ]
    .join("")
    .trim();

  // Crear AgentRun en BD
  const run = await prisma.agentRun.create({
    data: {
      agentId,
      clientId,
      stage: stage ?? null,
      step: step ?? null,
      status: "RUNNING",
    },
  });

  // Stream de respuesta
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";

      try {
        const claudeStream = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const chunk of claudeStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            fullText += chunk.delta.text;
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }

        // Guardar output y marcar como DONE
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: "DONE", output: fullText },
        });
      } catch (err) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: "ERROR" },
        });
        controller.enqueue(
          encoder.encode(`\n\n[Error: ${err instanceof Error ? err.message : "Error desconocido"}]`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Agent-Run-Id": run.id,
    },
  });
});
