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
import { shapeOf, coerceToSchema, preserveNonSchemaKeys, parseObject } from "@/lib/ai/section-schema";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import {
  type BcTemplateDef,
  templateById,
  templateDefsByKey,
  findDefAcrossTemplates,
} from "@/components/landing/configs/templates.defs";
import { HUBSPOT_TEMPLATE_ID } from "@/lib/business-cases/case-types";

const MODEL = "claude-sonnet-4-6";

/** Intro default del BC (la usa también el assist de documento cuando el template
 *  no declara `agentIntro`). */
export const DEFAULT_AGENT_INTRO =
  "Sos un consultor de Smarteam (Elite HubSpot Partner · Partner de Insider, LATAM) que arma un Business Case (caso de negocio) para un prospecto, a partir de transcripts de reuniones comerciales y notas. Posicionamiento de la marca: Smarteam no vende software — lo pone a producir; la promesa nunca es la herramienta, es que la operación funcione.";

/** Voz de marca Smarteam (doc: prompt-linea-grafica.md) — bloque COMPARTIDO por los
 *  4 generadores de landings (hubspot/website/kickoff/desarrollo): se inyecta en las
 *  reglas del system prompt de generación y en la regenaración por sección. */
export const BRAND_VOICE_RULES = `- VOZ DE MARCA (Smarteam): directa, concreta, adulta. Frases cortas. Habla de consecuencias operativas y dinero (horas perdidas, ciclo de venta, datos que no llegan), no de features. PROHIBIDOS los superlativos vacíos: "maximizar el valor", "ROI garantizado", "solución integral", "llevar al siguiente nivel", "de clase mundial".
- HONESTIDAD (es EL diferencial de la marca): está permitido y bien visto decir "aún no te conviene", "no hace falta cambiar nada", "sin venderte de más". Nunca sobreprometas.
- METÁFORA ELÉCTRICA (sello de la marca): encender / apagado / conectar / producir — ÚSALA con naturalidad, MÁXIMO una imagen eléctrica por pieza (no en cada párrafo).
- CTA: el titular del cierre abre con UNA PREGUNTA sobre el dolor del lector (ej.: "¿Cuántas horas pierde tu equipo moviendo datos a mano?"), aterrizada en la operación de ESTA empresa.
- Si falta un dato real (cifra, cliente, resultado), deja el campo vacío o un marcador "Pendiente: …" — JAMÁS lo inventes ni atribuyas cifras a empresas con nombre propio.`;

/** Secciones que el AGENTE genera: excluye `agentGenerated: false` (se llenan
 *  determinísticamente — p.ej. casos de uso del catálogo — o a mano) y las
 *  `skipKeys` (secciones OCULTAS del caso: generarlas costaría tokens/latencia
 *  por contenido que el cliente no ve; al mostrarlas y regenerar, sí entran). */
function generableSections(tpl: BcTemplateDef, skipKeys?: Set<string>): BCSectionDef[] {
  return tpl.sections.filter((d) => d.agentGenerated !== false && !skipKeys?.has(d.key));
}

export type GeneratedSection = { key: string; data: unknown };

export interface GeneratedCanvas {
  sections: GeneratedSection[];
  /** Títulos/eyebrows por key TRADUCIDOS por el agente — solo cuando el contexto pide
   *  la propuesta en otro idioma (se aplican como titleOverride/eyebrowOverride). */
  titleOverrides: Record<string, string>;
  eyebrowOverrides: Record<string, string>;
  /** Idioma declarado por el agente (código ISO, "en"…) — null = español. Se persiste
   *  como `__lang` en el data del hero para traducir los rótulos fijos (i18n.ts). */
  lang: string | null;
}

/** Filtra un posible mapa { key: string } del modelo a keys válidas del template. */
function stringMapFor(raw: unknown, validKeys: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (validKeys.has(k) && typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
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
${tpl.brandVoice === false ? "" : `${BRAND_VOICE_RULES}\n`}- IDIOMA: por defecto la propuesta va en ESPAÑOL. Si el contexto especifica que debe ir en OTRO idioma (p.ej. "la propuesta debe estar en inglés"), redactá TODO el contenido en ese idioma y agregá al JSON tres keys extra: "__lang" (código ISO del idioma, p.ej. "en"), "__titles" y "__eyebrows" — estos dos últimos, objetos { key de sección: texto } con el TÍTULO y el eyebrow de cada sección traducidos a ese idioma (traducí los títulos de la guía de arriba). Si la propuesta va en español, NO incluyas esas keys.
- ESTILO EN ESPAÑOL (OBLIGATORIO cuando redactes en español): TUTEO neutro (segunda persona con "tú"). Conjuga SIEMPRE en forma de tú: "Transforma", "centraliza", "optimiza", "conecta", "tienes", "puedes", "necesitas". PROHIBIDO el voseo: NUNCA escribas "Transformá", "centralizá", "optimizá", "tenés", "querés", "podés", "necesitás" ni "vos".`;
}

/** Genera el `data` estructurado de todas las secciones GENERABLES del template a
 *  partir del contexto (default: hubspot_v1 = comportamiento legacy).
 *  `briefsByKey` (Fase B): guía efectiva por sección (override del CSE ?? brief del spec). */
export async function generateCanvasSections(
  context: string,
  briefsByKey?: Record<string, string>,
  templateId: string = HUBSPOT_TEMPLATE_ID,
  skipKeys?: Set<string>,
): Promise<GeneratedCanvas> {
  return generateSectionsForTemplate(templateById(templateId), context, briefsByKey, skipKeys);
}

/** Núcleo template-driven de la generación: recibe el BcTemplateDef directo (en vez de
 *  un templateId que indexa BC_TEMPLATES) → lo reusa el KICKOFF_TEMPLATE (canvas de
 *  Kickoff) sin acoplarse al registry de Business Cases. `generateCanvasSections` es un
 *  wrapper de esto (BC no cambia comportamiento). */
export async function generateSectionsForTemplate(
  tpl: BcTemplateDef,
  context: string,
  briefsByKey?: Record<string, string>,
  skipKeys?: Set<string>,
  /** Data ACTUAL por sección (kickoff): sus keys fuera-de-schema se preservan en la
   *  salida — la generación del kickoff sobreescribe los bloques en el lugar y sin
   *  esto borraría `hero.coverImageUrl`/`brands`/`eyebrow`. El BC no lo pasa (cada
   *  "Generar" crea un canvas nuevo) → comportamiento idéntico al de antes. */
  prevDataByKey?: Record<string, unknown>,
): Promise<GeneratedCanvas> {
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

  // Idioma ≠ español: el agente devuelve los títulos/eyebrows de sección traducidos
  // en "__titles"/"__eyebrows" (keys válidas del template solamente).
  const validKeys = new Set(tpl.sections.map((d) => d.key));
  const rawLang = obj["__lang"];
  return {
    sections: sections.map((d) => {
      const coerced = coerceToSchema(d.schema, obj[d.key]) as Record<string, unknown>;
      const prev = prevDataByKey?.[d.key];
      return { key: d.key, data: prev ? preserveNonSchemaKeys(d.schema, prev, coerced) : coerced };
    }),
    titleOverrides: stringMapFor(obj["__titles"], validKeys),
    eyebrowOverrides: stringMapFor(obj["__eyebrows"], validKeys),
    lang: typeof rawLang === "string" && rawLang.trim() ? rawLang.trim().toLowerCase() : null,
  };
}

/** Regenera el `data` de UNA sección según una instrucción (edición por IA).
 *  `templateId` resuelve la def; el fallback cross-template es LOAD-BEARING: un bloque
 *  de un canvas viejo cuya key ya no está en su template no debe perder su data.
 *  `lang` = idioma de la propuesta (`__lang` del hero del canvas): el contenido
 *  regenerado se escribe en ESE idioma, no siempre en español. */
export async function regenerateSectionData(
  sectionKey: string,
  currentData: unknown,
  instruction: string,
  brief?: string,
  templateId?: string,
  lang?: string | null,
): Promise<unknown> {
  const def = templateDefsByKey(templateId)[sectionKey] ?? findDefAcrossTemplates(sectionKey);
  if (!def) return coerceToSchema({ type: "object", properties: {} }, currentData);
  return regenerateSectionDataForDef(def, currentData, instruction, brief, lang);
}

/** Núcleo de la regeneración por sección: recibe la DEF directo (schema/brief/label).
 *  Lo reusa el regenerate del Kickoff (con las defs de KICKOFF_TEMPLATE) sin depender
 *  del registry de BC. `regenerateSectionData` resuelve la def y llama a esto. */
export async function regenerateSectionDataForDef(
  def: BCSectionDef,
  currentData: unknown,
  instruction: string,
  brief?: string,
  lang?: string | null,
): Promise<unknown> {
  // Regla de idioma: si la propuesta declara idioma no-español, TODO el contenido va
  // en ese idioma; en español (o sin declarar) aplica el estilo tuteo del repo.
  // AUTO-CORRECCIÓN (obligatoria en ambas ramas): el `currentData` puede venir de una
  // generación previa que quedó en un idioma distinto al declarado (deriva entre
  // secciones) — la edición por IA es la oportunidad de corregirlo, no de perpetuarlo.
  const langRule =
    lang && !lang.startsWith("es") // startsWith: "es-419"/"es-mx" son español (simetría con i18n.ts)
      ? `IDIOMA (OBLIGATORIO): TODO el contenido va en el idioma de la propuesta: "${lang}" (código ISO 639-1).
Si el contenido ACTUAL de esta sección está en un idioma distinto (p.ej. quedó en español por error), TRADUCILO por completo a "${lang}" como parte de esta edición — no lo dejes mixto ni lo dejes en el idioma incorrecto.`
      : `IDIOMA: la propuesta es en español.
Si el contenido ACTUAL de esta sección está en OTRO idioma (p.ej. quedó en inglés por error), TRADUCILO por completo al español como parte de esta edición — no lo dejes mixto ni lo dejes en el idioma incorrecto.
ESTILO en español (OBLIGATORIO): TUTEO neutro (segunda persona con "tú"): "Transforma", "centraliza", "optimiza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `Editás la sección "${def.label}" de un Business Case de Smarteam. Devolvé SOLO el objeto JSON de datos de la sección, con esta forma exacta (texto plano en cada campo, sin markdown):
${shapeOf(def.schema)}

Guía de la sección: ${brief ?? def.brief ?? def.agentHint}
No inventes datos que no estén en el contenido actual o la instrucción.
${BRAND_VOICE_RULES}
${langRule}`,
    messages: [
      {
        role: "user",
        content: `Datos actuales:\n${JSON.stringify(currentData)}\n\nInstrucción: ${instruction}\n\nDevolvé el nuevo objeto JSON de la sección.`,
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const coerced = coerceToSchema(def.schema, parseObject(text)) as Record<string, unknown>;
  return preserveNonSchemaKeys(def.schema, currentData, coerced);
}

// shapeOf / coerceToSchema / preserveNonSchemaKeys / parseObject viven en
// lib/ai/section-schema.ts (extraídos en la ola A1 del plan de assist — los
// comparte runDocumentAssist). Comportamiento idéntico al que tenían acá.
