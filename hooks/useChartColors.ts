"use client";

import { useState, useEffect } from "react";

// ─── Token interface ────────────────────────────────────────────────────────────

export interface EChartsColors {
  /** Fondo del tooltip */
  tooltipBg: string;
  /** Borde del tooltip */
  tooltipBorder: string;
  /** Texto dentro del tooltip */
  tooltipText: string;
  /** Líneas de cuadrícula (splitLine) */
  gridLine: string;
  /** Labels de ejes (valores numéricos, fechas) */
  axisLabel: string;
  /** Labels de eje categórico (ligeramente más brillantes, ej. nombres de etapas) */
  axisLabelStrong: string;
  /** Labels inline sobre/junto a las barras */
  barLabel: string;
  /** Texto de leyenda */
  legendText: string;
}

// ─── Paletas ────────────────────────────────────────────────────────────────────

const DARK: EChartsColors = {
  tooltipBg:       "#111827",
  tooltipBorder:   "#374151",
  tooltipText:     "#e5e7eb",
  gridLine:        "#1f2937",
  axisLabel:       "#6b7280",
  axisLabelStrong: "#9ca3af",
  barLabel:        "#6b7280",
  legendText:      "#9ca3af",
};

const LIGHT: EChartsColors = {
  tooltipBg:       "#ffffff",
  tooltipBorder:   "#e5e7eb",
  tooltipText:     "#1f2937",
  gridLine:        "#f3f4f6",
  axisLabel:       "#9ca3af",
  axisLabelStrong: "#6b7280",
  barLabel:        "#9ca3af",
  legendText:      "#6b7280",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getColors(): EChartsColors {
  if (typeof document === "undefined") return DARK;
  return document.documentElement.classList.contains("light") ? LIGHT : DARK;
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Devuelve los tokens de color para ECharts adaptados al tema activo (dark/light).
 * Se actualiza automáticamente cuando cambia la clase `html.light`.
 *
 * @example
 * const colors = useChartColors();
 * const option = {
 *   tooltip: { backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder },
 *   xAxis:   { axisLabel: { color: colors.axisLabel } },
 * };
 */
export function useChartColors(): EChartsColors {
  const [colors, setColors] = useState<EChartsColors>(getColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(getColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
