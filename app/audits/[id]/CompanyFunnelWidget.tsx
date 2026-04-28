"use client";

import type { LifecycleStageCount } from "@/lib/hubspot/portal-analyzer";
import { computeFunnel, fmtPct } from "@/lib/funnel";

const STAGE_COLORS: Record<string, string> = {
  lead:                   "#3b82f6",
  marketingqualifiedlead: "#8b5cf6",
  salesqualifiedlead:     "#ec4899",
  opportunity:            "#f97316",
  customer:               "#22c55e",
};

const FUNNEL_ORDER = [
  { value: "lead",                   label: "Lead" },
  { value: "marketingqualifiedlead", label: "MQL" },
  { value: "salesqualifiedlead",     label: "SQL" },
  { value: "opportunity",            label: "Oportunidad" },
  { value: "customer",               label: "Cliente" },
];

interface Props {
  companies: LifecycleStageCount[];
  totalCompanies: number;
}

export default function CompanyFunnelWidget({ companies, totalCompanies }: Props) {
  const funnelInputs = FUNNEL_ORDER.map((s) => {
    const found = companies.find((c) => c.value === s.value);
    return {
      value: s.value,
      label: s.label,
      count: found?.count ?? 0,
      color: STAGE_COLORS[s.value] ?? "#6b7280",
    };
  });
  const stagesWithData = funnelInputs.filter((s) => s.count > 0).length;

  const { steps, overallConversionPct } = computeFunnel(funnelInputs, totalCompanies);

  const leadCount     = companies.find((c) => c.value === "lead")?.count ?? 0;
  const mqlCount      = companies.find((c) => c.value === "marketingqualifiedlead")?.count ?? 0;
  const customerCount = companies.find((c) => c.value === "customer")?.count ?? 0;
  const leadToCustomer = leadCount > 0 ? (customerCount / leadCount) * 100 : 0;
  const mqlToCustomer  = mqlCount  > 0 ? (customerCount / mqlCount)  * 100 : 0;

  const topRow = {
    value: "__total__",
    label: "Todas las empresas",
    count: totalCompanies,
    color: "#4b5563",
    stepConversion: steps.length > 0 ? steps[0].cumulativeConversion : null,
    cumulativeConversion: 100,
    barPct: 100,
  };

  const allRows = [topRow, ...steps];

  const kpis = [
    {
      label: "CONV. TOTAL",
      sub: "empresas → clientes",
      value: customerCount > 0 ? fmtPct(overallConversionPct) : "—",
    },
    {
      label: "LEAD → CLIENTE",
      sub: leadCount > 0 ? `de ${leadCount.toLocaleString("es-ES")} leads` : "sin leads",
      value: leadCount > 0 ? fmtPct(leadToCustomer) : "—",
    },
    {
      label: "MQL → CLIENTE",
      sub: mqlCount > 0 ? `de ${mqlCount.toLocaleString("es-ES")} MQLs` : "sin MQLs",
      value: mqlCount > 0 ? fmtPct(mqlToCustomer) : "—",
    },
    {
      label: "ETAPAS CON DATOS",
      sub: "en el embudo de empresas",
      value: String(stagesWithData),
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Embudo de conversión de empresas</h3>

      {/* ── KPI header ─────────────────────────────────────────────────────── */}
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

      {/* ── Tabla de embudo ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {/* Cabecera de columnas */}
        <div className="grid grid-cols-[1fr_80px_96px_96px] gap-0 px-4 py-2.5 border-b border-gray-800 bg-gray-800 items-center">
          <p className="text-2xs text-gray-500 uppercase tracking-wider font-semibold">
            Próximo paso
          </p>
          <p className="text-2xs text-gray-500 uppercase tracking-wider font-semibold text-right">
            Total
          </p>
          <p className="text-2xs text-gray-500 uppercase tracking-wider font-semibold text-right">
            Conv. siguiente
          </p>
          <p className="text-2xs text-gray-500 uppercase tracking-wider font-semibold text-right">
            Conv. acumulativa
          </p>
        </div>

        {/* Filas del embudo */}
        <div className="divide-y divide-gray-800/50">
          {allRows.map((row, idx) => (
            <div
              key={row.value}
              className={`grid grid-cols-[1fr_80px_96px_96px] gap-0 px-4 py-3 items-center ${
                idx === 0 ? "bg-gray-800" : ""
              }`}
            >
              {/* Nombre + barra */}
              <div className="min-w-0 pr-4">
                <p className={`text-xs mb-1.5 ${idx === 0 ? "text-gray-400 font-medium" : "text-gray-400"}`}>
                  {row.label}
                </p>
                <div className="h-5 rounded overflow-hidden relative">
                  <div
                    className="h-full rounded flex items-center transition-all duration-700"
                    style={{
                      width: `${Math.max(row.barPct, row.barPct > 0 ? 1.5 : 0)}%`,
                      backgroundColor: row.color,
                      opacity: row.value === "__total__" ? 0.55 : 0.85,
                    }}
                  >
                    {row.barPct > 8 && (
                      <span className="text-2xs text-white/90 font-semibold pl-2 truncate whitespace-nowrap">
                        {row.count.toLocaleString("es-ES")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="text-right">
                <span className="text-xs text-gray-400 font-medium tabular-nums">
                  {row.count.toLocaleString("es-ES")}
                </span>
              </div>

              {/* Conversión al siguiente paso */}
              <div className="text-right">
                {row.stepConversion !== null ? (
                  <span className="text-xs text-gray-300 font-medium tabular-nums">
                    {fmtPct(row.stepConversion)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">—</span>
                )}
              </div>

              {/* Conversión acumulativa — legible en light y dark */}
              <div className="text-right">
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{
                    color:
                      row.value === "__total__"
                        ? "#9ca3af"
                        : row.value === "customer"
                        ? "#22c55e"
                        : "#6b7280",
                  }}
                >
                  {fmtPct(row.cumulativeConversion)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nota al pie */}
      <p className="text-xs text-gray-600 text-right">
        Tasas calculadas sobre empresas al momento de la captura · No incluye tiempo de transición entre etapas
      </p>
    </div>
  );
}
