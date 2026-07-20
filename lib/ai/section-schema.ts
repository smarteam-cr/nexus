/**
 * lib/ai/section-schema.ts — helpers PUROS del contrato schema↔modelo de los
 * documentos por secciones del motor de landing.
 *
 * Extraídos de lib/business-cases/canvas-agent.ts (ola A1 del plan de assist)
 * para que la dirección de dependencia sea la correcta — infra (`lib/ai`) ←
 * módulos (`lib/business-cases`, `lib/canvas`, el assist) — sin duplicar las
 * funciones que hacen tolerante la salida del modelo. Comportamiento idéntico;
 * canvas-agent los re-importa de acá.
 *
 * El "schema" es el JSON-schema-ish de las defs (`BCSectionDef.schema` /
 * `SECTION_META[...].schema` de roles): objetos con `properties`, arrays con
 * `items`, hojas string. No es JSON Schema completo a propósito — es lo mínimo
 * que el motor necesita para guiar y coaccionar.
 */

/** Representación compacta del shape de un JSON Schema, para guiar al modelo. */
export function shapeOf(schema: unknown): string {
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
export function coerceToSchema(schema: unknown, value: unknown): unknown {
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

/**
 * Copia al `next` los campos del `prev` que NO están en el schema del agente.
 *
 * `coerceToSchema` deja SOLO las keys del schema, así que sin esto se perdería todo
 * lo que cura el CSE y el agente nunca genera: `hero.brands`, `hero.coverImageUrl`,
 * `hero.eyebrow`, `cta.buttonUrl`/`buttonTarget`, `__lang`…
 *
 * LOAD-BEARING en el KICKOFF: su generación completa **sobreescribe los bloques en el
 * lugar** (a diferencia del Business Case, que crea un canvas nuevo por versión). Sin
 * este merge, regenerar un kickoff borraría la portada y la brand-row del hero.
 */
export function preserveNonSchemaKeys(
  schema: unknown,
  prev: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const schemaKeys = new Set(Object.keys((schema as { properties?: Record<string, unknown> })?.properties ?? {}));
  const cur = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  for (const k of Object.keys(cur)) {
    if (!schemaKeys.has(k)) next[k] = cur[k];
  }
  return next;
}

/** Extrae el primer objeto JSON del texto del modelo (tolera fences de markdown
 *  y texto alrededor). No parseable / no-objeto → `{}` (el caller decide si eso
 *  es error). NO es el parser central de la deuda #11 — es el del contrato de
 *  secciones (canvas-agent + assist); los ~15 callers viejos siguen con el suyo. */
export function parseObject(text: string): Record<string, unknown> {
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
