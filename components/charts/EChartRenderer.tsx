"use client";

import dynamic from "next/dynamic";

// Importación dinámica: ECharts depende de window (client-only)
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl skeleton-shimmer"
      style={{ height: 480 }} />
  ),
});

interface Props {
  /** ECharts option object completo generado por el agente */
  option: unknown;
  title?: string;
  description?: string;
  height?: number;
}

export default function EChartRenderer({ option, title, description, height = 480 }: Props) {
  if (!option) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {(title || description) && (
        <div className="px-6 pt-5 pb-2">
          {title && (
            <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
      )}
      <div className="px-2 pb-4">
        <ReactECharts
          option={option}
          style={{ height }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
        />
      </div>
    </div>
  );
}
