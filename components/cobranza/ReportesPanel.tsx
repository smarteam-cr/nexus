"use client";

/**
 * components/cobranza/ReportesPanel.tsx
 *
 * Reportes del módulo (5º tab): tendencias históricas de la cartera — la serie
 * de SnapshotCartera con métricas (vencido, DSO, aging, cobrado vs proyectado)
 * — más la tabla de riesgo de pago en vivo. Primeros line-charts del repo:
 * mismo patrón que ProyeccionPanel (EChartRenderer + useChartColors +
 * chart-theme, CRC azul / USD verde, doble eje ₡/$ donde aplica).
 * REGLA DURA: CRC y USD jamás se suman ni se convierten entre sí.
 * Honestidad: los charts exigen ≥2 cortes (1 punto no es tendencia) y los null
 * (DSO sin exigibles, proyección inexistente del primer corte) quedan como
 * HUECOS (connectNulls: false), nunca como cero. La tabla de riesgo se muestra
 * siempre, haya o no historia de cortes.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { AgingBuckets, RiesgoPagoItem, SnapshotSerieDTO } from "@/lib/cobranza";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors, type EChartsColors } from "@/hooks/useChartColors";
import { baseTooltip, SERIES_PALETTE } from "@/components/cs/dashboard/chart-theme";
import { fmtFecha, fmtMonto } from "./format";
import ReporteFinanzasModal from "./ReporteFinanzasModal";

type Moneda = "CRC" | "USD";

const TH_CLS =
  "px-4 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";

// Series del chart: azul CRC / verde USD (mismos índices que ProyeccionPanel).
const COLOR_CRC = SERIES_PALETTE[0];
const COLOR_USD = SERIES_PALETTE[3];
const COLOR_COBRADO = SERIES_PALETTE[3];
const COLOR_PROYECTADO = SERIES_PALETTE[8];

// Buckets del aging (0-30 → 90+), con severidad creciente en el color.
const AGING_BUCKETS: Array<{ key: keyof AgingBuckets; label: string; color: string }> = [
  { key: "d0_30", label: "0–30 d", color: SERIES_PALETTE[5] },
  { key: "d31_60", label: "31–60 d", color: SERIES_PALETTE[2] },
  { key: "d61_90", label: "61–90 d", color: SERIES_PALETTE[7] },
  { key: "d90mas", label: "90+ d", color: "#ef4444" },
];

const GRID = { left: 8, right: 8, top: 32, bottom: 8, containLabel: true };

// Caveat de Tanda B (2026-07): este "vencido" sigue en fechaProgramada+umbral (no
// fechaEmision+creditoDias como el tab Cobros) — hallazgo de Tanda C en DECISIONS.md.
const VENCIDO_INFLADO_CAVEAT =
  "Este \"vencido\" se calcula desde la fecha programada, no desde la factura — incluye " +
  "cobros que todavía están dentro del crédito, así que aparece más alto de lo real. El dato " +
  "correcto está en la pestaña Cobros. Se alinea en la próxima iteración.";

const simbolo = (m: Moneda) => (m === "USD" ? "$" : "₡");

/** Eje Y compacto: 1500000 → "1,5M" · 25000 → "25k" (espejo local de ProyeccionPanel). */
function compactNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}k`;
  return String(v);
}

// Meses cortos (el array de format.ts es privado; misma regla: sin `new Date`).
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-07-06T13:00:00.000Z" → "6 jul" (label del eje X). */
function fmtFechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return `${d} ${MESES[m - 1]}`;
}

const fmtDias = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 1 });

// ── Builders de config ECharts compartidos por los 4 charts ─────────────────────

type TooltipParams = Array<{
  seriesName?: string;
  value?: number | string | null;
  axisValueLabel?: string;
  marker?: string;
}>;

function legendBase(colors: EChartsColors) {
  return { top: 0, textStyle: { color: colors.legendText, fontSize: 11 } };
}

function ejeX(colors: EChartsColors, fechas: string[]) {
  return {
    type: "category" as const,
    data: fechas,
    axisLabel: { color: colors.axisLabel, fontSize: 11 },
    axisLine: { lineStyle: { color: colors.gridLine } },
    axisTick: { show: false },
  };
}

function ejeYMonto(colors: EChartsColors, sim: string, opts?: { splitLine?: boolean }) {
  return {
    type: "value" as const,
    axisLabel: { color: colors.axisLabel, fontSize: 10, formatter: (v: number) => `${sim}${compactNum(v)}` },
    splitLine:
      opts?.splitLine === false
        ? { show: false }
        : { lineStyle: { color: colors.gridLine, type: "dashed" as const } },
  };
}

/** Tooltip de montos: la moneda sale del nombre de la serie o del toggle activo. */
function tooltipMonto(colors: EChartsColors, monedaDe: (seriesName: string | undefined) => string | undefined) {
  return {
    ...baseTooltip(colors),
    trigger: "axis" as const,
    formatter: (params: TooltipParams) => {
      const head = params[0]?.axisValueLabel ?? "";
      const lineas = params
        .map((p) => {
          const v = typeof p.value === "number" ? fmtMonto(p.value, monedaDe(p.seriesName)) : "—";
          return `${p.marker ?? ""}${p.seriesName}: ${v}`;
        })
        .join("<br/>");
      return `${head}<br/>${lineas}`;
    },
  };
}

/** Tooltip en días (DSO) — null se declara, no se maquilla. */
function tooltipDias(colors: EChartsColors) {
  return {
    ...baseTooltip(colors),
    trigger: "axis" as const,
    formatter: (params: TooltipParams) => {
      const head = params[0]?.axisValueLabel ?? "";
      const lineas = params
        .map((p) => {
          const v = typeof p.value === "number" ? `${fmtDias(p.value)} d` : "sin dato";
          return `${p.marker ?? ""}${p.seriesName}: ${v}`;
        })
        .join("<br/>");
      return `${head}<br/>${lineas}`;
    },
  };
}

/** Serie line con huecos honestos: los null NUNCA se interpolan. */
function lineSerie(name: string, color: string, data: Array<number | null>, extra?: Record<string, unknown>) {
  return {
    name,
    type: "line" as const,
    data,
    connectNulls: false,
    symbolSize: 6,
    itemStyle: { color },
    lineStyle: { color, width: 2 },
    ...extra,
  };
}

// ── Piezas de UI ─────────────────────────────────────────────────────────────────

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

function ChartCard({
  titulo,
  nota,
  extra,
  children,
}: {
  titulo: string;
  nota: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-semibold text-fg">{titulo}</h3>
        {extra && <div className="ml-auto">{extra}</div>}
        <p className="w-full text-[11px] text-fg-muted">{nota}</p>
      </div>
      {children}
    </div>
  );
}

/** Celda "Comportamiento histórico": sin historia → chip; con historia → +/− días. */
function Comportamiento({ promedio }: { promedio: number | null }) {
  if (promedio === null) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-muted whitespace-nowrap">
        sin historia
      </span>
    );
  }
  const n = fmtDias(Math.abs(promedio));
  return (
    <span className="text-fg-secondary whitespace-nowrap">
      {promedio >= 0 ? `paga a +${n} d` : `paga a −${n} d adelantado`}
    </span>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────────

export default function ReportesPanel({
  series,
  riesgo,
  role,
}: {
  series: SnapshotSerieDTO[];
  riesgo: RiesgoPagoItem[];
  role: string;
}) {
  const colors = useChartColors();
  const [monedaAging, setMonedaAging] = useState<Moneda>("CRC");
  const [monedaCvp, setMonedaCvp] = useState<Moneda>("CRC");
  // Voz del reporte en generación. La UI solo OCULTA el botón ejecutivo para
  // no-SUPER_ADMIN — el enforcement real es server-side (la route devuelve 403).
  const [reporteVoz, setReporteVoz] = useState<"operativa" | "ejecutiva" | null>(null);

  const hayTendencias = series.length >= 2;
  const ultimo = series.length > 0 ? series[series.length - 1] : null;
  const fechas = useMemo(() => series.map((s) => fmtFechaCorta(s.capturedAt)), [series]);

  // 1. Vencido en el tiempo — doble eje ₡/$ (CRC y USD jamás se mezclan).
  const vencidoOption = useMemo(
    () => ({
      tooltip: tooltipMonto(colors, (name) => name),
      legend: legendBase(colors),
      grid: GRID,
      xAxis: ejeX(colors, fechas),
      yAxis: [ejeYMonto(colors, "₡"), ejeYMonto(colors, "$", { splitLine: false })],
      series: [
        lineSerie("CRC", COLOR_CRC, series.map((s) => s.metricas.moneda.CRC.totalVencido), { yAxisIndex: 0 }),
        lineSerie("USD", COLOR_USD, series.map((s) => s.metricas.moneda.USD.totalVencido), { yAxisIndex: 1 }),
      ],
    }),
    [series, fechas, colors],
  );

  // 2. DSO — días, un solo eje. Un corte sin exigibles es null = hueco, no cero.
  const dsoOption = useMemo(
    () => ({
      tooltip: tooltipDias(colors),
      legend: legendBase(colors),
      grid: GRID,
      xAxis: ejeX(colors, fechas),
      yAxis: {
        type: "value" as const,
        axisLabel: { color: colors.axisLabel, fontSize: 10, formatter: (v: number) => `${v} d` },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" as const } },
      },
      series: [
        lineSerie("CRC", COLOR_CRC, series.map((s) => s.metricas.moneda.CRC.dso)),
        lineSerie("USD", COLOR_USD, series.map((s) => s.metricas.moneda.USD.dso)),
      ],
    }),
    [series, fechas, colors],
  );

  // 3. Aging del vencido — 4 líneas de la moneda elegida en el toggle.
  const agingOption = useMemo(
    () => ({
      tooltip: tooltipMonto(colors, () => monedaAging),
      legend: legendBase(colors),
      grid: GRID,
      xAxis: ejeX(colors, fechas),
      yAxis: ejeYMonto(colors, simbolo(monedaAging)),
      series: AGING_BUCKETS.map((b) =>
        lineSerie(b.label, b.color, series.map((s) => s.metricas.moneda[monedaAging].aging[b.key])),
      ),
    }),
    [series, fechas, colors, monedaAging],
  );

  // 4. Cobrado vs proyectado — el corte i−1 proyectó lo que entraría hasta i, así
  //    que se compara contra el cobrado de i. El primer corte no tiene proyección
  //    previa → hueco (null), no cero.
  const cvpOption = useMemo(() => {
    const m = monedaCvp;
    const cobrado = series.map((s) => s.metricas.moneda[m].totalCobradoDesdeUltimoCorte);
    const proyectado = series.map((_, i) =>
      i === 0 ? null : series[i - 1].metricas.moneda[m].proyectadoProximoCorte,
    );
    return {
      tooltip: tooltipMonto(colors, () => m),
      legend: legendBase(colors),
      grid: GRID,
      xAxis: ejeX(colors, fechas),
      yAxis: ejeYMonto(colors, simbolo(m)),
      series: [
        lineSerie("Cobrado", COLOR_COBRADO, cobrado),
        lineSerie("Proyectado", COLOR_PROYECTADO, proyectado, {
          lineStyle: { color: COLOR_PROYECTADO, width: 2, type: "dashed" },
        }),
      ],
    };
  }, [series, fechas, colors, monedaCvp]);

  const cob = ultimo?.metricas.cobertura;

  return (
    <div className="space-y-4">
      {/* ── Honestidad: cuánta historia hay + cobertura del último corte ── */}
      {!hayTendencias && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
          Acumulando historia — {series.length} corte{series.length !== 1 ? "s" : ""} con métricas. Las
          tendencias necesitan al menos 2.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {ultimo && cob && (
          <p className="text-[11px] text-fg-muted">
            <span className="inline-flex flex-wrap items-center gap-x-1 px-2 py-1 rounded-md border border-line bg-surface-muted">
              Cobertura: {cob.cuentasConfiguradas} de {cob.cuentasTotales} cuentas configuradas ·{" "}
              {cob.cuentasPendienteDatos} pendiente{cob.cuentasPendienteDatos !== 1 ? "s" : ""} de datos ·{" "}
              {cob.cuentasSinCobros} sin cobros — corte del {fmtFecha(ultimo.capturedAt)}
            </span>
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReporteVoz("operativa")}
            title="Reporte accionable para quien cobra: vencidos, riesgo y a quién apretar"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            Reporte operativo
          </button>
          {role === "SUPER_ADMIN" && (
            <button
              type="button"
              onClick={() => setReporteVoz("ejecutiva")}
              title="Reporte para dirección: agregados, tendencia, riesgo y caja proyectada"
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
            >
              Reporte ejecutivo
            </button>
          )}
        </div>
      </div>

      {/* ── Tendencias (solo con ≥2 cortes: 1 punto no es tendencia) ── */}
      {hayTendencias && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            titulo="Vencido en el tiempo"
            nota={`Total vencido por corte — CRC en el eje ₡, USD en el eje $. ${VENCIDO_INFLADO_CAVEAT}`}
          >
            <EChartRenderer option={vencidoOption} height={240} className="bg-surface" />
          </ChartCard>
          <ChartCard
            titulo="DSO"
            nota="Antigüedad promedio (días) de lo exigible, ponderada por monto. Un corte sin exigibles queda como hueco."
          >
            <EChartRenderer option={dsoOption} height={240} className="bg-surface" />
          </ChartCard>
          <ChartCard
            titulo="Aging del vencido"
            nota={`Monto vencido por antigüedad desde la fecha programada. ${VENCIDO_INFLADO_CAVEAT}`}
            extra={<MonedaToggle value={monedaAging} onChange={setMonedaAging} />}
          >
            <EChartRenderer option={agingOption} height={240} className="bg-surface" />
          </ChartCard>
          <ChartCard
            titulo="Cobrado vs proyectado"
            nota="Lo que cada corte proyectó que entraría hasta el siguiente, contra lo realmente cobrado en esa ventana."
            extra={<MonedaToggle value={monedaCvp} onChange={setMonedaCvp} />}
          >
            <EChartRenderer option={cvpOption} height={240} className="bg-surface" />
          </ChartCard>
        </div>
      )}

      {/* ── Riesgo de pago (en vivo — no depende de los cortes) ── */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
            Riesgo de pago{riesgo.length > 0 ? ` · ${riesgo.length}` : ""}
          </span>
          <span className="text-[11px] text-fg-muted">
            Cobros abiertos cuyo atraso supera el comportamiento histórico de su cuenta más el umbral.
          </span>
        </div>
        {riesgo.length === 0 ? (
          <p className="px-4 py-8 text-sm text-fg-muted text-center">
            Ningún cobro supera su umbral de riesgo — la cartera se está comportando según su historia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH_CLS}>Cliente</th>
                  <th className={`${TH_CLS} text-right`}>Monto</th>
                  <th className={TH_CLS}>Fecha programada</th>
                  <th className={`${TH_CLS} text-right`}>Días de atraso</th>
                  <th className={TH_CLS}>Comportamiento histórico</th>
                  <th className={`${TH_CLS} text-right`}>Excedente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {riesgo.map((r) => (
                  <tr key={r.cobroId}>
                    <td className="px-4 py-2.5 font-medium text-fg">{r.clienteNombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-fg">
                      {r.moneda
                        ? fmtMonto(r.monto, r.moneda)
                        : r.monto.toLocaleString("es-CR", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-fg-secondary whitespace-nowrap">
                      {fmtFecha(r.fechaProgramadaISO)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg whitespace-nowrap">
                      {r.diasAtraso} d
                    </td>
                    <td className="px-4 py-2.5">
                      <Comportamiento promedio={r.promedioHistoricoDias} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums whitespace-nowrap">
                      +{fmtDias(r.excedenteDias)} d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reporteVoz && (
        <ReporteFinanzasModal voz={reporteVoz} onClose={() => setReporteVoz(null)} />
      )}
    </div>
  );
}
