/**
 * lib/ai/assist.ts — núcleo del ASSIST DE DOCUMENTO del motor de landing.
 *
 * "Mejorar por instrucción": recibe el CONTRATO de un documento (secciones con
 * schema + data actual), la instrucción del usuario y el systemPrompt del agente
 * (DB, calibrable), llama a Claude UNA vez con la server-tool web_search SIEMPRE
 * disponible (el MODELO decide cuándo investigar — la regla del prompt le prohíbe
 * buscar para ediciones de redacción), y devuelve una PROPUESTA por sección que
 * el humano revisa y aplica (`<AgentProposal>`). NUNCA escribe — la persistencia
 * es del caller (autosave de Roles / upsertCardData del canvas).
 *
 * Doctrina completa en DECISIONS §Roles ("Assist de documento con web_search").
 * Consumidores: /api/roles/[id]/assist, /api/projects/[id]/canvas-assist,
 * /api/business-cases/[id]/assist.
 *
 * Primer uso de server-tools en el repo. Cómo llega la respuesta: la API resuelve
 * las búsquedas sola — `content` intercala bloques `server_tool_use` +
 * `web_search_tool_result` (con los links) + `text` (posiblemente varios); si el
 * loop server-side se pausa (`stop_reason: "pause_turn"`) se re-envía el content
 * del assistant y continúa (cap abajo). El texto final es el join de TODOS los
 * bloques `text` en orden.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { shapeOf, coerceToSchema, preserveNonSchemaKeys, parseObject } from "@/lib/ai/section-schema";
import { BRAND_VOICE_RULES } from "@/lib/ai/brand-voice";

const MODEL = "claude-sonnet-4-6";
/** Continuaciones máximas tras `pause_turn` (el loop de búsquedas nunca es infinito). */
const MAX_PAUSE_CONTINUES = 3;

/** Una sección del contrato: lo que la IA puede leer y proponer. Las secciones
 *  curadas (`agentGenerated:false` en canvas) y las ctxDriven NO deben entrar acá
 *  — si no están en el contrato, la IA no puede ni proponerlas. */
export interface AssistSectionDef {
  key: string;
  label: string;
  /** JSON-schema-ish de la def (compatible shapeOf/coerceToSchema). */
  schema: unknown;
  /** Guía de la sección (brief efectivo ?? agentHint ?? tip). */
  brief?: string;
  /** Data actual (o el `empty` de la def si la sección está vacía). */
  currentData: unknown;
}

export interface DocumentAssistInput {
  /** "perfil de puesto" | "kickoff" | "business case" | "requerimiento técnico"… */
  docLabel: string;
  /** systemPrompt del Agent (DB) + additionalInstructions — las reglas fijas van aparte. */
  systemPrompt: string;
  sections: AssistSectionDef[];
  instruction: string;
  /** Contexto extra (ej. handoff curado + cronograma para kickoff/desarrollo). */
  context?: string;
  /** Idioma de la propuesta (`__lang` del hero en BC) — null/undefined = español. */
  lang?: string | null;
  /** Inyecta la VOZ DE MARCA (BRAND_VOICE_RULES) en las reglas fijas. OPT-IN: solo
   *  documentos cliente-facing de marca (business case, kickoff). Los técnicos
   *  (desarrollo, `brandVoice:false` en su template) y los internos (perfil de
   *  puesto) van SIN — mismo gate que la generación (canvas-agent). Sin esto,
   *  "Mejorar con IA" podía reintroducir los superlativos que la voz prohíbe. */
  brandVoice?: boolean;
  maxTokens?: number;
  maxWebSearches?: number;
}

export interface DocumentAssistResult {
  /** SOLO las secciones que cambian: { [key]: data coaccionada + merge no-schema }. */
  proposal: Record<string, unknown>;
  /** Labels de las secciones cambiadas (chips) — lo arma el server, no el modelo. */
  summary: string[];
  /** "__reasoning" del modelo (1-3 frases de por qué). */
  reasoning?: string;
  /** Keys desconocidas descartadas, búsquedas con error… */
  warnings: string[];
  /** Fuentes consultadas por web_search (dedupe por url) — se muestran SIEMPRE. */
  citations: { url: string; title: string }[];
  usedWebSearch: boolean;
}

/** Reglas fijas del assist (idénticas en espíritu a las de canvas-agent: JSON
 *  puro, texto plano, no inventar, idioma/tuteo). */
function fixedRules(input: DocumentAssistInput): string {
  const langRule =
    input.lang && !input.lang.startsWith("es")
      ? `IDIOMA (OBLIGATORIO): TODO el contenido va en el idioma del documento: "${input.lang}" (código ISO 639-1). Si una sección actual quedó en otro idioma, corregila como parte de la edición.`
      : `IDIOMA: el documento es en español. ESTILO (OBLIGATORIO): TUTEO neutro (segunda persona con "tú"): "Transforma", "centraliza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "tenés", "querés", "podés" ni "vos".`;
  return `Vas a MEJORAR un ${input.docLabel} existente según la instrucción del usuario.

Tienes la herramienta web_search. Úsala SOLO cuando la instrucción requiera información que NO está en el documento (metodologías, mejores prácticas actuales, datos del mercado). Para ediciones de redacción, estructura o estilo NO busques.

Devuelve SOLO un objeto JSON válido, sin texto alrededor ni fences de markdown, con UNA key por CADA sección que decidas cambiar (y SOLO esas — no repitas secciones sin cambios) y como valor el objeto de datos COMPLETO de esa sección con su forma exacta. Agrega la key "__reasoning" con 1-3 frases de por qué hiciste esos cambios (en el idioma del documento).

Reglas estrictas:
- Texto PLANO en cada campo (sin markdown salvo en los campos "md", sin **).
- NO inventes datos: si la instrucción no da la información y web_search no aplica, no toques esa parte.
- Respeta la forma de cada sección (arrays con sus objetos, strings como strings) y sus valores válidos cuando la guía los enumere.
- Cambia lo MÍNIMO que cumpla la instrucción: las secciones que no menciones quedan intactas.
${input.brandVoice ? `${BRAND_VOICE_RULES}\n` : ""}- ${langRule}`;
}

function sectionsBlock(sections: AssistSectionDef[]): string {
  return sections
    .map(
      (d) =>
        `"${d.key}" — ${d.label}${d.brief ? `\n  Guía: ${d.brief}` : ""}\n  Forma exacta: ${shapeOf(d.schema)}\n  Datos actuales: ${JSON.stringify(d.currentData ?? {})}`,
    )
    .join("\n\n");
}

/** Corre el assist: 1 llamada (+continuaciones de pause_turn) → propuesta validada. */
export async function runDocumentAssist(input: DocumentAssistInput): Promise<DocumentAssistResult> {
  const system = `${input.systemPrompt.trim()}\n\n${fixedRules(input)}`;
  const user = `${input.context ? `Contexto del proyecto:\n\n${input.context}\n\n---\n\n` : ""}El documento actual, sección por sección:\n\n${sectionsBlock(input.sections)}\n\n---\n\nInstrucción del usuario: ${input.instruction}\n\nDevuelve el objeto JSON con las secciones que cambian.`;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: user }];
  const warnings: string[] = [];
  const citations = new Map<string, string>(); // url → title
  let usedWebSearch = false;
  let text = "";

  for (let turn = 0; ; turn++) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: input.maxTokens ?? 8000,
      system,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: input.maxWebSearches ?? 5,
        },
      ],
      messages,
    });

    for (const b of msg.content) {
      if (b.type === "text") text += b.text;
      if (b.type === "server_tool_use" && b.name === "web_search") usedWebSearch = true;
      if (b.type === "web_search_tool_result") {
        // content es Array<WebSearchResultBlock> o un objeto error {error_code}.
        if (Array.isArray(b.content)) {
          for (const r of b.content) {
            if (r.type === "web_search_result" && r.url && !citations.has(r.url)) {
              citations.set(r.url, r.title || r.url);
            }
          }
        } else {
          warnings.push(`Una búsqueda en línea falló (${b.content.error_code}) — la propuesta puede estar incompleta.`);
        }
      }
    }

    if (msg.stop_reason === "max_tokens") {
      // NUNCA aplicar una propuesta truncada: preferible fallar con mensaje humano.
      throw new Error("la propuesta se cortó por límite de tokens — prueba con una instrucción más acotada");
    }
    if (msg.stop_reason === "pause_turn" && turn < MAX_PAUSE_CONTINUES) {
      // El loop server-side de búsquedas se pausó: se re-envía el content del
      // assistant tal cual y la API continúa donde quedó (patrón documentado del
      // SDK; el cast es la frontera con la API externa — ContentBlock es
      // estructuralmente un ContentBlockParam válido para reenviar).
      messages.push({ role: "assistant", content: msg.content as unknown as Anthropic.Messages.ContentBlockParam[] });
      continue;
    }
    break;
  }

  const raw = parseObject(text);
  const reasoningRaw = raw["__reasoning"];
  const reasoning = typeof reasoningRaw === "string" && reasoningRaw.trim() ? reasoningRaw.trim() : undefined;

  const byKey = new Map(input.sections.map((d) => [d.key, d]));
  const proposal: Record<string, unknown> = {};
  const summary: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__reasoning") continue;
    const def = byKey.get(key);
    if (!def) {
      // Sección fuera del contrato (curada, ctxDriven o alucinada): se descarta y
      // se dice — jamás puede llegar al apply.
      warnings.push(`La IA propuso la sección desconocida "${key}" — se descartó.`);
      continue;
    }
    const coerced = coerceToSchema(def.schema, value) as Record<string, unknown>;
    proposal[key] = preserveNonSchemaKeys(def.schema, def.currentData, coerced);
    summary.push(def.label);
  }

  if (Object.keys(proposal).length === 0) {
    throw new Error(
      Object.keys(raw).length === 0
        ? "la IA no devolvió una propuesta válida — prueba de nuevo o reformula la instrucción"
        : "la propuesta no tocó ninguna sección editable del documento — reformula la instrucción",
    );
  }

  return {
    proposal,
    summary,
    reasoning,
    warnings,
    citations: [...citations.entries()].map(([url, title]) => ({ url, title })),
    usedWebSearch,
  };
}
