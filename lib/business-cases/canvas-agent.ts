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
import { BC_SECTION_DEFS, BC_DEF_BY_KEY } from "@/components/landing/configs/business-case.defs";

const MODEL = "claude-sonnet-4-6";

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

function sectionsGuide(briefsByKey?: Record<string, string>): string {
  return BC_SECTION_DEFS.map(
    (d) => `"${d.key}" — ${d.label}\n  Qué redactar: ${briefsByKey?.[d.key] ?? d.brief ?? d.agentHint}\n  Forma de "${d.key}": ${shapeOf(d.schema)}`,
  ).join("\n\n");
}

function buildSystemPrompt(briefsByKey?: Record<string, string>): string {
  return `Sos un consultor de Smarteam (Elite HubSpot Partner en LATAM) que arma un Business Case (caso de negocio) para un prospecto, a partir de transcripts de reuniones comerciales y notas.

Devolvé SOLO un objeto JSON válido, sin texto alrededor ni fences de markdown, con UNA key por sección y como valor el objeto de datos de esa sección (sin markdown, texto plano en cada campo):
  { "hero": { ... }, "dolores": { ... }, ... }

Seguí la GUÍA de cada sección al pie de la letra (es la instrucción del consultor para esa sección):

${sectionsGuide(briefsByKey)}

Reglas estrictas:
- Texto PLANO en cada campo (sin markdown, sin viñetas, sin **).
- NO inventes datos que no estén en el contexto. Si te falta info para un campo, dejalo como string vacío "" (o array vacío []). NUNCA inventes cifras de ROI ni montos de inversión.
- Respetá la forma de cada sección: los arrays con sus objetos, los campos string como string.
- Tono profesional, claro, orientado a valor de negocio. Tuteá. Específico para ESTA empresa, no genérico.`;
}

/** Genera el `data` estructurado de todas las secciones a partir del contexto.
 *  `briefsByKey` (Fase B): guía efectiva por sección (override del CSE ?? brief del spec). */
export async function generateCanvasSections(
  context: string,
  briefsByKey?: Record<string, string>,
): Promise<GeneratedSection[]> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: buildSystemPrompt(briefsByKey),
    messages: [
      {
        role: "user",
        content: `Contexto (transcripts, sesiones y notas):\n\n${context}\n\nDevolvé el objeto JSON con los datos por sección.`,
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const obj = parseObject(text);

  return BC_SECTION_DEFS.map((d) => ({ key: d.key, data: coerceToSchema(d.schema, obj[d.key]) }));
}

/** Regenera el `data` de UNA sección según una instrucción (edición por IA). */
export async function regenerateSectionData(
  sectionKey: string,
  currentData: unknown,
  instruction: string,
  brief?: string,
): Promise<unknown> {
  const def = BC_DEF_BY_KEY[sectionKey];
  if (!def) return coerceToSchema({ type: "object", properties: {} }, currentData);

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `Editás la sección "${def.label}" de un Business Case de Smarteam. Devolvé SOLO el objeto JSON de datos de la sección, con esta forma exacta (texto plano en cada campo, sin markdown):
${shapeOf(def.schema)}

Guía de la sección: ${brief ?? def.brief ?? def.agentHint}
No inventes datos que no estén en el contenido actual o la instrucción.`,
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
