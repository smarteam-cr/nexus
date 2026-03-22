/**
 * Utilidades para calcular embudos de conversión.
 * Se usa en widgets de auditorías para mostrar tasas de conversión
 * paso a paso y acumulativas.
 */

export interface FunnelStep {
  value: string;
  label: string;
  count: number;
  color: string;
  /** % que convierte al siguiente paso. null si es el último paso. */
  stepConversion: number | null;
  /** % acumulativo desde el primer paso (base = topCount o steps[0].count). */
  cumulativeConversion: number;
  /** Ancho de barra normalizado 0–100 relativo al primer paso. */
  barPct: number;
}

export interface FunnelMetrics {
  steps: FunnelStep[];
  /** Tasa global: último paso / primer paso. */
  overallConversionPct: number;
  /** Count usado como denominador (base 100%). */
  topCount: number;
}

/**
 * Calcula un embudo de conversión a partir de una lista ordenada de pasos.
 *
 * @param steps     Lista de pasos en orden descendente (mayor a menor).
 *                  Cada paso debe tener: value, label, count, color.
 * @param topCount  Si se provee, se usa como denominador del primer paso.
 *                  Útil cuando el primer paso visible es "todos los registros"
 *                  y el primer `step` es una sub-etapa (ej: leads dentro de
 *                  todos los contactos).
 */
export function computeFunnel(
  steps: Array<{ value: string; label: string; count: number; color: string }>,
  topCount?: number
): FunnelMetrics {
  if (steps.length === 0) {
    return { steps: [], overallConversionPct: 0, topCount: topCount ?? 0 };
  }

  const base = topCount ?? steps[0].count;

  const result: FunnelStep[] = steps.map((s, i) => {
    const next = steps[i + 1];
    const stepConversion =
      next !== undefined && s.count > 0
        ? (next.count / s.count) * 100
        : null;
    const cumulativeConversion = base > 0 ? (s.count / base) * 100 : 0;
    const barPct = base > 0 ? (s.count / base) * 100 : 0;

    return { ...s, stepConversion, cumulativeConversion, barPct };
  });

  const last = result[result.length - 1];
  const overallConversionPct = last?.cumulativeConversion ?? 0;

  return { steps: result, overallConversionPct, topCount: base };
}

/**
 * Formatea un número como porcentaje con el número de decimales indicado.
 * Ej: fmtPct(25.6934) → "25.69%"
 */
export function fmtPct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Calcula tasas de conversión entre dos etapas específicas.
 * Útil para KPIs del tipo "Lead → Cliente".
 */
export function stageToPct(
  fromCount: number,
  toCount: number,
  decimals = 2
): number {
  if (fromCount <= 0) return 0;
  return parseFloat(((toCount / fromCount) * 100).toFixed(decimals));
}
