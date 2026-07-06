"use client";

/**
 * components/cs/dashboard/LoadByCseChart.tsx
 *
 * Carga de proyectos por CSE, apilada por PRIORIDAD (hs_priority del 0-970).
 * Cubre las dos cards del dashboard manual de HubSpot ("Proyectos activos por
 * CSL" + "Carga de proyectos por CSL"): el total va como label sobre la barra.
 */
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { PRIORITY_META, baseTooltip } from "./chart-theme";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

const PRIORITY_KEYS = ["high", "medium", "low", "none"] as const;

export default function LoadByCseChart({ byCse }: { byCse: CsDashboardData["byCse"] }) {
  const c = useChartColors();
  if (byCse.length === 0) return null;

  const cses = byCse.map((r) => r.cse);
  const series = PRIORITY_KEYS.map((key, i) => ({
    name: PRIORITY_META[key].label,
    type: "bar" as const,
    stack: "carga",
    itemStyle: { color: PRIORITY_META[key].color, borderRadius: i === PRIORITY_KEYS.length - 1 ? [3, 3, 0, 0] : 0 },
    emphasis: { focus: "series" as const },
    data: byCse.map((r) => r.byPriority[key]),
    // El total de la carga como label sobre el último segmento apilado.
    ...(key === "none"
      ? {
          label: {
            show: true,
            position: "top" as const,
            color: c.barLabel,
            fontSize: 12,
            fontWeight: 600 as const,
            formatter: (p: { dataIndex: number }) => String(byCse[p.dataIndex].activeCount),
          },
        }
      : {}),
  }));

  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...baseTooltip(c) },
    legend: { top: 0, textStyle: { color: c.legendText, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: "category",
      data: cses,
      axisLabel: { color: c.axisLabelStrong, fontSize: 11, interval: 0 },
      axisLine: { lineStyle: { color: c.gridLine } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: c.axisLabel, fontSize: 11 },
      splitLine: { lineStyle: { color: c.gridLine, type: "dashed" } },
    },
    series,
  };

  return <EChartRenderer option={option} height={280} className="overflow-hidden" />;
}
