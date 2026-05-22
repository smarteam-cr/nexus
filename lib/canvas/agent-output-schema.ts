// ── Agent Output Format Rules ────────────────────────────────────────────────
// Injected into agent system prompts to standardize output format.
// Only injected for agents targeting non-default canvases.

/**
 * Universal format rules appended to agent system prompts.
 * These ensure consistent, clean output across all agents.
 */
export const OUTPUT_FORMAT_RULES = `

REGLAS DE FORMATO DE OUTPUT (OBLIGATORIAS):
1. El título de cada card debe ser DESCRIPTIVO del hallazgo o contenido principal — NUNCA debe repetir el nombre de la sección del canvas donde irá.
   - ❌ Malo: "Contexto y alcance" (repite la sección)
   - ✅ Bueno: "Diagnóstico del ciclo de captación de leads en LinkedIn y web"
   - ✅ Bueno: "Brecha crítica: 0% atribución digital vs 100% manual"
2. No uses # (h1) como primera línea del contenido — el título de la card ya cumple esa función. Usa ## (h2) y ### (h3) para subtítulos internos.
3. Usa formato markdown estándar: **negrita** para métricas clave, listas con -, tablas con |.
4. Cada card debe ser autocontenida — comprensible sin necesidad de leer las demás.
5. Si no hay evidencia suficiente para una sección, indícalo explícitamente: "⚠️ Evidencia insuficiente: se requiere [información faltante]".

PENDIENTES (CAMPO ADICIONAL OBLIGATORIO si hay acciones concretas):
Además del array "cards", incluye un array "pendingItems" con acciones concretas y accionables identificadas durante el análisis (compromisos, próximos pasos, tareas pendientes del consultor o del cliente). Cada item es un objeto con la forma:
{ "text": "<acción concreta y verificable>", "source": "<sub-tópico opcional, ej: 'Diagnóstico CRM'>" }

Reglas para pendientes:
- Cada "text" debe ser UNA acción atómica y verificable, no una descripción ("Confirmar fecha de demo con María", no "Hay que ver lo de la demo").
- NO repitas pendientes que ya parecen evidentes en el contexto previo del cliente (revisá si ya existen en el contexto).
- Si no detectás ninguna acción nueva accionable, devuelve "pendingItems": [].
- Máximo 5 pendientes por ejecución.

FORMATO JSON COMPLETO:
{ "cards": [...], "pendingItems": [...] }
`;

/**
 * Generate context-aware format instructions based on target canvas sections.
 * This tells the agent which sections exist so it can avoid title collisions.
 */
export function getOutputFormatInstructions(options: {
  targetSections?: Array<{ key: string; label: string }>;
}): string {
  const parts = [OUTPUT_FORMAT_RULES];

  if (options.targetSections?.length) {
    const sectionList = options.targetSections
      .map((s) => `- "${s.key}" → ${s.label}`)
      .join("\n");
    parts.push(`
SECCIONES DEL CANVAS DESTINO:
${sectionList}

Cada card que generes debe incluir "canvasSection" con el key exacto de la sección correspondiente.
El título de la card NO debe coincidir con el label de la sección — debe describir el contenido específico.
`);
  }

  return parts.join("\n");
}

// ── Block-based output format (for non-default canvases) ────────────────────

/**
 * Generate prompt instructions for the block-based output format.
 * Used by agents that target non-default canvases (Diagnóstico, etc.)
 */
export function getBlockOutputFormatInstructions(options: {
  targetSections: Array<{ key: string; label: string }>;
}): string {
  const sectionList = options.targetSections
    .map((s) => `- "${s.key}" → ${s.label}`)
    .join("\n");

  return `

FORMATO DE OUTPUT: SECTIONS + BLOCKS

Tu respuesta debe usar el formato de secciones con bloques tipados. Cada sección contiene uno o más bloques de contenido.

SECCIONES DISPONIBLES:
${sectionList}

TIPOS DE BLOQUE DISPONIBLES:
- "text": Contenido markdown libre. Usa ## y ### para subtítulos, **negrita** para métricas, listas con -.
- "heading": Título de subsección. Requiere "data": { "level": 2 } o { "level": 3 }.
- "table": Tabla estructurada. Requiere "data": { "headers": ["Col1", "Col2"], "rows": [["val1", "val2"]] }.
- "metric": KPI/métrica individual. Requiere "data": { "label": "Tasa de conversión", "value": "2.1%", "trend": "down", "comparison": "vs 5% objetivo" }. "trend" puede ser "up", "down" o "flat".
- "callout": Alerta o insight destacado. Requiere "data": { "variant": "info" | "warning" | "success" | "error", "title": "Título opcional" }. El contenido va en "content".

REGLAS:
1. Cada sección debe tener al menos un bloque.
2. Usa el tipo de bloque que mejor comunique la información — no todo tiene que ser texto.
3. Las tablas son ideales para comparaciones (estado actual vs deseado, priorización de gaps).
4. Los metrics son ideales para KPIs individuales destacados.
5. Los callouts son ideales para alertas, insights críticos o evidencia insuficiente.
6. El primer bloque de cada sección NO debe ser un heading que repita el nombre de la sección.
7. Si no hay evidencia suficiente, usa un callout de tipo "warning".

FORMATO JSON DE RESPUESTA:
{
  "sections": [
    {
      "key": "<section_key exacto de la lista>",
      "blocks": [
        { "type": "text", "content": "Markdown aquí..." },
        { "type": "table", "data": { "headers": [...], "rows": [...] } },
        { "type": "metric", "data": { "label": "...", "value": "...", "trend": "up" } },
        { "type": "callout", "content": "Insight importante", "data": { "variant": "warning", "title": "Atención" } }
      ]
    }
  ]
}
`;
}
