/**
 * lib/business-cases/agent.ts — agente generador de Business Cases.
 *
 * Recibe transcripts crudos y produce un array de bloques estructurados (DRAFT).
 * Sin tool-use (como el resto de los agentes de Nexus): emite JSON que se parsea
 * y valida acá. Nunca inventa datos: lo que no tiene contexto va con
 * needsValidation:true. PARTNER/CTA se fuerzan al contenido fijo de marca.
 */
import { anthropic } from "@/lib/anthropic";
import type { BusinessCaseBlockType } from "@prisma/client";
import { BLOCK_CONTENT_SCHEMAS, FIXED_BLOCKS, type GeneratedBlock } from "./schema";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;

const SYSTEM_PROMPT = `Sos un consultor de Smarteam (Elite HubSpot Partner en LATAM) que arma un Business Case (caso de negocio) para un prospecto, a partir de transcripts de reuniones comerciales.

Tu tarea: leer el/los transcript(s) y producir un ARRAY JSON de bloques ordenados que componen el caso de negocio.

Reglas estrictas:
- Devolvé SOLO un array JSON válido. Nada de texto alrededor ni fences de markdown.
- Cada elemento: { "blockType": <tipo>, "content": <objeto según el tipo>, "needsValidation": <bool> }.
- blockType ∈ HERO, PAIN_POINTS, BEFORE_AFTER, SOLUTION, ROI_METRICS, TIMELINE, INVESTMENT, PARTNER, CTA.
- Incluí SIEMPRE HERO, PARTNER y CTA.
- Incluí PAIN_POINTS, BEFORE_AFTER, SOLUTION y TIMELINE si el transcript da contexto suficiente.
- ROI_METRICS e INVESTMENT: SOLO si hay datos concretos (métricas, precios). Si no hay, omitilos o incluilos con needsValidation:true y placeholders explícitos como "[validar con el cliente]". NUNCA inventes números.
- NO inventes datos que no estén en el transcript. Si te falta contexto para un bloque, marcá needsValidation:true.
- Ordená en: HERO, PAIN_POINTS, BEFORE_AFTER, SOLUTION, ROI_METRICS, TIMELINE, INVESTMENT, PARTNER, CTA.
- Tuteá. Tono profesional, claro, orientado a valor de negocio.

Identificá del transcript: nombre del cliente, industria, hubs de HubSpot discutidos, sistemas existentes (ERP/CRM/herramientas), dolores explícitos, métricas (equipo, volumen, tiempos de proceso) y precio si se mencionó.

Schema de "content" por blockType:
- HERO: { "headline": string, "subhead"?: string, "tags": string[] }
- PAIN_POINTS: { "items": [{ "title": string, "detail": string }] }   // 3 a 6
- BEFORE_AFTER: { "rows": [{ "aspect": string, "before": string, "after": string }] }
- SOLUTION: { "hubs": string[], "integrations": string[], "useCases": [{ "title": string, "detail": string }] }
- ROI_METRICS: { "metrics": [{ "label": string, "value": string, "unit"?: string, "note"?: string }] }
- TIMELINE: { "phases": [{ "name": string, "weeks"?: number, "deliverables": string[] }] }
- INVESTMENT: { "licenses": [{ "name": string, "tier"?: string, "seats"?: number, "price"?: string }], "services": [{ "name": string, "price"?: string }], "total"?: string }
- PARTNER: { "headline": string, "credentials": string[], "badges": string[] }
- CTA: { "headline": string, "buttonLabel": string, "contact"?: string }

PARTNER y CTA podés dejarlos genéricos: el sistema los reemplaza por el contenido oficial de Smarteam.`;

export async function generateBlocks(transcripts: string[]): Promise<GeneratedBlock[]> {
  const joined = transcripts
    .map((t, i) => `--- TRANSCRIPT ${i + 1} ---\n${t}`)
    .join("\n\n");

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Acá están los transcripts de las reuniones:\n\n${joined}\n\nDevolvé el array JSON de bloques del Business Case.`,
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return normalize(parseJsonArray(text));
}

function parseJsonArray(text: string): unknown[] {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr: unknown = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalize(raw: unknown[]): GeneratedBlock[] {
  const out: GeneratedBlock[] = [];
  const seen = new Set<BusinessCaseBlockType>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const bt = (item as { blockType?: unknown }).blockType;
    if (typeof bt !== "string" || !(bt in BLOCK_CONTENT_SCHEMAS)) continue;
    const blockType = bt as BusinessCaseBlockType;
    if (seen.has(blockType)) continue;

    const rawContent = (item as { content?: unknown }).content ?? {};
    const result = BLOCK_CONTENT_SCHEMAS[blockType].safeParse(rawContent);
    const content = (
      result.success ? result.data : rawContent
    ) as Record<string, unknown>;
    const needsValidation =
      Boolean((item as { needsValidation?: unknown }).needsValidation) || !result.success;

    out.push({ blockType, content, needsValidation });
    seen.add(blockType);
  }

  // Garantizar los bloques siempre-presentes.
  for (const bt of ["HERO", "PARTNER", "CTA"] as BusinessCaseBlockType[]) {
    if (!seen.has(bt)) {
      const fixed = FIXED_BLOCKS[bt];
      out.push({
        blockType: bt,
        content: fixed ?? { headline: "" },
        needsValidation: !fixed,
      });
      seen.add(bt);
    }
  }

  // PARTNER/CTA SIEMPRE con el contenido fijo de marca (consistencia).
  for (const bt of ["PARTNER", "CTA"] as BusinessCaseBlockType[]) {
    const fixed = FIXED_BLOCKS[bt];
    if (!fixed) continue;
    const i = out.findIndex((b) => b.blockType === bt);
    if (i >= 0) out[i] = { blockType: bt, content: fixed, needsValidation: false };
  }

  return out;
}
