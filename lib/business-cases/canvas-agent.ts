/**
 * lib/business-cases/canvas-agent.ts
 *
 * Generación del Business Case sobre el sistema de CANVAS: el agente recibe el
 * contexto (transcripts + sesiones + notas) y produce MARKDOWN por sección del
 * BUSINESS_CASE_CANVAS. Cada sección se persiste como un bloque TEXT (DRAFT) →
 * se reusa el modelo CanvasSection/CanvasBlock y el render de markdown. Nunca
 * inventa datos: usa placeholders explícitos.
 */
import { anthropic } from "@/lib/anthropic";
import { BUSINESS_CASE_CANVAS } from "@/lib/canvas/canvas-defs";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;

export type GeneratedSection = { key: string; markdown: string };

const SECTION_GUIDE = `- hero: titular de transformación + 1-2 líneas de contexto del cliente y su industria.
- dolores: 3 a 6 dolores/retos concretos extraídos del transcript (viñetas).
- antes_despues: una tabla markdown de 2 columnas con encabezados "Hoy" y "Con HubSpot".
- solucion: hubs de HubSpot propuestos, integraciones y casos de uso (viñetas/subtítulos).
- roi: métricas de impacto SOLO si hay datos concretos; si no, "[validar con el cliente]".
- cronograma: fases de implementación con semanas estimadas (lista o tabla).
- inversion: licencias de HubSpot + servicios de Smarteam; precios SOLO si se mencionaron, si no "[a cotizar]".
- partner: por qué Smarteam — Elite HubSpot Partner en LATAM, equipo certificado, implementaciones/migraciones en la región.
- cta: próximos pasos concretos + invitación a agendar una conversación.`;

const SYSTEM_PROMPT = `Sos un consultor de Smarteam (Elite HubSpot Partner en LATAM) que arma un Business Case (caso de negocio) para un prospecto, a partir de transcripts de reuniones comerciales y notas.

Devolvé SOLO un objeto JSON válido, sin texto alrededor ni fences de markdown, con esta forma:
  { "<sectionKey>": "<contenido en markdown>" , ... }

Las secciones (sectionKey) y qué va en cada una:
${SECTION_GUIDE}

Reglas estrictas:
- Usá markdown en los valores: ## subtítulos, **negritas**, - viñetas, y tablas markdown donde aplique.
- NO inventes datos que no estén en el contexto. Si te falta info para una sección, usá placeholders explícitos entre corchetes (ej. "[validar con el cliente]").
- Incluí SIEMPRE hero, partner y cta. Las demás solo si hay contexto suficiente (si no, omití esa key o dejá un placeholder breve).
- Tono profesional, claro, orientado a valor de negocio. Tuteá.`;

export async function generateCanvasSections(context: string): Promise<GeneratedSection[]> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Contexto (transcripts, sesiones y notas):\n\n${context}\n\nDevolvé el objeto JSON con el markdown por sección.`,
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const obj = parseObject(text);

  return BUSINESS_CASE_CANVAS.sections
    .map((s) => ({ key: s.key, markdown: typeof obj[s.key] === "string" ? (obj[s.key] as string).trim() : "" }))
    .filter((s) => s.markdown.length > 0);
}

/** Regenera el markdown de UN bloque/sección según una instrucción (edición por IA). */
export async function regenerateSectionMarkdown(
  current: string,
  instruction: string,
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system:
      "Editás una sección (en markdown) de un Business Case de Smarteam. Devolvé SOLO el nuevo markdown de la sección, sin texto alrededor ni fences. No inventes datos que no estén en el contenido actual o la instrucción.",
    messages: [
      {
        role: "user",
        content: `Contenido actual (markdown):\n${current}\n\nInstrucción: ${instruction}\n\nDevolvé el nuevo markdown.`,
      },
    ],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  // Quitar fences si el modelo los puso.
  const fence = text.match(/```(?:markdown)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}

function parseObject(text: string): Record<string, unknown> {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return {};
  try {
    const o: unknown = JSON.parse(s.slice(start, end + 1));
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
