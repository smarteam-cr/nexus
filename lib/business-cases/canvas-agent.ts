/**
 * lib/business-cases/canvas-agent.ts
 *
 * Generación del Business Case sobre el motor de landing por SECCIONES
 * ESTRUCTURADAS. El agente recibe el contexto (transcripts + sesiones + notas) y
 * produce, por sección del BUSINESS_CASE_LANDING, un objeto `data` con los campos
 * que la sección sabe renderizar (no markdown). Cada sección se persiste como un
 * único bloque con ese `data` (DRAFT). Nunca inventa datos: deja campos vacíos.
 *
 * Importa SOLO los metadatos server-safe (business-case.defs.ts), nunca los
 * componentes client.
 */
import { anthropic } from "@/lib/anthropic";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import {
  type BcTemplateDef,
  templateById,
  templateDefsByKey,
  findDefAcrossTemplates,
} from "@/components/landing/configs/templates.defs";
import { HUBSPOT_TEMPLATE_ID } from "@/lib/business-cases/case-types";

const MODEL = "claude-sonnet-4-6";

const DEFAULT_AGENT_INTRO =
  "Sos un consultor de Smarteam (Elite HubSpot Partner en LATAM) que arma un Business Case (caso de negocio) para un prospecto, a partir de transcripts de reuniones comerciales y notas.";

/** Secciones que el AGENTE genera: excluye `agentGenerated: false` (se llenan
 *  determinísticamente — p.ej. casos de uso del catálogo — o a mano) y las
 *  `skipKeys` (secciones OCULTAS del caso: generarlas costaría tokens/latencia
 *  por contenido que el cliente no ve; al mostrarlas y regenerar, sí entran). */
function generableSections(tpl: BcTemplateDef, skipKeys?: Set<string>): BCSectionDef[] {
  return tpl.sections.filter((d) => d.agentGenerated !== false && !skipKeys?.has(d.key));
}

export type GeneratedSection = { key: string; data: unknown };

/** Representación compacta del shape de un JSON Schema, para guiar al modelo. */
function shapeOf(schema: unknown): string {
  const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown };
  if (s?.type === "object" && s.properties) {
    const inner = Object.entries(s.properties)
      .map(([k, v]) => `"${k}": ${shapeOf(v)}`)
      .join(", ");
    return `{ ${inner} }`;
  }
  if (s?.type === "array") return `[ ${shapeOf(s.items)} ]`;
  return "string";
}

/** Deja `value` con SOLO los campos del schema, coaccionando tipos (arrays/strings).
 *  Tolera data parcial o malformada del modelo → la landing nunca rompe. */
function coerceToSchema(schema: unknown, value: unknown): unknown {
  const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown };
  if (s?.type === "object") {
    const out: Record<string, unknown> = {};
    const src = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    for (const [k, sub] of Object.entries(s.properties ?? {})) {
      out[k] = coerceToSchema(sub, src[k]);
    }
    return out;
  }
  if (s?.type === "array") {
    if (!Array.isArray(value)) return [];
    return value.map((item) => coerceToSchema(s.items, item));
  }
  return typeof value === "string" ? value : "";
}

function sectionsGuide(sections: BCSectionDef[], briefsByKey?: Record<string, string>): string {
  return sections.map(
    (d) => `"${d.key}" — ${d.label}\n  Qué redactar: ${briefsByKey?.[d.key] ?? d.brief ?? d.agentHint}\n  Forma de "${d.key}": ${shapeOf(d.schema)}`,
  ).join("\n\n");
}

function buildSystemPrompt(tpl: BcTemplateDef, briefsByKey?: Record<string, string>, skipKeys?: Set<string>): string {
  const sections = generableSections(tpl, skipKeys);
  const exampleKeys = sections.slice(0, 2).map((d) => `"${d.key}": { ... }`).join(", ");
  return `${tpl.agentIntro ?? DEFAULT_AGENT_INTRO}

Devolvé SOLO un objeto JSON válido, sin texto alrededor ni fences de markdown, con UNA key por sección y como valor el objeto de datos de esa sección (sin markdown, texto plano en cada campo):
  { ${exampleKeys}, ... }

Seguí la GUÍA de cada sección al pie de la letra (es la instrucción del consultor para esa sección):

${sectionsGuide(sections, briefsByKey)}

Reglas estrictas:
- Texto PLANO en cada campo (sin markdown, sin viñetas, sin **).
- NO inventes datos que no estén en el contexto. Si te falta info para un campo, dejalo como string vacío "" (o array vacío []). NUNCA inventes cifras de ROI ni montos de inversión.
- Respetá la forma de cada sección: los arrays con sus objetos, los campos string como string.
- Tono profesional, claro, orientado a valor de negocio. Específico para ESTA empresa, no genérico.
- ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"). Conjuga SIEMPRE en forma de tú: "Transforma", "centraliza", "optimiza", "conecta", "tienes", "puedes", "necesitas". PROHIBIDO el voseo: NUNCA escribas "Transformá", "centralizá", "optimizá", "tenés", "querés", "podés", "necesitás" ni "vos".`;
}

/** Genera el `data` estructurado de todas las secciones GENERABLES del template a
 *  partir del contexto (default: hubspot_v1 = comportamiento legacy).
 *  `briefsByKey` (Fase B): guía efectiva por sección (override del CSE ?? brief del spec). */
export async function generateCanvasSections(
  context: string,
  briefsByKey?: Record<string, string>,
  templateId: string = HUBSPOT_TEMPLATE_ID,
  skipKeys?: Set<string>,
): Promise<GeneratedSection[]> {
  const tpl = templateById(templateId);
  const sections = generableSections(tpl, skipKeys);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: tpl.maxTokens ?? 8000,
    system: buildSystemPrompt(tpl, briefsByKey, skipKeys),
    messages: [
      {
        role: "user",
        content: `Contexto (transcripts, sesiones y notas):\n\n${context}\n\nDevolvé el objeto JSON con los datos por sección.`,
      },
    ],
  });

  // Guard anti-canvas-vacío: si la salida se cortó por max_tokens o el JSON no
  // parseó, ABORTAR acá (antes de la transacción del route) — sin esto, parseObject
  // devuelve {} y coerceToSchema vacía TODO: nacería un caso nuevo VACÍO y activo,
  // desactivando el bueno anterior, con toast de éxito.
  if (msg.stop_reason === "max_tokens") {
    throw new Error("la generación se cortó por límite de tokens — reintentá (si persiste, reducí las fuentes de contexto)");
  }
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const obj = parseObject(text);
  if (Object.keys(obj).length === 0) {
    throw new Error("el agente no devolvió un JSON válido — reintentá la generación");
  }

  return sections.map((d) => ({ key: d.key, data: coerceToSchema(d.schema, obj[d.key]) }));
}

/** Regenera el `data` de UNA sección según una instrucción (edición por IA).
 *  `templateId` resuelve la def; el fallback cross-template es LOAD-BEARING: un bloque
 *  de un canvas viejo cuya key ya no está en su template no debe perder su data. */
export async function regenerateSectionData(
  sectionKey: string,
  currentData: unknown,
  instruction: string,
  brief?: string,
  templateId?: string,
): Promise<unknown> {
  const def = templateDefsByKey(templateId)[sectionKey] ?? findDefAcrossTemplates(sectionKey);
  if (!def) return coerceToSchema({ type: "object", properties: {} }, currentData);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `Editás la sección "${def.label}" de un Business Case de Smarteam. Devolvé SOLO el objeto JSON de datos de la sección, con esta forma exacta (texto plano en cada campo, sin markdown):
${shapeOf(def.schema)}

Guía de la sección: ${brief ?? def.brief ?? def.agentHint}
No inventes datos que no estén en el contenido actual o la instrucción.
ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"): "Transforma", "centraliza", "optimiza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".`,
    messages: [
      {
        role: "user",
        content: `Datos actuales:\n${JSON.stringify(currentData)}\n\nInstrucción: ${instruction}\n\nDevolvé el nuevo objeto JSON de la sección.`,
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const coerced = coerceToSchema(def.schema, parseObject(text)) as Record<string, unknown>;
  // Preservar los campos del data ACTUAL que NO están en el schema (p.ej. hero.brands: la
  // brand-row la edita el CSE, el agente no la genera). coerceToSchema los descartaría →
  // se perdería el trabajo del CSE al usar "✨ IA" sobre esa sección.
  const schemaKeys = new Set(Object.keys((def.schema as { properties?: Record<string, unknown> }).properties ?? {}));
  const cur = (currentData && typeof currentData === "object" ? currentData : {}) as Record<string, unknown>;
  for (const k of Object.keys(cur)) {
    if (!schemaKeys.has(k)) coerced[k] = cur[k];
  }
  return coerced;
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
