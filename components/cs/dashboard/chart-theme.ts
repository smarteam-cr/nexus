/**
 * components/cs/dashboard/chart-theme.ts
 *
 * Paletas y helpers de config ECharts COMPARTIDOS por los charts del dashboard
 * de Customer Success (client-safe, sin hooks — los colores de tema entran por
 * parámetro desde useChartColors).
 */
import type { EChartsColors } from "@/hooks/useChartColors";

/** Prioridad del 0-970 (hs_priority) → label ES + color. */
export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high: { label: "Alta", color: "#ef4444" },
  medium: { label: "Media", color: "#f59e0b" },
  low: { label: "Baja", color: "#3b82f6" },
  none: { label: "Sin prioridad", color: "#6b7280" },
};

/** hs_status del 0-970 → label ES (para tooltips/KPIs). */
export const HS_STATUS_LABEL: Record<string, string> = {
  on_track: "A tiempo",
  delayed: "Retrasado",
  blocked: "Bloqueado",
  completed: "Completado",
  on_hold: "En pausa",
  at_risk: "En riesgo",
};

/** Serie de colores para dimensiones dinámicas (CSEs, razones, etapas). */
export const SERIES_PALETTE = [
  "#60a5fa", "#a78bfa", "#f97316", "#34d399", "#f472b6",
  "#facc15", "#22d3ee", "#fb7185", "#94a3b8", "#c084fc",
];

/** estado_de_adopcion → color (heatmap / dona). */
export const ADOPTION_META: Record<string, { color: string; order: number }> = {
  "Alto": { color: "#10b981", order: 0 },
  "Medio": { color: "#f59e0b", order: 1 },
  "Bajo": { color: "#ef4444", order: 2 },
  "No iniciado": { color: "#6b7280", order: 3 },
  "Sin valor": { color: "#374151", order: 4 },
};

/** Tooltip base con los tokens del tema activo. */
export function baseTooltip(c: EChartsColors) {
  return {
    backgroundColor: c.tooltipBg,
    borderColor: c.tooltipBorder,
    textStyle: { color: c.tooltipText, fontSize: 12 },
  };
}

/** Grid + ejes base (barras). */
export function baseGrid(c: EChartsColors) {
  return {
    grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
    axisCommon: {
      axisLabel: { color: c.axisLabel, fontSize: 11 },
      splitLine: { lineStyle: { color: c.gridLine, type: "dashed" as const } },
    },
  };
}

/** Score de uso (0-100) → color de celda del heatmap. */
export function usageScoreColor(score: number | null): string {
  if (score === null) return "transparent";
  if (score >= 60) return "rgba(16,185,129,0.25)"; // verde
  if (score >= 35) return "rgba(245,158,11,0.25)"; // ámbar
  return "rgba(239,68,68,0.25)"; // rojo
}
