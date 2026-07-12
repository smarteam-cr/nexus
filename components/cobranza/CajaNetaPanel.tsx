"use client";

/**
 * components/cobranza/CajaNetaPanel.tsx
 *
 * Caja neta proyectada (fase 4 — solo dirección): el espejo "neto" del tab
 * Proyección — por bucket, entra (cobros proyectados) − sale (costos
 * recurrentes ESTIMADOS) = neto, que PUEDE ser negativo (sin clamp, en rojo).
 * REGLA DURA: CRC y USD viven SIEMPRE en líneas/series/columnas separadas —
 * jamás se suman ni se convierten entre sí (no hay tipo de cambio acá).
 * Honestidad: el banner declara la cobertura del lado entra (último corte con
 * métricas) y que el lado sale es referencia estimada, no contabilidad. Los
 * vencidos en riesgo viajan APARTE — nunca dentro del neto.
 * El estado vive en CobranzaClient (props cajaNeta/series + onRefresh): los
 * tabs desmontan este panel — un useState local se perdería al cambiar de tab.
 */
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import type { BucketCajaNeta, CajaNetaDTO, SnapshotSerieDTO, TotalesMoneda } from "@/lib/cobranza";
import { PROYECCION_HORIZONTE_MESES } from "@/lib/cobranza/engine";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip, SERIES_PALETTE } from "@/components/cs/dashboard/chart-theme";
import { fmtFecha, fmtMonto } from "./format";

type Moneda = "CRC" | "USD";

const TH_CLS =
  "px-4 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";

// Series del chart (paleta compartida del dashboard): verde entra (mismo índice
// que "Cobrado" en ReportesPanel), rojo-rosa sale, azul la línea de neto.
const COLOR_ENTRA = SERIES_PALETTE[3];
const COLOR_SALE = SERIES_PALETTE[7];
const COLOR_NETO = SERIES_PALETTE[0];

const CERO: TotalesMoneda = { CRC: 0, USD: 0 };

const simbolo = (m: Moneda) => (m === "USD" ? "$" : "₡");

/** Eje Y compacto: 1500000 → "1,5M" · 25000 → "25k" (espejo local de ProyeccionPanel). */
function compactNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}k`;
  return String(v);
}

type TooltipParams = Array<{
  seriesName?: string;
  value?: number | string | null;
  axisValueLabel?: string;
  marker?: string;
}>;

/** Toggle CRC | USD — mismo pill que ReportesPanel. */
function MonedaToggle({ value, onChange }: { value: Moneda; onChange: (m: Moneda) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line overflow-hidden">
      {(["CRC", "USD"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === m
              ? "bg-brand/10 text-brand"
              : "bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-secondary"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/** Las dos líneas de monto de un tile — una por moneda, NUNCA sumadas. Negativo en rojo. */
function LineasNeto({ totales }: { totales: TotalesMoneda }) {
  return (
    <div>
      {(["CRC", "USD"] as const).map((m) => (
        <p
          key={m}
          className={`text-lg font-bold leading-tight tabular-nums ${
            totales[m] < 0 ? "text-red-600" : ""
          } ${totales[m] === 0 ? "opacity-40" : ""}`}
        >
          {fmtMonto(totales[m], m)}
        </p>
      ))}
    </div>
  );
}

/** Celda entra/sale: CRC arriba, USD abajo; 0 = "—" (no hay nada que declarar). */
function CeldaMonto({ totales }: { totales: TotalesMoneda }) {
  return (
    <div>
      {(["CRC", "USD"] as const).map((m) =>
        totales[m] !== 0 ? (
          <p key={m} className="tabular-nums whitespace-nowrap text-fg">
            {fmtMonto(totales[m], m)}
          </p>
        ) : (
          <p key={m} className="text-fg-muted">
            —
          </p>
        ),
      )}
    </div>
  );
}

/** Celda neto: rojo si negativo; "—" solo si NO hubo movimiento en esa moneda (0 real se muestra). */
function CeldaNeto({ bucket }: { bucket: BucketCajaNeta }) {
  return (
    <div>
      {(["CRC", "USD"] as const).map((m) => {
        const sinMovimiento = bucket.entra[m] === 0 && bucket.sale[m] === 0;
        if (sinMovimiento) {
          return (
            <p key={m} className="text-fg-muted">
              —
            </p>
          );
        }
        const v = bucket.neto[m];
        return (
          <p
            key={m}
            className={`tabular-nums whitespace-nowrap font-medium ${v < 0 ? "text-red-600" : "text-fg"}`}
          >
            {fmtMonto(v, m)}
          </p>
        );
      })}
    </div>
  );
}

export default function CajaNetaPanel({
  cajaNeta,
  series,
  onRefresh,
}: {
  cajaNeta: CajaNetaDTO;
  series: SnapshotSerieDTO[];
  onRefresh: () => void;
}) {
  const [moneda, setMoneda] = useState<Moneda>("CRC");
  const colors = useChartColors();

  const { buckets, vencidosAparte, totalesHorizonte, totalMensualCostos, gastosPlanificados } =
    cajaNeta;

  // Último corte CON métricas — la cobertura del lado entra sale de ahí.
  const ultimoConMetricas = useMemo(() => {
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].metricas != null) return series[i];
    }
    return null;
  }, [series]);
  const cobertura = ultimoConMetricas?.metricas.cobertura ?? null;

  // Los 2 buckets "cercanos": quincenas si las hay; si no, los 2 primeros que existan.
  const cercanos = useMemo(() => {
    const quincenas = buckets.filter((b) => b.granularidad === "quincena");
    return quincenas.length > 0 ? quincenas : buckets;
  }, [buckets]);
  const primerBucket: BucketCajaNeta | undefined = cercanos[0];
  const segundoBucket: BucketCajaNeta | undefined = cercanos[1];

  const hayMovimiento = buckets.some(
    (b) => b.entra.CRC !== 0 || b.entra.USD !== 0 || b.sale.CRC !== 0 || b.sale.USD !== 0,
  );

  // Barras entra/sale + línea de neto, de UNA moneda (toggle) — jamás mezcladas.
  const chartOption = useMemo(() => {
    return {
      tooltip: {
        ...baseTooltip(colors),
        trigger: "axis" as const,
        formatter: (params: TooltipParams) => {
          const head = params[0]?.axisValueLabel ?? "";
          const lineas = params
            .map((p) => {
              const v = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
              return `${p.marker ?? ""}${p.seriesName}: ${fmtMonto(v, moneda)}`;
            })
            .join("<br/>");
          return `${head}<br/>${lineas}`;
        },
      },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 } },
      grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: buckets.map((b) => b.etiqueta),
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const,
        axisLabel: {
          color: colors.axisLabel,
          fontSize: 10,
          formatter: (v: number) => `${simbolo(moneda)}${compactNum(v)}`,
        },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" as const } },
      },
      series: [
        {
          name: "Entra",
          type: "bar" as const,
          data: buckets.map((b) => b.entra[moneda]),
          itemStyle: { color: COLOR_ENTRA, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: "Sale",
          type: "bar" as const,
          data: buckets.map((b) => b.sale[moneda]),
          itemStyle: { color: COLOR_SALE, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: "Neto",
          type: "line" as const,
          data: buckets.map((b) => b.neto[moneda]),
          symbolSize: 6,
          itemStyle: { color: COLOR_NETO },
          lineStyle: { color: COLOR_NETO, width: 2 },
        },
      ],
    };
  }, [buckets, colors, moneda]);

  const tiles: Array<{ label: string; detalle: string; totales: TotalesMoneda }> = [
    {
      label: "Neto esta quincena",
      detalle: primerBucket?.etiqueta ?? "—",
      totales: primerBucket?.neto ?? CERO,
    },
    {
      label: "Neto próxima quincena",
      detalle: segundoBucket?.etiqueta ?? "—",
      totales: segundoBucket?.neto ?? CERO,
    },
    {
      label: "Neto del horizonte",
      detalle: `próximos ${PROYECCION_HORIZONTE_MESES} meses`,
      totales: totalesHorizonte.neto,
    },
    {
      label: "Burn mensual estimado",
      detalle: "costos activos mensualizados",
      totales: totalMensualCostos,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Encabezado + refresh ── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-fg-muted">
          Caja neta proyectada: entra − sale por quincena y mes — CRC y USD por separado (sin tipo de
          cambio).
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* ── Banner de honestidad ── */}
      <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 space-y-1">
        {cobertura && ultimoConMetricas ? (
          <p className="text-sm text-fg-secondary">
            El neto es tan confiable como el lado entra: {cobertura.cuentasConfiguradas} de{" "}
            {cobertura.cuentasTotales} cuentas configuradas — corte del{" "}
            {fmtFecha(ultimoConMetricas.capturedAt)}.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            Todavía no hay cortes con métricas — la cobertura del lado entra no se puede declarar.
          </p>
        )}
        <p className="text-[11px] font-medium text-amber-600">
          El lado sale son costos ESTIMADOS de referencia, no contabilidad.
        </p>
        {gastosPlanificados.count > 0 && (
          <p className="text-[11px] text-fg-muted">
            El lado sale incluye {gastosPlanificados.count} gasto
            {gastosPlanificados.count !== 1 ? "s" : ""} planificado
            {gastosPlanificados.count !== 1 ? "s" : ""}:{" "}
            <span className="tabular-nums text-fg-secondary">
              {fmtMonto(gastosPlanificados.totales.CRC, "CRC")}
            </span>{" "}
            ·{" "}
            <span className="tabular-nums text-fg-secondary">
              {fmtMonto(gastosPlanificados.totales.USD, "USD")}
            </span>
            .
          </p>
        )}
      </div>

      {buckets.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Sin buckets de caja neta"
          description="Configurá servicios con cobros y costos recurrentes para ver acá el neto proyectado."
        />
      ) : (
        <>
          {/* ── Tiles (neto por moneda, negativo en rojo) ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-line bg-surface px-4 py-3 text-fg">
                <LineasNeto totales={t.totales} />
                <p className="text-[11px] font-medium uppercase tracking-wide mt-1 opacity-90">
                  {t.label}
                </p>
                <p className="text-[11px] mt-0.5 opacity-60">{t.detalle}</p>
              </div>
            ))}
          </div>

          {/* ── Entra vs sale por bucket (solo si hay movimiento que dibujar) ── */}
          {hayMovimiento && (
            <div className="rounded-xl border border-line bg-surface overflow-hidden">
              <div className="px-4 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-[13px] font-semibold text-fg">Entra vs sale por período</h3>
                <div className="ml-auto">
                  <MonedaToggle value={moneda} onChange={setMoneda} />
                </div>
                <p className="w-full text-[11px] text-fg-muted">
                  Barras: entra (cobros proyectados) y sale (costos fijos + gastos planificados).
                  Línea: neto — puede ser negativo.
                </p>
              </div>
              <EChartRenderer option={chartOption} height={240} className="bg-surface" />
            </div>
          )}

          {/* ── Tabla de buckets ── */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-line">
                  <th className={TH_CLS}>Período</th>
                  <th className={`${TH_CLS} text-right`}>Entra</th>
                  <th className={`${TH_CLS} text-right`}>Sale</th>
                  <th className={`${TH_CLS} text-right`}>Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {buckets.map((b) => (
                  <tr key={b.key}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-medium text-fg">{b.etiqueta}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                          {b.granularidad}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CeldaMonto totales={b.entra} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CeldaMonto totales={b.sale} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CeldaNeto bucket={b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Vencidos en riesgo — APARTE, jamás dentro del neto ── */}
          {vencidosAparte.count > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              <span className="font-semibold">Vencido en riesgo — NO incluido en el neto:</span>{" "}
              {fmtMonto(vencidosAparte.totales.CRC, "CRC")} · {fmtMonto(vencidosAparte.totales.USD, "USD")}{" "}
              ({vencidosAparte.count} cobro{vencidosAparte.count !== 1 ? "s" : ""}). Se gestiona en Cobros
              y Proyección.
            </div>
          )}
        </>
      )}
    </div>
  );
}
