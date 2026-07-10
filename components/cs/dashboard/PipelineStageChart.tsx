"use client";

/**
 * components/cs/dashboard/PipelineStageChart.tsx
 *
 * Desglose de proyectos por ETAPA del pipeline de CS, apilado por CSE.
 * (La vista "Dona" se quitó a propósito: era espejo del dashboard viejo de
 * HubSpot y la proporción de etapas casi nunca cambia una decisión de CS —
 * la vista por CSE ya cubre lo útil. Decisión del usuario, plan CS360 F3.)
 */
import { useMemo } from "react";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { SERIES_PALETTE, baseTooltip } from "./chart-theme";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

export default function PipelineStageChart({ byStage }: { byStage: CsDashboardData["byStage"] }) {
  const c = useChartColors();

  const cses = useMemo(
    () => [...new Set(byStage.flatMap((s) => Object.keys(s.byCse)))].sort(),
    [byStage],
  );
  if (byStage.length === 0) return null;

  const stackedOption = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...baseTooltip(c) },
    legend: { top: 0, textStyle: { color: c.legendText, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: "category",
      data: byStage.map((s) => s.stageLabel),
      axisLabel: {
        color: c.axisLabelStrong, fontSize: 10, interval: 0,
        formatter: (v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v),
      },
      axisLine: { lineStyle: { color: c.gridLine } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: c.axisLabel, fontSize: 11 },
      splitLine: { lineStyle: { color: c.gridLine, type: "dashed" } },
    },
    series: cses.map((cse, i) => ({
      name: cse,
      type: "bar" as const,
      stack: "etapa",
      itemStyle: { color: SERIES_PALETTE[i % SERIES_PALETTE.length] },
      emphasis: { focus: "series" as const },
      data: byStage.map((s) => s.byCse[cse] ?? 0),
    })),
  };

  return <EChartRenderer option={stackedOption} height={300} className="overflow-hidden" />;
}
