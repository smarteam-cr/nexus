"use client";

import ReactECharts from "echarts-for-react";
import type { LifecycleStageCount, AuditInsight, InsightSeverity } from "@/lib/hubspot/portal-analyzer";
import { useChartColors } from "@/hooks/useChartColors";
import ContactFunnelWidget from "./ContactFunnelWidget";
import CompanyFunnelWidget from "./CompanyFunnelWidget";
import OwnerAssignmentWidget from "./OwnerAssignmentWidget";
import type { OwnerAssignmentStats } from "@/lib/hubspot/portal-analyzer";

// Orden canónico de stages estándar
const STAGE_ORDER = [
  "subscriber",
  "lead",
  "marketingqualifiedlead",
  "salesqualifiedlead",
  "opportunity",
  "customer",
  "evangelist",
  "other",
];

const STAGE_LABELS: Record<string, string> = {
  subscriber: "Suscriptor",
  lead: "Lead",
  marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL",
  opportunity: "Oportunidad",
  customer: "Cliente",
  evangelist: "Evangelista",
  other: "Otro",
};

const STAGE_COLORS: Record<string, string> = {
  subscriber: "#6b7280",
  lead: "#3b82f6",
  marketingqualifiedlead: "#8b5cf6",
  salesqualifiedlead: "#ec4899",
  opportunity: "#f97316",
  customer: "#22c55e",
  evangelist: "#14b8a6",
  other: "#9ca3af",
  __none__: "#374151",
};

const EXTRA_COLORS = [
  "#f59e0b", "#06b6d4", "#84cc16", "#f43f5e",
  "#a855f7", "#0ea5e9", "#10b981", "#fb923c",
];

function getStageColor(value: string, index: number): string {
  if (STAGE_COLORS[value]) return STAGE_COLORS[value];
  return EXTRA_COLORS[index % EXTRA_COLORS.length];
}

// ─── Severity styles ───────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<InsightSeverity, { border: string; icon: string; badge: string; label: string; headerBg: string }> = {
  positive: {
    border: "border-green-500/30 bg-green-500/5",
    icon: "text-green-400",
    badge: "bg-green-500/10 text-green-400 border-green-500/20",
    label: "Positivo",
    headerBg: "bg-green-500/10",
  },
  info: {
    border: "border-blue-500/30 bg-blue-500/5",
    icon: "text-blue-400",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    label: "Info",
    headerBg: "bg-blue-500/10",
  },
  warning: {
    border: "border-yellow-500/30 bg-yellow-500/5",
    icon: "text-yellow-400",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    label: "Atención",
    headerBg: "bg-yellow-500/10",
  },
  critical: {
    border: "border-red-500/30 bg-red-500/5",
    icon: "text-red-400",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    label: "Crítico",
    headerBg: "bg-red-500/10",
  },
};

function SeverityIcon({ severity }: { severity: InsightSeverity }) {
  if (severity === "positive") {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (severity === "info") {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function InsightSkeleton() {
  return (
    <div className="rounded-xl border border-gray-800 h-full flex flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="px-4 py-3 flex items-center gap-2.5 bg-gray-800">
        <div className="w-4 h-4 rounded-full skeleton-shimmer" />
        <div className="w-16 h-4 rounded-md skeleton-shimmer" />
        <div className="ml-auto w-14 h-3 rounded-md skeleton-shimmer" />
      </div>
      {/* Body skeleton */}
      <div className="px-4 py-4 flex-1 flex flex-col gap-3">
        {/* Title */}
        <div className="h-4 w-3/4 rounded-full skeleton-shimmer" />
        {/* Comment lines */}
        <div className="space-y-2 mt-0.5">
          <div className="h-3.5 w-full rounded-full skeleton-shimmer" />
          <div className="h-3.5 w-full rounded-full skeleton-shimmer" />
          <div className="h-3.5 w-5/6 rounded-full skeleton-shimmer" />
          <div className="h-3.5 w-4/5 rounded-full skeleton-shimmer" />
        </div>
        {/* Recommendations */}
        <div className="mt-auto space-y-2.5">
          <div className="h-3 w-24 rounded-full skeleton-shimmer" />
          {([80, 65, 55] as const).map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full skeleton-shimmer flex-shrink-0" />
              <div
                className="h-3.5 rounded-full skeleton-shimmer"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Insight panel (columna derecha) ──────────────────────────────────────────

interface InsightPanelProps {
  insight?: AuditInsight;
  isLoading?: boolean;
}

function InsightPanel({ insight, isLoading }: InsightPanelProps) {
  // Show skeleton while generating
  if (isLoading) {
    return <InsightSkeleton />;
  }

  // Empty state (no CTA — generation is handled globally)
  if (!insight) {
    return (
      <div className="h-full min-h-[110px] rounded-xl border border-dashed border-gray-800 flex flex-col items-center justify-center gap-2 px-5 py-6">
        <div className="w-8 h-8 rounded-full bg-gray-800/70 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-xs text-gray-600 text-center leading-relaxed">
          Sin análisis disponible
        </p>
      </div>
    );
  }

  const style = SEVERITY_STYLES[insight.severity];

  return (
    <div className={`rounded-xl border h-full flex flex-col ${style.border}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-2.5 rounded-t-xl ${style.headerBg}`}>
        <span className={`flex-shrink-0 ${style.icon}`}>
          <SeverityIcon severity={insight.severity} />
        </span>
        <span className={`text-2xs font-semibold px-2 py-0.5 rounded-md border ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-2xs text-gray-600 uppercase tracking-wider font-medium ml-auto">
          Insight IA
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 flex-1 flex flex-col gap-3">
        {insight.title && (
          <h4 className="text-sm font-semibold text-white leading-snug">{insight.title}</h4>
        )}
        <p className="text-sm text-gray-300 leading-relaxed">{insight.comment}</p>

        {insight.recommendations.length > 0 && (
          <div className="space-y-2 mt-auto">
            <p className="text-2xs text-gray-600 uppercase tracking-wider font-medium">
              Recomendaciones
            </p>
            <ul className="space-y-1.5">
              {insight.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-[8px] flex-shrink-0 w-1 h-1 rounded-full bg-gray-600" />
                  <span className="text-sm text-gray-400 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lifecycle chart ───────────────────────────────────────────────────────────

interface ChartBar {
  value: string;
  label: string;
  count: number;
  color: string;
}

interface LifecycleChartProps {
  title: string;
  data: LifecycleStageCount[];
  total: number;
}

function LifecycleChart({ title, data, total }: LifecycleChartProps) {
  const colors = useChartColors();

  const standardBars: ChartBar[] = STAGE_ORDER.map((stageValue, idx) => {
    const found = data.find((d) => d.value === stageValue);
    return {
      value: stageValue,
      label: STAGE_LABELS[stageValue] ?? stageValue,
      count: found?.count ?? 0,
      color: getStageColor(stageValue, idx),
    };
  }).filter((s) => s.count > 0);

  const customBars: ChartBar[] = data
    .filter((d) => !STAGE_ORDER.includes(d.value))
    .map((d, idx) => ({
      value: d.value,
      label: d.label || d.value,
      count: d.count,
      color: getStageColor(d.value, STAGE_ORDER.length + idx),
    }));

  const assignedTotal = data.reduce((sum, d) => sum + d.count, 0);
  const withoutStage = Math.max(0, total - assignedTotal);

  const bars: ChartBar[] = [
    ...standardBars,
    ...customBars,
    ...(withoutStage > 0
      ? [{ value: "__none__", label: "Sin etapa", count: withoutStage, color: STAGE_COLORS.__none__ }]
      : []),
  ];

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
        return `<div style="font-weight:600">${p.name}</div><div>${p.value.toLocaleString("es-ES")} registros · ${pct}%</div>`;
      },
    },
    grid: { left: 8, right: "12%", top: "2%", bottom: 0, containLabel: true },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: colors.axisLabel,
        fontSize: 11,
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)),
      },
    },
    yAxis: {
      type: "category",
      data: bars.map((s) => s.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabelStrong, fontSize: 12, fontWeight: "500" },
    },
    series: [
      {
        type: "bar",
        data: bars.map((s) => ({
          value: s.count,
          itemStyle: {
            color: s.color,
            borderRadius: [0, 4, 4, 0],
            opacity: s.value === "__none__" ? 0.45 : 1,
          },
        })),
        label: {
          show: true,
          position: "right",
          color: colors.barLabel,
          fontSize: 11,
          formatter: (p: { value: number }) => {
            const pct = total > 0 ? ((p.value / total) * 100).toFixed(0) : "0";
            return `${p.value.toLocaleString("es-ES")}  (${pct}%)`;
          },
        },
        barMaxWidth: 28,
        emphasis: { itemStyle: { opacity: 0.8 } },
      },
    ],
  };

  const chartHeight = Math.max(bars.length * 46 + 16, 120);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white leading-tight">{title}</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          <span>
            <span className="text-white font-medium">{total.toLocaleString("es-ES")}</span> total
          </span>
          {withoutStage > 0 && (
            <span className="text-gray-600">
              {((withoutStage / total) * 100).toFixed(0)}% sin etapa
            </span>
          )}
        </div>
      </div>

      {bars.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-gray-600 text-sm">
          Sin datos de etapa de ciclo de vida
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: `${chartHeight}px` }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
        />
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        {bars.map((b) => (
          <div key={b.value} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: b.color, opacity: b.value === "__none__" ? 0.45 : 1 }}
            />
            <span className="text-xs text-gray-500">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  contacts: LifecycleStageCount[];
  companies: LifecycleStageCount[];
  totalContacts: number;
  totalCompanies: number;
  totalDeals: number;
  totalTickets: number;
  lifecycleWorkflows?: string[];
  ownerStats?: OwnerAssignmentStats;
  insights?: AuditInsight[];
  isGenerating?: boolean;
}

export default function LifecycleReport({
  contacts,
  companies,
  totalContacts,
  totalCompanies,
  totalDeals,
  totalTickets,
  lifecycleWorkflows = [],
  ownerStats,
  insights = [],
  isGenerating = false,
}: Props) {
  const getInsight = (key: AuditInsight["widgetKey"]) =>
    insights.find((i) => i.widgetKey === key);

  const statsItems = [
    { label: "Contactos", value: totalContacts, icon: "👤", color: "text-blue-400" },
    { label: "Empresas", value: totalCompanies, icon: "🏢", color: "text-brand-light" },
    { label: "Negocios", value: totalDeals, icon: "💼", color: "text-purple-400" },
    { label: "Tickets", value: totalTickets, icon: "🎫", color: "text-green-400" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Stat cards + insight ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="grid grid-cols-2 gap-3">
          {statsItems.map((s) => (
            <div
              key={s.label}
              className="px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 space-y-1"
            >
              <p className="text-xs text-gray-500">{s.icon} {s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>
                {s.value.toLocaleString("es-ES")}
              </p>
            </div>
          ))}
        </div>
        <InsightPanel
          insight={getInsight("stats")}
          isLoading={isGenerating}
        />
      </div>

      {/* ── Contactos por ciclo de vida + insight ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800">
          <LifecycleChart
            title="Contactos por etapa del ciclo de vida"
            data={contacts}
            total={totalContacts}
          />
        </div>
        <InsightPanel
          insight={getInsight("contacts_lifecycle")}
          isLoading={isGenerating}
        />
      </div>

      {/* ── Embudo de conversión de contactos + insight ──────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800">
          <ContactFunnelWidget contacts={contacts} totalContacts={totalContacts} />
        </div>
        <InsightPanel
          insight={getInsight("contacts_funnel")}
          isLoading={isGenerating}
        />
      </div>

      {/* ── Empresas por ciclo de vida + insight ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800">
          <LifecycleChart
            title="Empresas por etapa del ciclo de vida"
            data={companies}
            total={totalCompanies}
          />
        </div>
        <InsightPanel
          insight={getInsight("companies_lifecycle")}
          isLoading={isGenerating}
        />
      </div>

      {/* ── Embudo de conversión de empresas + insight ───────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800">
          <CompanyFunnelWidget companies={companies} totalCompanies={totalCompanies} />
        </div>
        <InsightPanel
          insight={getInsight("companies_funnel")}
          isLoading={isGenerating}
        />
      </div>

      {/* ── Asignación de propietarios + insight ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800">
          {ownerStats ? (
            <OwnerAssignmentWidget ownerStats={ownerStats} totalContacts={totalContacts} />
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-400">Asignación de propietarios</p>
                <p className="text-xs text-gray-600 mt-1 max-w-xs">
                  Este widget requiere una auditoría nueva. Los datos de propietarios no se capturaron en esta versión.
                </p>
              </div>
            </div>
          )}
        </div>
        {/* Solo muestra skeleton para owner si hay ownerStats (si no hay datos, no hay insight posible) */}
        <InsightPanel
          insight={getInsight("owner_assignment")}
          isLoading={isGenerating && !!ownerStats}
        />
      </div>

      {/* ── Workflows + insight ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5 items-stretch">
        <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-800 space-y-3">
          <h3 className="text-sm font-semibold text-white">
            Automatizaciones del ciclo de vida
          </h3>
          {lifecycleWorkflows.length === 0 ? (
            <p className="text-sm text-gray-500">
              No se detectaron workflows activos relacionados con el ciclo de vida.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lifecycleWorkflows.map((wf, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  {wf}
                </li>
              ))}
            </ul>
          )}
        </div>
        <InsightPanel
          insight={getInsight("lifecycle_workflows")}
          isLoading={isGenerating}
        />
      </div>

    </div>
  );
}
