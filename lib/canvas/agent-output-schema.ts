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
