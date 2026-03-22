"use client";

import ReactECharts from "echarts-for-react";
import type { OwnerAssignmentStats } from "@/lib/hubspot/portal-analyzer";
import { useChartColors } from "@/hooks/useChartColors";

interface Props {
  ownerStats: OwnerAssignmentStats;
  totalContacts: number;
}

export default function OwnerAssignmentWidget({ ownerStats, totalContacts }: Props) {
  const colors = useChartColors();
  const { owners, unassigned, totalAssigned, monthlyAssignments, monthlyCreated = [] } = ownerStats;

  const activeOwners = owners.length;
  const assignedPct = totalContacts > 0 ? ((totalAssigned / totalContacts) * 100).toFixed(1) : "0";
  const unassignedPct = totalContacts > 0 ? ((unassigned / totalContacts) * 100).toFixed(1) : "0";

  const totalCreatedLast12 = monthlyCreated.reduce((s, m) => s + m.count, 0);
  const totalAssignedLast12 = monthlyAssignments.reduce((s, m) => s + m.count, 0);
  const assignmentCoverage =
    totalCreatedLast12 > 0
      ? ((totalAssignedLast12 / totalCreatedLast12) * 100).toFixed(1)
      : "—";

  const peakMonth = monthlyCreated.reduce(
    (best, m) => (m.count > best.count ? m : best),
    { month: "", label: "—", count: 0 }
  );

  const kpis = [
    {
      label: "ASIGNADOS (TOTAL)",
      value: totalAssigned.toLocaleString("es-ES"),
      sub: `${assignedPct}% del total`,
    },
    {
      label: "SIN PROPIETARIO",
      value: unassigned.toLocaleString("es-ES"),
      sub: `${unassignedPct}% sin asignar`,
    },
    {
      label: "COBERTURA (12M)",
      value: assignmentCoverage !== "—" ? `${assignmentCoverage}%` : "—",
      sub: "asignados / creados",
    },
    {
      label: "PROPIETARIOS ACTIVOS",
      value: String(activeOwners),
      sub: "con ≥1 contacto",
    },
  ];

  // Alinear labels por mes (monthlyCreated puede llegar en distinto orden)
  const labels = monthlyAssignments.map((m) => m.label);
  const createdByMonth = new Map(monthlyCreated.map((m) => [m.month, m.count]));
  const assignedByMonth = new Map(monthlyAssignments.map((m) => [m.month, m.count]));

  // ── ECharts: barras agrupadas (creados vs asignados) ─────────────────────
  const chartOption = {
    backgroundColor: "transparent",
    legend: {
      top: 4,
      right: 8,
      textStyle: { color: colors.legendText, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
      data: ["Contactos creados", "Asignados a propietario"],
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      formatter: (params: { seriesName: string; name: string; value: number; color: string }[]) => {
        const lines = params
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span>
                <span>${p.seriesName}:</span>
                <strong>${p.value.toLocaleString("es-ES")}</strong>
              </div>`
          )
          .join("");
        return `<div style="font-weight:600;margin-bottom:4px">${params[0].name}</div>${lines}`;
      },
    },
    grid: { left: 8, right: 12, top: 36, bottom: 0, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabel, fontSize: 11, rotate: 30 },
    },
    yAxis: {
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
    series: [
      {
        name: "Contactos creados",
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { color: "#3b82f640", borderRadius: [3, 3, 0, 0] },
        emphasis: { itemStyle: { color: "#3b82f6" } },
        data: monthlyAssignments.map((m) => createdByMonth.get(m.month) ?? 0),
      },
      {
        name: "Asignados a propietario",
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { color: "#f97316", borderRadius: [3, 3, 0, 0] },
        emphasis: { itemStyle: { color: "#fb923c" } },
        data: monthlyAssignments.map((m) => assignedByMonth.get(m.month) ?? 0),
      },
    ],
  };

  const noData =
    monthlyAssignments.every((m) => m.count === 0) &&
    monthlyCreated.every((m) => m.count === 0);

  const chartHeight = 210;

  // ── Owner distribution ───────────────────────────────────────────────────
  const topOwners = owners.slice(0, 10);
  const maxCount = topOwners[0]?.contactCount ?? 1;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Asignación de propietarios a contactos</h3>

      {/* ── KPI header ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 divide-x divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-4 py-3 text-center">
            <p className="text-2xs text-gray-500 uppercase tracking-wider mb-1 leading-tight">
              {kpi.label}
            </p>
            <p className="text-xl font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-tight">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Gráfico de asignaciones mensuales ──────────────────────────── */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-medium text-gray-400">
            Contactos creados vs. asignados a propietario — últimos 12 meses
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Azul: nuevos contactos (<code className="text-gray-500">createdate</code>) · Naranja: asignados (<code className="text-gray-500">hubspot_owner_assigneddate</code>)
          </p>
        </div>
        {noData ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-sm px-4 pb-4">
            Sin datos en los últimos 12 meses
          </div>
        ) : (
          <ReactECharts
            option={chartOption}
            style={{ height: `${chartHeight}px` }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
          />
        )}
      </div>

      {/* ── Distribución por propietario ───────────────────────────────── */}
      {topOwners.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          {/* Cabecera */}
          <div className="grid grid-cols-[1fr_72px_72px] gap-0 px-4 py-2 border-b border-gray-800 bg-gray-800">
            <p className="text-2xs text-gray-600 uppercase tracking-wider font-medium">
              Propietario
            </p>
            <p className="text-2xs text-gray-600 uppercase tracking-wider font-medium text-right">
              Contactos
            </p>
            <p className="text-2xs text-gray-600 uppercase tracking-wider font-medium text-right">
              % del total
            </p>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-800/50">
            {topOwners.map((owner) => {
              const barPct = maxCount > 0 ? (owner.contactCount / maxCount) * 100 : 0;
              const totalPct =
                totalContacts > 0
                  ? ((owner.contactCount / totalContacts) * 100).toFixed(1)
                  : "0";
              return (
                <div
                  key={owner.ownerId}
                  className="grid grid-cols-[1fr_72px_72px] gap-0 px-4 py-2.5 items-center"
                >
                  {/* Nombre + barra */}
                  <div className="min-w-0 pr-4">
                    <p className="text-xs text-gray-300 truncate mb-1">{owner.ownerName}</p>
                    <div className="h-1.5 rounded-full bg-transparent">
                      <div
                        className="h-full rounded-full bg-brand/70 transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  {/* Contactos */}
                  <div className="text-right">
                    <span className="text-xs text-gray-300 font-medium tabular-nums">
                      {owner.contactCount.toLocaleString("es-ES")}
                    </span>
                  </div>
                  {/* Porcentaje */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500 tabular-nums">{totalPct}%</span>
                  </div>
                </div>
              );
            })}

            {/* Sin propietario */}
            {unassigned > 0 && (
              <div className="grid grid-cols-[1fr_72px_72px] gap-0 px-4 py-2.5 items-center">
                <div className="min-w-0 pr-4">
                  <p className="text-xs text-gray-500 italic mb-1">Sin propietario</p>
                  <div className="h-1.5 rounded-full bg-transparent">
                    <div
                      className="h-full rounded-full bg-gray-600/60 transition-all duration-500"
                      style={{
                        width: `${maxCount > 0 ? (unassigned / maxCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {unassigned.toLocaleString("es-ES")}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-600 tabular-nums">{unassignedPct}%</span>
                </div>
              </div>
            )}
          </div>

          {owners.length > 10 && (
            <div className="px-4 py-2 border-t border-gray-800/50">
              <p className="text-xs text-gray-600 text-center">
                Mostrando top 10 de {owners.length} propietarios
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
