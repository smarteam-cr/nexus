"use client";

/**
 * components/cobranza/ProyeccionPanel.tsx
 *
 * Proyección de ingresos ("la plata que viene"): tiles de la quincena actual /
 * próxima / horizonte completo + vencidos en riesgo, barras por bucket (CRC y
 * USD como series separadas, cada una con su eje) y la línea de tiempo de
 * buckets (quincenas cercanas → meses) expandible cobro por cobro.
 * REGLA DURA: CRC y USD viven SIEMPRE en líneas/series/columnas separadas —
 * jamás se suman ni se convierten entre sí (no hay tipo de cambio acá).
 * El estado vive en CobranzaClient (props proyeccion + onRefresh): los tabs
 * desmontan este panel — un useState local se perdería al cambiar de tab.
 */
import { Fragment, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import type {
  BucketProyeccion,
  CobroProyeccionInput,
  ProyeccionIngresos,
  TotalesMoneda,
} from "@/lib/cobranza";
import { PROYECCION_HORIZONTE_MESES } from "@/lib/cobranza/engine";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip, SERIES_PALETTE } from "@/components/cs/dashboard/chart-theme";
import { fmtFecha, fmtMonto } from "./format";

const TH_CLS =
  "px-4 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";

// Series del chart: azul CRC / verde USD (de la paleta compartida del dashboard).
const COLOR_CRC = SERIES_PALETTE[0];
const COLOR_USD = SERIES_PALETTE[3];

/** Eje Y compacto: 1500000 → "1,5M" · 25000 → "25k". */
function compactNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}k`;
  return String(v);
}

/** Las dos líneas de monto de un tile — una por moneda, NUNCA sumadas. */
function LineasMoneda({ totales }: { totales: TotalesMoneda }) {
  return (
    <div>
      {(["CRC", "USD"] as const).map((m) => (
        <p
          key={m}
          className={`text-lg font-bold leading-tight tabular-nums ${totales[m] === 0 ? "opacity-40" : ""}`}
        >
          {fmtMonto(totales[m], m)}
        </p>
      ))}
    </div>
  );
}

export default function ProyeccionPanel({
  proyeccion,
  onRefresh,
}: {
  proyeccion: ProyeccionIngresos;
  onRefresh: () => Promise<void>;
}) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [actualizando, setActualizando] = useState(false);
  const colors = useChartColors();

  const { buckets, vencidos, fueraDeHorizonte } = proyeccion;
  const primerBucket: BucketProyeccion | undefined = buckets[0];
  const segundoBucket: BucketProyeccion | undefined = buckets[1];

  // Suma de TODOS los buckets del horizonte, POR MONEDA (jamás entre sí).
  const totalHorizonte = useMemo<TotalesMoneda>(() => {
    let crc = 0;
    let usd = 0;
    for (const b of buckets) {
      crc += b.totales.CRC;
      usd += b.totales.USD;
    }
    return { CRC: Math.round(crc * 100) / 100, USD: Math.round(usd * 100) / 100 };
  }, [buckets]);

  const hayCobros =
    vencidos.cobros.length > 0 || fueraDeHorizonte > 0 || buckets.some((b) => b.cobros.length > 0);
  const hayPlataEnBuckets = buckets.some((b) => b.totales.CRC > 0 || b.totales.USD > 0);

  // Barras por bucket: DOS series (CRC eje izq. / USD eje der.), sin apilar.
  const chartOption = useMemo(() => {
    return {
      tooltip: {
        ...baseTooltip(colors),
        trigger: "axis",
        formatter: (
          params: Array<{ seriesName?: string; value?: number | string; axisValueLabel?: string; marker?: string }>,
        ) => {
          const head = params[0]?.axisValueLabel ?? "";
          const lineas = params
            .map((p) => {
              const v = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
              return `${p.marker ?? ""}${p.seriesName}: ${fmtMonto(v, p.seriesName)}`;
            })
            .join("<br/>");
          return `${head}<br/>${lineas}`;
        },
      },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 } },
      grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: buckets.map((b) => b.etiqueta),
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: "value",
          axisLabel: { color: colors.axisLabel, fontSize: 10, formatter: (v: number) => `₡${compactNum(v)}` },
          splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" } },
        },
        {
          type: "value",
          axisLabel: { color: colors.axisLabel, fontSize: 10, formatter: (v: number) => `$${compactNum(v)}` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "CRC",
          type: "bar",
          yAxisIndex: 0,
          data: buckets.map((b) => b.totales.CRC),
          itemStyle: { color: COLOR_CRC, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: "USD",
          type: "bar",
          yAxisIndex: 1,
          data: buckets.map((b) => b.totales.USD),
          itemStyle: { color: COLOR_USD, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
        },
      ],
    };
  }, [buckets, colors]);

  function toggleBucket(key: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleRefresh() {
    if (actualizando) return;
    setActualizando(true);
    try {
      await onRefresh(); // best-effort: CobranzaClient ya traga el error adentro
    } finally {
      setActualizando(false);
    }
  }

  const tiles: Array<{ label: string; detalle: string; totales: TotalesMoneda; tone: string }> = [
    {
      label: "Esta quincena",
      detalle: primerBucket?.etiqueta ?? "—",
      totales: primerBucket?.totales ?? { CRC: 0, USD: 0 },
      tone: "text-fg border-line bg-surface",
    },
    {
      label: "Próxima quincena",
      detalle: segundoBucket?.etiqueta ?? "—",
      totales: segundoBucket?.totales ?? { CRC: 0, USD: 0 },
      tone: "text-fg border-line bg-surface",
    },
    {
      label: `Próximos ${PROYECCION_HORIZONTE_MESES} meses`,
      detalle: "todo el horizonte",
      totales: totalHorizonte,
      tone: "text-fg border-line bg-surface",
    },
    {
      label: "Vencido en riesgo",
      detalle: `${vencidos.cobros.length} cobro${vencidos.cobros.length !== 1 ? "s" : ""}`,
      totales: vencidos.totales,
      tone: "text-red-600 border-red-500/30 bg-red-500/5",
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Encabezado + refresh ── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-fg-muted">
          Ingresos proyectados por quincena y mes — CRC y USD por separado (sin tipo de cambio).
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={actualizando}
          className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {actualizando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {!hayCobros ? (
        <EmptyState
          variant="dashed"
          title="Sin cobros proyectados"
          description="Configurá servicios y generá cobros desde el panel de cartera para ver acá la plata que viene."
        />
      ) : (
        <>
          {/* ── Tiles ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl border px-4 py-3 ${t.tone}`}>
                <LineasMoneda totales={t.totales} />
                <p className="text-[11px] font-medium uppercase tracking-wide mt-1 opacity-90">{t.label}</p>
                <p className="text-[11px] mt-0.5 opacity-60">{t.detalle}</p>
              </div>
            ))}
          </div>

          {/* ── Barras por bucket (solo si hay plata que dibujar) ── */}
          {hayPlataEnBuckets && (
            <EChartRenderer
              option={chartOption}
              height={240}
              className="rounded-xl border border-line bg-surface overflow-hidden"
            />
          )}

          {/* ── Vencidos en riesgo ── */}
          {vencidos.cobros.length > 0 && (
            <div className="rounded-xl border border-red-500/30 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-500/5 border-b border-red-500/30 text-[11px] font-semibold text-red-600 uppercase tracking-wide">
                En riesgo (vencidos) · {vencidos.cobros.length}
              </div>
              <ul className="divide-y divide-line bg-surface">
                {vencidos.cobros.map((c: CobroProyeccionInput) => (
                  <li key={c.cobroId} className="px-4 py-2 text-sm flex items-center gap-3">
                    <span className="flex-1 truncate font-medium text-fg">{c.clienteNombre}</span>
                    <span className="text-xs text-fg-muted whitespace-nowrap">
                      {fmtFecha(c.fechaProgramadaISO)}
                    </span>
                    <span className="w-28 text-right font-medium text-red-600 tabular-nums whitespace-nowrap">
                      {fmtMonto(c.monto, c.moneda)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Línea de tiempo de buckets (expandible) ── */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-line">
                  <th className={TH_CLS}>Período</th>
                  <th className={TH_CLS}>Cobros</th>
                  <th className={`${TH_CLS} text-right`}>CRC</th>
                  <th className={`${TH_CLS} text-right`}>USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {buckets.map((b) => {
                  const vacio = b.cobros.length === 0;
                  const abierto = expandidos.has(b.key);
                  return (
                    <Fragment key={b.key}>
                      <tr
                        onClick={vacio ? undefined : () => toggleBucket(b.key)}
                        className={
                          vacio ? "opacity-60" : "cursor-pointer hover:bg-surface-hover transition-colors"
                        }
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <svg
                              className={`w-3 h-3 shrink-0 text-fg-muted transition-transform ${
                                abierto ? "rotate-90" : ""
                              } ${vacio ? "invisible" : ""}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="font-medium text-fg">{b.etiqueta}</span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                              {b.granularidad}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-fg-muted whitespace-nowrap">
                          {vacio ? "—" : `${b.cobros.length} cobro${b.cobros.length !== 1 ? "s" : ""}`}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {b.totales.CRC > 0 ? (
                            <span className="text-fg">{fmtMonto(b.totales.CRC, "CRC")}</span>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {b.totales.USD > 0 ? (
                            <span className="text-fg">{fmtMonto(b.totales.USD, "USD")}</span>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                      </tr>
                      {abierto &&
                        b.cobros.map((c) => (
                          <tr key={c.cobroId} className="bg-surface-muted">
                            <td className="pl-11 pr-4 py-2" colSpan={2}>
                              <span className="text-fg-secondary">{c.clienteNombre}</span>
                              <span className="ml-2 text-xs text-fg-muted whitespace-nowrap">
                                {fmtFecha(c.fechaProgramadaISO)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-fg-secondary whitespace-nowrap">
                              {c.moneda === "CRC" ? fmtMonto(c.monto, "CRC") : ""}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-fg-secondary whitespace-nowrap">
                              {c.moneda === "USD" ? fmtMonto(c.monto, "USD") : ""}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {fueraDeHorizonte > 0 && (
            <p className="text-[11px] text-fg-muted">
              +{fueraDeHorizonte} cobro{fueraDeHorizonte !== 1 ? "s" : ""} más allá del horizonte de{" "}
              {PROYECCION_HORIZONTE_MESES} meses (no se grafica{fueraDeHorizonte !== 1 ? "n" : ""}).
            </p>
          )}
        </>
      )}
    </div>
  );
}
