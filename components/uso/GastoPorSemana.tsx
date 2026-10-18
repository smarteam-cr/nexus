"use client";

/**
 * components/uso/GastoPorSemana.tsx — el gasto de IA por semana, apilado por proceso («Uso de Nexus» › Procesos de IA).
 * Los cinco procesos que más gastan con su color; el resto, junto en «Los demás». Los colores son los tokens de serie
 * del tema (`--serie-1…5`), leídos del documento: ECharts pinta en canvas y no entiende `var()`.
 */
import { useMemo } from "react";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip } from "@/components/cs/dashboard/chart-theme";

export interface SerieSemanal {
  nombre: string;
  /** Un valor por semana, en el orden de `semanas`. */
  valores: number[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;

const RESPALDO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9ca3af"];

/** Los colores del tema de hoy. Recibe los del gráfico solo para volver a leerse cuando el tema cambia. */
function leerSeries(_tema: unknown): string[] {
  void _tema;
  if (typeof document === "undefined") return RESPALDO;
  const css = getComputedStyle(document.documentElement);
  const deTema = [1, 2, 3, 4, 5].map((i) => css.getPropertyValue(`--serie-${i}`).trim());
  return [...deTema.map((c, i) => c || RESPALDO[i]), css.getPropertyValue("--fg-muted").trim() || RESPALDO[5]];
}

export default function GastoPorSemana({ semanas, series }: { semanas: string[]; series: SerieSemanal[] }) {
  const colors = useChartColors();
  const paleta = useMemo(() => leerSeries(colors), [colors]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...baseTooltip(colors),
        valueFormatter: (v: number) => `US$${v.toFixed(2).replace(".", ",")}`,
      },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 } },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: semanas.map(fecha),
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: colors.axisLabel, fontSize: 11, formatter: (v: number) => `US$${v}` },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" as const } },
      },
      series: series.map((s, i) => ({
        name: s.nombre,
        type: "bar",
        stack: "gasto",
        barMaxWidth: 36,
        data: s.valores.map((v) => Math.round(v * 100) / 100),
        itemStyle: { color: paleta[Math.min(i, paleta.length - 1)] },
      })),
    }),
    [colors, paleta, semanas, series],
  );

  return <EChartRenderer option={option} height={260} className="rounded-xl border border-line bg-surface" />;
}
