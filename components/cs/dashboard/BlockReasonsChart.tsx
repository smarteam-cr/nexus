"use client";

/**
 * components/cs/dashboard/BlockReasonsChart.tsx
 *
 * Razones de bloqueo/atraso (motivo_de_bloqueo del 0-970): dona por razón +
 * lista expandible con el DETALLE de texto libre por proyecto (el "Detalle de
 * bloqueo" del dashboard manual de HubSpot) y link al cliente.
 */
import { useState } from "react";
import Link from "next/link";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { SERIES_PALETTE, baseTooltip } from "./chart-theme";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

export default function BlockReasonsChart({ blockReasons }: { blockReasons: CsDashboardData["blockReasons"] }) {
  const c = useChartColors();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (blockReasons.length === 0) {
    return (
      <p className="text-xs text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
        ✅ Ningún proyecto con motivo de bloqueo registrado en HubSpot.
      </p>
    );
  }

  const option = {
    tooltip: { trigger: "item", ...baseTooltip(c) },
    series: [
      {
        type: "pie",
        radius: ["40%", "68%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4 },
        label: {
          color: c.axisLabelStrong, fontSize: 10,
          formatter: (p: { name: string; value: number }) =>
            `${p.name.length > 24 ? p.name.slice(0, 23) + "…" : p.name}: ${p.value}`,
        },
        data: blockReasons.map((r, i) => ({
          name: r.reason,
          value: r.count,
          itemStyle: { color: SERIES_PALETTE[i % SERIES_PALETTE.length] },
        })),
      },
    ],
  };

  return (
    <div>
      <EChartRenderer option={option} height={260} className="overflow-hidden" />
      <div className="mt-2 divide-y divide-line border border-line rounded-lg overflow-hidden">
        {blockReasons.map((r) => (
          <div key={r.reason}>
            <button
              onClick={() => setExpanded(expanded === r.reason ? null : r.reason)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted transition-colors"
            >
              <span className="text-xs font-medium text-fg flex-1 truncate">{r.reason}</span>
              <span className="text-[11px] text-fg-muted">{r.count} proyecto{r.count !== 1 ? "s" : ""}</span>
              <span className="text-[10px] text-fg-muted">{expanded === r.reason ? "▲" : "▼"}</span>
            </button>
            {expanded === r.reason && (
              <div className="px-3 pb-2 space-y-1.5 bg-surface-muted/50">
                {r.projects.map((p) => (
                  <div key={p.projectId} className="text-[11px] leading-snug">
                    <Link href={`/clients/${p.clientId}?tab=${p.projectId}`} className="font-medium text-fg hover:text-brand">
                      {p.clientName} · {p.projectName}
                    </Link>
                    {p.detail && <p className="text-fg-muted mt-0.5">{p.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
