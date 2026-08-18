"use client";

/**
 * components/finanzas/equilibrio/DesgloseIngresos.tsx
 *
 * De dónde viene lo facturado: por tipo de servicio o por estado de cobro.
 *
 * ⚠ El toggle usa `<Tabs variant="pill">` y no dos botones a mano: el ratchet de
 * tab-bars del repo caza cualquier grupo de botones que se comporte como pestañas y
 * exige el componente, que ya trae `role="tab"` y navegación por teclado.
 *
 * Los labels de servicio salen de `TIPO_SERVICIO_LABEL`, que ya existe: un segundo mapa
 * envejecería solo en cuanto alguien agregue un tipo.
 */
import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip, SERIES_PALETTE } from "@/components/cs/dashboard/chart-theme";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { fmtMonto } from "@/components/cobranza/format";
import type { MesEfectivo } from "@/lib/cobranza/equilibrio-escenario";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Modo = "servicio" | "estado";

export default function DesgloseIngresos({ meses, moneda }: { meses: MesEfectivo[]; moneda: string }) {
  const colors = useChartColors();
  const [modo, setModo] = useState<Modo>("servicio");

  const option = useMemo(() => {
    const series =
      modo === "servicio"
        ? (() => {
            const tipos = [...new Set(meses.flatMap((m) => Object.keys(m.facturadoPorServicio)))].sort();
            return tipos.map((t, i) => ({
              name: TIPO_SERVICIO_LABEL[t] ?? t,
              type: "bar" as const,
              stack: "total",
              data: meses.map((m) => m.facturadoPorServicio[t] ?? 0),
              itemStyle: { color: SERIES_PALETTE[i % SERIES_PALETTE.length] },
            }));
          })()
        : [
            {
              name: "Cobrado",
              type: "bar" as const,
              stack: "total",
              data: meses.map((m) => m.cobrado),
              itemStyle: { color: SERIES_PALETTE[3] },
            },
            {
              name: "Facturado sin cobrar",
              type: "bar" as const,
              stack: "total",
              data: meses.map((m) => m.porCobrar),
              itemStyle: { color: SERIES_PALETTE[0] },
            },
            {
              name: "Pendiente de facturar",
              type: "bar" as const,
              stack: "total",
              data: meses.map((m) => m.pendienteFacturar),
              itemStyle: { color: colors.gridLine },
            },
          ];

    return {
      animation: false,
      tooltip: {
        ...baseTooltip(colors),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => fmtMonto(Number(v), moneda),
      },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 }, icon: "roundRect" },
      grid: { left: 8, right: 8, top: 44, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: MES_CORTO,
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" } },
      },
      series,
    };
  }, [meses, modo, moneda, colors]);

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-medium text-fg">Desglose de ingresos</h3>
          <p className="text-[11px] text-fg-muted mt-0.5">Apilado mensual, sin IVA.</p>
        </div>
        <Tabs
          className="ml-auto"
          aria-label="Cómo desglosar los ingresos"
          variant="pill"
          size="sm"
          value={modo}
          onChange={setModo}
          items={[
            { key: "servicio", label: "Por servicio" },
            { key: "estado", label: "Por estado de cobro" },
          ]}
        />
      </div>
      <EChartRenderer option={option} height={260} className="bg-surface" />
    </div>
  );
}
