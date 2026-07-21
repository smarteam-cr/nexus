/**
 * lib/marketing/agents/generate-ideas.ts
 *
 * Agente de generación del módulo Contenido (UNA pasada de Claude):
 * posts de inspiración (últimos 3 meses, cap 60, ordenados por engagement) +
 * insumos de Marketing (ICP, buyer personas, pilares, voz) → hasta 15 ideas de
 * contenido estructuradas + sugerencias de pilares + ideas de campañas.
 *
 * El system prompt vive en DB (Agent id "agent-marketing-contenido", seed:
 * scripts/seed-marketing-module.ts). Parse calcado de lib/business-cases/agent.ts:
 * JSON del primer "{" al último "}" + Zod POR ÍTEM (inválidos se descartan).
 * El agente nunca inventa fuentes: los inspirationPostIds se validan contra los
 * ids realmente enviados.
 */
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { MARKETING_AGENT_ID, ICP_SECTION_META } from "../seed-data";
import { inspirationWindowStart } from "../queries";
import {
  generatedContentIdeaSchema,
  generatedPillarSuggestionSchema,
  generatedCampaignIdeaSchema,
  MARKETING_GEN_DEFAULTS,
  type GeneratedContentIdea,
  type GeneratedPillarSuggestion,
  type GeneratedCampaignIdea,
} from "../schema";

const MAX_POSTS_IN_CONTEXT = 60;
const MAX_POST_CHARS = 1000;
// Techo duro del .slice — red de seguridad del presupuesto de tokens, INDEPENDIENTE
// del objetivo del form. El objetivo real por tanda sale de MarketingSettings
// (genEmpresaTarget + genPersonaTarget); el cap efectivo es min(objetivo, HARD_CAP).
const HARD_CAP = 25;

// ── Input building ─────────────────────────────────────────────────────────────

export async function buildGenerationInput(): Promise<{
  input: string;
  postIds: Set<string>;
  postsInWindow: number;
  empresaTarget: number;
  personaTarget: number;
}> {
  const windowStart = inspirationWindowStart();
  const [posts, icpItems, personas, pillars, settings] = await Promise.all([
    prisma.inspirationPost.findMany({
      where: { postedAt: { gte: windowStart } },
      include: { source: { select: { label: true, profileUrl: true } } },
    }),
    prisma.icpItem.findMany({ orderBy: [{ section: "asc" }, { order: "asc" }] }),
    prisma.buyerPersona.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.contentPillar.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.marketingSettings.findUnique({ where: { id: "marketing" } }),
  ]);

  if (posts.length === 0) {
    throw new Error("NO_POSTS");
  }

  // Mejor engagement primero; cap para mantener el contexto acotado.
  const sorted = [...posts]
    .sort(
      (a, b) =>
        b.likeCount + b.commentCount + b.repostCount - (a.likeCount + a.commentCount + a.repostCount),
    )
    .slice(0, MAX_POSTS_IN_CONTEXT);

  const postLines = sorted.map((p, i) => {
    const label = p.source.label ?? p.source.profileUrl.replace(/^https?:\/\/(www\.)?/, "");
    const num = `P${String(i + 1).padStart(2, "0")}`;
    const fecha = p.postedAt.toISOString().slice(0, 10);
    const text = p.text.length > MAX_POST_CHARS ? `${p.text.slice(0, MAX_POST_CHARS)}…` : p.text;
    return `[${num} | id:${p.id} | fuente: ${label} | ${fecha} | ${p.likeCount} likes · ${p.commentCount} comentarios · ${p.repostCount} reposts | imagen: ${p.hasImage ? "sí" : "no"}]\n${text}`;
  });

  const icpBySection = new Map<string, string[]>();
  for (const item of icpItems) {
    const list = icpBySection.get(item.section) ?? [];
    list.push(item.label);
    icpBySection.set(item.section, list);
  }
  const icpText = [...icpBySection.entries()]
    .map(([section, labels]) => {
      const meta = ICP_SECTION_META[section as keyof typeof ICP_SECTION_META];
      return `${meta?.label ?? section}:\n${labels.map((l) => `- ${l}`).join("\n")}`;
    })
    .join("\n\n");

  const personasText =
    personas.length > 0
      ? personas
          .map(
            (p) =>
              `- ${p.name}${p.role ? ` (${p.role})` : ""}: ${p.description}${p.pains ? ` | Dolores: ${p.pains}` : ""}${p.goals ? ` | Objetivos: ${p.goals}` : ""}`,
          )
          .join("\n")
      : "(sin buyer personas cargadas)";

  const pillarLine = (p: (typeof pillars)[number]) => `- ${p.name}${p.description ? `: ${p.description}` : ""}`;
  const pillarsText =
    pillars.length > 0
      ? pillars.map(pillarLine).join("\n")
      : "(sin pilares cargados — todas las ideas necesitarán pilares nuevos vía pillarSuggestions)";

  // Temas-campaña activos (isCampaign && active): sesgan la generación. La mayoría
  // de las ideas deben servirlos. El listado normal de pilares sigue arriba para que
  // el resto de las ideas pueda cubrir otros temas.
  const campaignPillars = pillars.filter((p) => p.isCampaign);
  const campaignBlock =
    campaignPillars.length > 0
      ? `== CAMPAÑA ACTIVA (PRIORIDAD) ==\nHay ${campaignPillars.length === 1 ? "un tema marcado" : "temas marcados"} como campaña activa. La MAYORÍA de las contentIdeas que generes deben servir a ${campaignPillars.length === 1 ? "este enfoque" : "estos enfoques"}; el resto puede cubrir otros pilares.\n${campaignPillars.map(pillarLine).join("\n")}`
      : null;

  // Objetivo de esta tanda (lo fija el mini-form de /marketing/generacion; el cron hereda
  // los defaults guardados). OBJETIVO, no mínimo: si el modelo no llega con fuerza a esos
  // números, entrega menos y de más calidad (regla del módulo "10 fuertes > 15 flojas").
  const empresaTarget = settings?.genEmpresaTarget ?? MARKETING_GEN_DEFAULTS.empresa;
  const personaTarget = settings?.genPersonaTarget ?? MARKETING_GEN_DEFAULTS.persona;
  const totalTarget = Math.min(empresaTarget + personaTarget, HARD_CAP);
  const targetBlock = `== OBJETIVO DE ESTA TANDA ==\nGenerá aproximadamente ${empresaTarget} pieza(s) EMPRESA (página de la empresa) y ${personaTarget} pieza(s) PERSONA (perfil personal / social selling), ~${totalTarget} en total. Es un OBJETIVO, no un mínimo: si no llegás con fuerza a esos números, entregá MENOS y de más calidad — 10 fuertes valen más que 15 flojas. Respetá el tipo (postType) de cada pieza según lo pedido.`;

  const input = [
    `== VOZ DE MARCA ==\n${settings?.brandVoice ?? ""}`,
    `== ICP (perfil de cliente ideal) ==\n${icpText || "(sin ítems)"}`,
    `== BUYER PERSONAS ==\n${personasText}`,
    `== PILARES DE CONTENIDO EXISTENTES ==\n${pillarsText}`,
    campaignBlock,
    targetBlock,
    `== POSTS DE INSPIRACIÓN (${sorted.length} de los últimos 3 meses, ordenados por engagement) ==\n\n${postLines.join("\n\n")}`,
    `Genera el JSON con contentIdeas (objetivo ~${totalTarget}, máx ${HARD_CAP}), pillarSuggestions y campaignIdeas.`,
  ]
    .filter((x): x is string => x !== null)
    .join("\n\n");

  return {
    input,
    postIds: new Set(sorted.map((p) => p.id)),
    postsInWindow: posts.length,
    empresaTarget,
    personaTarget,
  };
}

// ── Parse ────────────────────────────────────────────────────────────────────
// Extracción del primer "{" al fin del texto (calcado de parseJsonArray de
// lib/business-cases/agent.ts, adaptado a objeto) + reparación LIFO si quedó
// truncado por max_tokens.

/**
 * Repara un JSON truncado (stop_reason=max_tokens): cierra comillas/objetos/
 * arrays abiertos en el orden CORRECTO usando una pila (el último abierto es
 * el primero en cerrarse) — a diferencia de un simple conteo de profundidad,
 * que cierra en el orden equivocado en cuanto hay un array anidado dentro de
 * un objeto (exactamente la forma de esta respuesta: contentIdeas[]/
 * pillarSuggestions[] dentro del objeto raíz). El último ítem incompleto queda
 * con campos truncados — lo descarta después el Zod per-item de
 * `normalizeCollection`, sin tumbar el resto de la tanda.
 */
export function repairTruncatedJson(s: string): string | null {
  const stack: Array<"{" | "["> = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (stack.length === 0 && !inStr) return null; // nada que reparar
  let suffix = inStr ? '"' : "";
  for (let i = stack.length - 1; i >= 0; i--) suffix += stack[i] === "{" ? "}" : "]";
  return s + suffix;
}

function tryParse(candidate: string): Record<string, unknown> | null {
  try {
    const obj: unknown = JSON.parse(candidate);
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  if (start === -1) return null;
  const candidate = s.slice(start);
  return tryParse(candidate) ?? tryParse(repairTruncatedJson(candidate) ?? "");
}

export function normalizeCollection<T>(raw: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success && parsed.data !== undefined) out.push(parsed.data);
  }
  return out;
}

export interface GenerationResult {
  contentIdeasCount: number;
  campaignIdeasCount: number;
  pillarSuggestionsCount: number;
  rawOutput: string;
}

/** El rawOutput sobrevive a un parseo fallido — se adjunta al Error para que el
 * caller lo persista en el run (si no, se pierde la evidencia del fallo). */
export class GenerationParseError extends Error {
  constructor(
    message: string,
    readonly rawOutput: string,
  ) {
    super(message);
    this.name = "GenerationParseError";
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────

export async function runGenerateIdeasAgent(runId: string): Promise<GenerationResult> {
  const agent = await prisma.agent.findUnique({ where: { id: MARKETING_AGENT_ID } });
  if (!agent || agent.status !== "ACTIVE") {
    throw new Error(
      'El agente de Marketing no está sembrado o está inactivo. Corré "npx tsx scripts/seed-marketing-module.ts".',
    );
  }

  const { input, postIds, empresaTarget, personaTarget } = await buildGenerationInput();
  // Cap efectivo del .slice: el objetivo del form, con techo duro por presupuesto de tokens.
  const ideaCap = Math.min(empresaTarget + personaTarget, HARD_CAP);

  // 20000 tokens: la tanda mezcla posts EMPRESA (cortos) y PERSONA (~900-1600
  // chars) + conceptos de imagen + campañas + sugerencias de pilar; con posts de
  // persona más largos, 16000 se quedaba corto (se truncaba a mitad de
  // pillarSuggestions). Streaming porque el SDK lo exige para llamadas de más de
  // ~10min estimados con max_tokens alto (mismo patrón que
  // app/api/clients/[id]/analyze/route.ts para CARDS_AND_FLOWCHARTS).
  const msg = await anthropic.messages
    .stream({
      model: "claude-sonnet-4-6",
      max_tokens: 20000,
      temperature: 0,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: input }],
    })
    .finalMessage();
  const rawOutput = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const obj = parseJsonObject(rawOutput);
  if (!obj) {
    const truncated = msg.stop_reason === "max_tokens";
    throw new GenerationParseError(
      truncated
        ? "El agente cortó la respuesta por límite de tokens y no se pudo reparar el JSON parcial. Reintentá — si persiste, hay que acotar el máximo de ideas."
        : "El agente no devolvió un JSON parseable (reintentá la generación).",
      rawOutput,
    );
  }

  const ideas = normalizeCollection<GeneratedContentIdea>(obj.contentIdeas, generatedContentIdeaSchema).slice(0, ideaCap);
  const suggestions = normalizeCollection<GeneratedPillarSuggestion>(obj.pillarSuggestions, generatedPillarSuggestionSchema);
  const campaigns = normalizeCollection<GeneratedCampaignIdea>(obj.campaignIdeas, generatedCampaignIdeaSchema);

  // Matching de pilares (case-insensitive) + dedup de sugerencias.
  const pillars = await prisma.contentPillar.findMany({ select: { id: true, name: true } });
  const pillarByName = new Map(pillars.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const pendingSuggestions = await prisma.pillarSuggestion.findMany({
    where: { status: "PENDING" },
    select: { name: true },
  });
  const knownSuggestionNames = new Set(pendingSuggestions.map((s) => s.name.trim().toLowerCase()));

  const newSuggestions = suggestions.filter((s) => {
    const key = s.name.trim().toLowerCase();
    return !pillarByName.has(key) && !knownSuggestionNames.has(key);
  });

  await prisma.$transaction(async (tx) => {
    for (const s of newSuggestions) {
      await tx.pillarSuggestion.create({
        data: {
          runId,
          name: s.name,
          description: s.description ?? null,
          rationale: s.rationale ?? null,
        },
      });
    }

    for (const idea of ideas) {
      const pillarKey = idea.pillarName?.trim().toLowerCase() ?? "";
      const pillarId = pillarKey ? (pillarByName.get(pillarKey) ?? null) : null;
      const suggestedPillarName = pillarId
        ? null
        : (idea.newPillarName?.trim() || idea.pillarName?.trim() || null);

      // El agente nunca inventa fuentes: solo ids que realmente entraron al contexto.
      const validPostIds = [...new Set(idea.inspirationPostIds.filter((id) => postIds.has(id)))];

      await tx.contentIdea.create({
        data: {
          runId,
          pillarId,
          suggestedPillarName,
          title: idea.title,
          postType: idea.postType,
          // Solo posts de EMPRESA llevan etapa; en PERSONA se ignora aunque venga.
          journeyStage: idea.postType === "EMPRESA" ? (idea.journeyStage ?? null) : null,
          copy: idea.copy,
          imageConcept: idea.imageConcept,
          sources: { create: validPostIds.map((postId) => ({ postId })) },
        },
      });
    }

    for (const c of campaigns) {
      await tx.campaignIdea.create({
        data: { runId, title: c.title, channel: c.channel, description: c.description },
      });
    }
  });

  return {
    contentIdeasCount: ideas.length,
    campaignIdeasCount: campaigns.length,
    pillarSuggestionsCount: newSuggestions.length,
    rawOutput,
  };
}
