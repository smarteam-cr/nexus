/**
 * lib/canvas/validate-block-payload.ts
 *
 * Borde duro de la regeneración por IA (Fase B.1): valida que el payload que
 * devuelve Claude matchee el TIPO del bloque y normaliza su content/data, o
 * devuelve { error } si está malformado/incompleto. El endpoint de regen NUNCA
 * devuelve algo a medias: o pasa esta validación completa, o responde error
 * limpio (y el front solo pre-llena el editor con un payload válido).
 *
 * Función pura (sin DB, sin red) → testeable de forma aislada.
 */
export type ValidatedBlock = { content: string | null; data: unknown };

export function validateBlockPayload(
  blockType: string,
  parsed: { type?: string; content?: unknown; data?: unknown },
): ValidatedBlock | { error: string } {
  const t = blockType.toUpperCase();

  // text-like: el contenido es markdown no vacío; data opcional.
  if (t === "TEXT" || t === "CARD" || t === "CALLOUT" || t === "HEADING") {
    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!content) return { error: "La IA no devolvió contenido de texto." };
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : null;
    return { content, data };
  }

  if (t === "METRIC") {
    if (!parsed.data || typeof parsed.data !== "object") {
      return { error: "La IA no devolvió los datos de la métrica." };
    }
    const m = parsed.data as Record<string, unknown>;
    const label = typeof m.label === "string" ? m.label.trim() : "";
    const value =
      typeof m.value === "string" ? m.value.trim() : typeof m.value === "number" ? String(m.value) : "";
    const trend = typeof m.trend === "string" ? m.trend.trim() : "";
    const comparison = typeof m.comparison === "string" ? m.comparison.trim() : "";
    const missing: string[] = [];
    if (!label) missing.push("label");
    if (!value) missing.push("value");
    if (!trend) missing.push("trend");
    if (!comparison) missing.push("comparison");
    if (missing.length) return { error: `Métrica incompleta: falta ${missing.join(", ")}.` };
    if (!["up", "down", "flat"].includes(trend)) {
      return { error: `Métrica con trend inválido: "${trend}".` };
    }
    return { content: null, data: { ...m, label, value, trend, comparison } };
  }

  if (t === "TABLE") {
    if (!parsed.data || typeof parsed.data !== "object") {
      return { error: "La IA no devolvió los datos de la tabla." };
    }
    const tb = parsed.data as Record<string, unknown>;
    const headers = Array.isArray(tb.headers) ? tb.headers : null;
    const rows = Array.isArray(tb.rows) ? tb.rows : null;
    if (!headers || headers.length === 0) return { error: "Tabla sin columnas (headers)." };
    if (!rows) return { error: "Tabla sin filas (rows)." };
    if (!headers.every((h) => typeof h === "string")) return { error: "Headers de la tabla inválidos." };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) return { error: `La fila ${i + 1} de la tabla no es una lista.` };
      if (row.length !== headers.length) {
        return { error: `La fila ${i + 1} tiene ${row.length} celdas pero hay ${headers.length} columnas.` };
      }
      if (!row.every((c) => typeof c === "string")) {
        return { error: `La fila ${i + 1} tiene celdas que no son texto.` };
      }
    }
    return { content: null, data: { ...tb, headers, rows } };
  }

  // Tipo no contemplado: exigir al menos content.
  const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
  if (!content) return { error: "Payload de bloque no reconocido." };
  return { content, data: parsed.data ?? null };
}
