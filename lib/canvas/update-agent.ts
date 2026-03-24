import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { EMPTY_CLIENT_CANVAS, EMPTY_PROJECT_CANVAS } from "./template";
import type { ClientCanvas, ProjectCanvas } from "./template";
import { deepMergeCanvas, validateCanvasKeys } from "./merge";

function repairTruncatedJson(s: string): string | null {
  let inStr = false, esc = false, depth = 0, arrDepth = 0;
  for (const ch of s) {
    if (esc)              { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true;  continue; }
    if (ch === '"')       { inStr = !inStr;  continue; }
    if (inStr)            continue;
    if      (ch === "{")  depth++;
    else if (ch === "}")  depth--;
    else if (ch === "[")  arrDepth++;
    else if (ch === "]")  arrDepth--;
  }
  if (depth <= 0 && arrDepth <= 0 && !inStr) return null;
  return s + (inStr ? '"' : "") + "]".repeat(Math.max(0, arrDepth)) + "}".repeat(Math.max(0, depth));
}

/**
 * Agente dedicado post-ejecución que actualiza los canvas usando Haiku.
 * Lee los prompts de los agentes CANVAS_PROJECT y CANVAS_CLIENT de la BD.
 * Se ejecuta en background (fire-and-forget) después de cada agente de sección.
 *
 * - Project Canvas: merge directo
 * - Client Canvas: crea sugerencias para aprobación del CSE
 */
export async function updateCanvasAsync(
  clientId: string,
  projectId: string,
  agentRunId: string,
  cards: { title: string; content: string }[]
) {
  // Cargar canvas actuales + agentes de canvas de la BD
  const [client, project, canvasAgents] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { canvas: true, name: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { canvas: true } }),
    prisma.agent.findMany({
      where: { agentType: { in: ["CANVAS_PROJECT", "CANVAS_CLIENT"] }, status: "ACTIVE" },
      select: { agentType: true, systemPrompt: true, additionalInstructions: true },
    }),
  ]);

  if (!client || !project) return;

  const projectAgent = canvasAgents.find((a) => a.agentType === "CANVAS_PROJECT");
  const clientAgent = canvasAgents.find((a) => a.agentType === "CANVAS_CLIENT");

  const clientCanvas = (client.canvas as ClientCanvas | null) ?? EMPTY_CLIENT_CANVAS;
  const projectCanvas = (project.canvas as ProjectCanvas | null) ?? EMPTY_PROJECT_CANVAS;

  const cardsText = cards
    .map((c) => `**${c.title}:**\n${c.content}`)
    .join("\n\n");

  // Construir system prompt combinando los prompts de ambos agentes de la BD
  const projectPromptPart = projectAgent
    ? `${projectAgent.systemPrompt}${projectAgent.additionalInstructions ? "\n\n" + projectAgent.additionalInstructions : ""}`
    : `Extrae información para actualizar el canvas de proyecto con secciones: procesos, dolores_oportunidades, diagnostico, plan, ejecucion.`;

  const clientPromptPart = clientAgent
    ? `${clientAgent.systemPrompt}${clientAgent.additionalInstructions ? "\n\n" + clientAgent.additionalInstructions : ""}`
    : `Extrae información para sugerir actualizaciones al canvas de empresa con secciones: perfil, stakeholders, madurez, herramientas, contexto_comercial.`;

  const systemPrompt = `Tu tarea: analiza las cards y extrae información relevante para actualizar DOS canvas.

=== AGENTE DE CANVAS DE PROYECTO ===
${projectPromptPart}

Estructura actual del canvas de proyecto:
${JSON.stringify(EMPTY_PROJECT_CANVAS, null, 2)}

=== AGENTE DE CANVAS DE EMPRESA ===
${clientPromptPart}

Estructura actual del canvas de empresa:
${JSON.stringify(EMPTY_CLIENT_CANVAS, null, 2)}

REGLAS GLOBALES:
- Solo incluye secciones donde las cards tienen información CONCRETA y nueva.
- Para arrays, devuelve el array COMPLETO (no parcial).
- Si el canvas ya tiene contenido, ENRIQUÉCELO, no lo reemplaces con menos info.
- NO inventes información que no esté en las cards.
- Si no hay info relevante para una sección, NO la incluyas.

Responde SOLO con JSON válido:
{
  "project_canvas_updates": { ... },
  "client_canvas_suggestions": { ... }
}`;

  const userMessage = `=== CANVAS ACTUAL DE EMPRESA ===
${JSON.stringify(clientCanvas, null, 2)}

=== CANVAS ACTUAL DE PROYECTO ===
${JSON.stringify(projectCanvas, null, 2)}

=== CARDS GENERADAS POR EL AGENTE ===
${cardsText}

Extrae la información relevante de las cards para actualizar ambos canvas.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
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
    if (!jsonMatch) return;

    let result: {
      project_canvas_updates?: Partial<ProjectCanvas>;
      client_canvas_suggestions?: Partial<ClientCanvas>;
    };

    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      // Intentar reparar JSON truncado
      const repaired = repairTruncatedJson(jsonMatch[0]);
      if (!repaired) return;
      try {
        result = JSON.parse(repaired);
      } catch {
        console.error("[canvas-update-agent] JSON irreparable");
        return;
      }
    }

    // Project canvas: merge directo
    if (result.project_canvas_updates && Object.keys(result.project_canvas_updates).length > 0) {
      const validated = validateCanvasKeys(EMPTY_PROJECT_CANVAS, result.project_canvas_updates as Record<string, unknown>);
      if (Object.keys(validated).length > 0) {
        const merged = deepMergeCanvas(projectCanvas, validated);
        await prisma.project.update({
          where: { id: projectId },
          data: { canvas: merged as object },
        });
      }
    }

    // Client canvas: crear sugerencias para aprobación
    if (result.client_canvas_suggestions && Object.keys(result.client_canvas_suggestions).length > 0) {
      const validated = validateCanvasKeys(EMPTY_CLIENT_CANVAS, result.client_canvas_suggestions as Record<string, unknown>);
      const entries = Object.entries(validated);
      if (entries.length > 0) {
        await prisma.canvasSuggestion.createMany({
          data: entries.map(([section, suggested]) => ({
            clientId,
            agentRunId,
            section,
            current: (clientCanvas as Record<string, unknown>)[section] ?? null,
            suggested: suggested as object,
          })),
        });
      }
    }
  } catch (e) {
    console.error("[canvas-update-agent] Haiku error:", e);
  }
}
