"use client";

/**
 * components/cs/dashboard/KpiCards.tsx
 *
 * Contadores de decisión del dashboard CS — cada uno con su FUENTE explícita
 * (chip): "atrasado según HubSpot" (hs_status) NO es lo mismo que "atrasado
 * según cronograma" (fases/tareas vencidas en Nexus).
 */
import SourceChip from "@/components/cs/SourceChip";
import { STALE_AFTER_DAYS } from "@/lib/cs/partner-state";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

export default function KpiCards({
  counters,
  freshness,
  partnerVisible,
}: {
  counters: CsDashboardData["counters"];
  freshness: CsDashboardData["freshness"];
  /** Datos de partner (renovaciones/MRR) son confidenciales: solo CSL/SUPER_ADMIN. */
  partnerVisible: boolean;
}) {
  const cards: Array<{
    value: string;
    /** Detalle bajo el número (ej. el desglose HIGH o el conteo de renovaciones). */
    detail?: string | null;
    label: string;
    tone: string;
    source: { label: string; date?: string | null; missing?: boolean; staleAfterDays?: number };
  }> = [
    {
      value: String(counters.delayedHs),
      label: "Retrasados / en riesgo",
      tone: "text-red-600 border-red-500/25 bg-red-500/5",
      source: { label: "HubSpot", date: freshness.stageSyncedAt, staleAfterDays: STALE_AFTER_DAYS.stageSync },
    },
    {
      value: String(counters.overdueTimeline),
      label: "Atrasados según cronograma",
      tone: "text-amber-600 border-amber-500/30 bg-amber-500/5",
      source: { label: "Cronograma Nexus" },
    },
    {
      value: String(counters.blocked),
      label: "Bloqueados",
      tone: "text-orange-600 border-orange-500/25 bg-orange-500/5",
      source: { label: "HubSpot", date: freshness.stageSyncedAt, staleAfterDays: STALE_AFTER_DAYS.stageSync },
    },
    {
      value: String(counters.openAlerts),
      // Las HIGH son lo único que dispara acción esta semana — van visibles, no
      // enterradas en el total.
      detail: counters.openAlertsHigh > 0 ? `${counters.openAlertsHigh} alta${counters.openAlertsHigh !== 1 ? "s" : ""}` : null,
      label: "Alertas abiertas",
      tone: counters.openAlertsHigh > 0 ? "text-red-600 border-red-500/25 bg-red-500/5" : "text-fg border-line bg-surface",
      source: { label: "Watchdog IA" },
    },
    // Card de partner (confidencial) — solo para roles con acceso. "$ en riesgo"
    // (suma de mrrUpForRenewal ≤90d) en vez del conteo: el monto es lo accionable.
    ...(partnerVisible
      ? [{
          value: counters.renewalsMrr90d > 0 ? `$${Math.round(counters.renewalsMrr90d).toLocaleString("en-US")}` : String(counters.renewals90d),
          detail: counters.renewalsMrr90d > 0
            ? `${counters.renewals90d} renovación${counters.renewals90d !== 1 ? "es" : ""} ≤90 días`
            : null,
          label: counters.renewalsMrr90d > 0 ? "MRR por renovar ≤90 días" : "Renovaciones ≤90 días",
          tone: "text-purple-600 border-purple-500/25 bg-purple-500/5",
          source: freshness.partnerSupported
            ? { label: "HubSpot Partner", date: freshness.partnerFetchedAt, staleAfterDays: STALE_AFTER_DAYS.partner }
            : { label: "sin datos de partner", missing: true },
        }]
      : []),
  ];

  return (
    <div className={`grid grid-cols-2 gap-3 ${partnerVisible ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.tone}`}>
          <p className="text-2xl font-bold leading-tight">
            {c.value}
            {c.detail && <span className="text-xs font-semibold opacity-80 ml-1.5">· {c.detail}</span>}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide mt-0.5 opacity-90">{c.label}</p>
          <div className="mt-1.5">
            <SourceChip
              label={c.source.label}
              date={c.source.date}
              tone={c.source.missing ? "missing" : "ok"}
              staleAfterDays={c.source.staleAfterDays}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
