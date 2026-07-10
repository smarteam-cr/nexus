"use client";

import dynamic from "next/dynamic";

// Importación dinámica: ECharts depende de window (client-only). El skeleton usa
// h-full: el contenedor de abajo fija el height REAL (el loading de dynamic() no
// recibe props — un height hardcodeado acá causaba salto de layout).
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <div className="rounded-xl skeleton-shimmer h-full w-full" />,
});

interface Props {
  /** ECharts option object completo generado por el agente */
  option: unknown;
  title?: string;
  description?: string;
  height?: number;
  /** Clases del wrapper — permite tokens semánticos (bg-surface/border-line) en
   *  contextos con tema (CS); el default conserva el look de audits intacto. */
  className?: string;
}

export default function EChartRenderer({ option, title, description, height = 480, className }: Props) {
  if (!option) return null;

  return (
    <div className={className ?? "rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"}>
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
        <div style={{ height }}>
          <ReactECharts
            option={option}
            style={{ height: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
          />
        </div>
      </div>
    </div>
  );
}
