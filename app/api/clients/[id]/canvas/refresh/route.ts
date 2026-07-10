import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { EMPTY_CLIENT_CANVAS } from "@/lib/canvas/template";
import type { ClientCanvas } from "@/lib/canvas/template";
import { validateCanvasKeys } from "@/lib/canvas/merge";

/**
 * POST /api/clients/{id}/canvas/refresh
 * Recopila AgentRuns recientes + Fireflies y genera sugerencias para el canvas de empresa.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Recopilar contexto — primero el cliente para usar su nombre en filtros
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { canvas: true, name: true, company: true },
  });

  // Tokens del nombre del cliente para filtrar sesiones (≥3 chars)
  const clientTokens = (client?.name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const [recentRuns, recentCards, allRecentSessions] = await Promise.all([
    // AgentRuns recientes con sus cards
    prisma.agentRun.findMany({
      where: {
        clientId,
        status: "DONE",
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        stepLabel: true,
        createdAt: true,
        agent: { select: { name: true } },
        cards: {
          select: { title: true, content: true },
          orderBy: { order: "asc" },
        },
      },
    }),

    // Cards sin agentRun (manuales)
    prisma.clientContextCard.findMany({
      where: { clientId, agentRunId: null, source: "HUMAN" },
      select: { title: true, content: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    // Sesiones (Fireflies + Meet) recientes enriquecidas
    prisma.firefliesSession.findMany({
      where: {
        date: { gte: thirtyDaysAgo },
        enrichedAt: { not: null },
      },
      select: { title: true, summary: true, date: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  // Filtrar sesiones por nombre del cliente en el título
  const sessions =
    clientTokens.length > 0
      ? allRecentSessions.filter((s) => {
          const t = s.title.toLowerCase();
          return clientTokens.some((tok) => t.includes(tok));
        })
      : allRecentSessions.slice(0, 10);

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const clientCanvas = (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS;

  // Construir contexto para el agente
  const runContextParts: string[] = [];
  for (const run of recentRuns) {
    const date = run.createdAt.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const agentName = run.agent?.name ?? "Agente";
    runContextParts.push(`--- ${agentName} (${date}) ---`);
    for (const card of run.cards) {
      runContextParts.push(`**${card.title}:** ${card.content.slice(0, 400)}`);
    }
  }

  const sessionParts: string[] = [];
  for (const s of sessions) {
    const date = s.date?.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) ?? "";
    // summary es Json (string u objeto según la fuente) — normalizar a texto.
    const summaryText = typeof s.summary === "string" ? s.summary : s.summary != null ? JSON.stringify(s.summary) : "";
    sessionParts.push(`--- ${s.title} (${date}) ---\n${summaryText.slice(0, 500)}`);
  }

  const manualParts = recentCards.map((c) => `**${c.title}:** ${c.content.slice(0, 300)}`);

  // Cargar agente de canvas de empresa desde BD
  const canvasAgent = await prisma.agent.findFirst({
    where: { agentType: "CANVAS_CLIENT", status: "ACTIVE" },
    select: { systemPrompt: true, additionalInstructions: true },
  });

  const basePrompt = canvasAgent
    ? `${canvasAgent.systemPrompt}${canvasAgent.additionalInstructions ? "\n\n" + canvasAgent.additionalInstructions : ""}`
    : "Extrae información relevante para el canvas de empresa.";

  const systemPrompt = `${basePrompt}

Tu tarea: analiza las ejecuciones recientes de agentes, transcripciones de sesiones y cards manuales del cliente para SUGERIR actualizaciones al canvas de empresa.

Canvas actual de empresa:
${JSON.stringify(clientCanvas, null, 2)}

Estructura esperada del canvas (referencia):
${JSON.stringify(EMPTY_CLIENT_CANVAS, null, 2)}

SECCIONES DISPONIBLES:
- perfil: industria, modelo_negocio, tamano
- stakeholders: array de { nombre, rol, notas }
- madurez: { marketing, ventas, servicio } (texto descriptivo)
- herramientas: array de strings
- contexto_comercial: { canal_adquisicion, relacion_previa, motivacion_compra }
- retos_estrategicos: array de { descripcion, estado: "validado"|"por_validar", fuente }
- escala_rendimiento: { general: 0-4, por_hub: { marketing, sales, service }, objetivo: 0-4 }
- oportunidades_futuras: array de { descripcion, hub, escala_nivel: 0-4, estado: "identificada"|"propuesta"|"aceptada"|"descartada" }

REGLAS:
1. Solo sugiere cuando hay información CONCRETA y NUEVA que no está en el canvas actual
2. Para arrays, devuelve SOLO los items NUEVOS (no todo el array)
3. Para objetos, devuelve SOLO los campos que cambiaron
4. Para retos_estrategicos: marca como "por_validar" y en fuente pon de dónde viene
5. Para oportunidades_futuras: marca como "identificada" si es nueva
6. Para escala_rendimiento: solo sugiere si hay evidencia clara para cambiar un nivel
7. NO inventes información
8. Incluye en "source_label" una descripción legible de la fuente (ej: "Análisis inicial · 24 mar")
9. ESTILO: todo texto en TUTEO neutro ("tú"), nunca voseo ("tenés", "querés", "Transformá")

Responde SOLO con JSON válido. Cada sugerencia es un objeto con:
{
  "suggestions": [
    {
      "section": "stakeholders",
      "suggested": { "nombre": "...", "rol": "...", "notas": "..." },
      "source_label": "Preparación kickoff · 24 mar"
    },
    {
      "section": "retos_estrategicos",
      "suggested": { "descripcion": "...", "estado": "por_validar", "fuente": "Entrevista gerencia" },
      "source_label": "Sesión: Kickoff UCI · 20 feb"
    }
  ]
}`;

  const userMessage = `=== EJECUCIONES RECIENTES DE AGENTES ===
${runContextParts.join("\n\n") || "(Sin ejecuciones recientes)"}

${sessionParts.length > 0 ? `=== SESIONES DE FIREFLIES (últimos 30 días) ===\n${sessionParts.join("\n\n")}` : ""}

${manualParts.length > 0 ? `=== CARDS MANUALES DEL CSE ===\n${manualParts.join("\n\n")}` : ""}

Analiza toda la información y genera sugerencias para el canvas de empresa. Solo sugiere lo que sea NUEVO respecto al canvas actual.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // (b.type === "text" narrowea al TextBlock del SDK — un predicate custom con
    // shape propio deja de compilar cuando el SDK agrega campos requeridos.)
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: true, suggestions: 0, message: "Sin novedades detectadas" });
    }

    let result: {
      suggestions?: Array<{
        section: string;
        suggested: unknown;
        source_label?: string;
      }>;
    };

    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Respuesta del agente no válida" }, { status: 500 });
    }

    const suggestions = result.suggestions ?? [];
    if (suggestions.length === 0) {
      return NextResponse.json({ ok: true, suggestions: 0, message: "Sin novedades detectadas" });
    }

    // Validar que las secciones existen
    const validSections = Object.keys(EMPTY_CLIENT_CANVAS);

    const validSuggestions = suggestions.filter((s) => validSections.includes(s.section));

    if (validSuggestions.length > 0) {
      await prisma.canvasSuggestion.createMany({
        data: validSuggestions.map((s) => {
          const cur = (clientCanvas as unknown as Record<string, unknown>)[s.section];
          return {
            clientId,
            section: s.section,
            // Json nullable: null explícito requiere el sentinel de Prisma.
            current: cur == null ? Prisma.JsonNull : (cur as Prisma.InputJsonValue),
            suggested: s.suggested as Prisma.InputJsonValue,
            source: "refresh",
            sourceLabel: s.source_label ?? "Actualización con IA",
            status: "pending",
          };
        }),
      });
    }

    return NextResponse.json({ ok: true, suggestions: validSuggestions.length });
  } catch (e) {
    console.error("[client-canvas-refresh] Error:", e);
    return NextResponse.json({ error: "Error al ejecutar el agente" }, { status: 500 });
  }
}
