"use client";

/**
 * components/gasto-ia/GraficoApilado.tsx — barras apiladas en dólares, una por mes (/integrations/gasto-ia). Lo usan
 * «Por mes» (lo automático y lo humano) y «Proyección» (por componente). Los colores son los tokens de serie del tema
 * (`--serie-1…5`, validados en claro y oscuro), leídos del documento: ECharts pinta en canvas y no entiende `var()`.
 * Siempre con leyenda y con la tabla debajo, en la página: aqua, amarillo y magenta quedan bajo 3:1 en claro.
 */
import { useMemo } from "react";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip } from "@/components/cs/dashboard/chart-theme";
import { nombreDelMes } from "@/lib/ai/gasto-mensual";

export interface SerieApilada {
  nombre: string;
  /** Un valor por etiqueta, en el mismo orden. */
  valores: number[];
}

const RESPALDO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9ca3af"];

function leerSeries(_tema: unknown): string[] {
  void _tema;
  if (typeof document === "undefined") return RESPALDO;
  const css = getComputedStyle(document.documentElement);
  const deTema = [1, 2, 3, 4, 5].map((i) => css.getPropertyValue(`--serie-${i}`).trim());
  return [...deTema.map((c, i) => c || RESPALDO[i]), css.getPropertyValue("--fg-muted").trim() || RESPALDO[5]];
}

const dolares = (v: number) => `US$${v.toFixed(2).replace(".", ",")}`;

export default function GraficoApilado({
  meses,
  series,
  linea,
  alto = 260,
}: {
  meses: string[];
  series: SerieApilada[];
  /** Una línea de referencia (la factura, el tope), si hay. */
  linea?: { nombre: string; valores: (number | null)[] };
  alto?: number;
}) {
  const colors = useChartColors();
  const paleta = useMemo(() => leerSeries(colors), [colors]);

  const option = useMemo(
    () => ({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...baseTooltip(colors), valueFormatter: (v: number) => dolares(Number(v ?? 0)) },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 } },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: meses.map(nombreDelMes),
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: colors.axisLabel, fontSize: 11, formatter: (v: number) => `US$${v}` },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" as const } },
      },
      series: [
        ...series.map((s, i) => ({
          name: s.nombre,
          type: "bar",
          stack: "gasto",
          barMaxWidth: 40,
          data: s.valores.map((v) => Math.round(v * 100) / 100),
          itemStyle: { color: paleta[Math.min(i, paleta.length - 1)], borderColor: colors.tooltipBg, borderWidth: 1 },
        })),
        ...(linea
          ? [
              {
                name: linea.nombre,
                type: "line",
                data: linea.valores.map((v) => (v === null ? null : Math.round(v * 100) / 100)),
                symbolSize: 8,
                lineStyle: { width: 2, color: colors.axisLabel, type: "dashed" as const },
                itemStyle: { color: colors.axisLabel },
                connectNulls: false,
              },
            ]
          : []),
      ],
    }),
    [colors, paleta, meses, series, linea],
  );

  return <EChartRenderer option={option} height={alto} className="rounded-xl border border-line bg-surface" />;
}
