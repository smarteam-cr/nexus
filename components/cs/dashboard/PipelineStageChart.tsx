"use client";

/**
 * components/cs/dashboard/PipelineStageChart.tsx
 *
 * Desglose de proyectos por ETAPA del pipeline de CS, con dos vistas:
 *   - apilada por CSE (espejo del dashboard manual de HubSpot)
 *   - dona por etapa (proporciones de la cartera)
 */
import { useMemo, useState } from "react";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { SERIES_PALETTE, baseTooltip } from "./chart-theme";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

export default function PipelineStageChart({ byStage }: { byStage: CsDashboardData["byStage"] }) {
  const c = useChartColors();
  const [view, setView] = useState<"stacked" | "donut">("stacked");

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

  const donutOption = {
    tooltip: { trigger: "item", ...baseTooltip(c) },
    legend: { top: 0, textStyle: { color: c.legendText, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["50%", "56%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4 },
        label: { color: c.axisLabelStrong, fontSize: 11, formatter: "{b}\n{c} ({d}%)" },
        data: byStage.map((s, i) => ({
          name: s.stageLabel,
          value: s.total,
          itemStyle: { color: SERIES_PALETTE[i % SERIES_PALETTE.length] },
        })),
      },
    ],
  };

  return (
    <div className="relative">
      <div className="absolute right-2 top-0 z-10 flex gap-1">
        {(["stacked", "donut"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              view === v ? "bg-brand/10 border-brand/40 text-brand font-medium" : "bg-surface border-line text-fg-muted hover:text-fg"
            }`}
          >
            {v === "stacked" ? "Por CSE" : "Dona"}
          </button>
        ))}
      </div>
      <EChartRenderer option={view === "stacked" ? stackedOption : donutOption} height={300} className="overflow-hidden" />
    </div>
  );
}
