"use client";

/**
 * components/cs/account/AccountAdoptionSection.tsx
 *
 * ADOPCIÓN/USO de la cuenta (HubSpot Partner): UUS + score por hub + tendencia,
 * señal de ingresos con su explicación (oportunidad de expansión), renovaciones
 * y MRR. Todo con su chip de fuente.
 */
import SourceChip from "@/components/cs/SourceChip";
import { usageScoreColor } from "@/components/cs/dashboard/chart-theme";
import type { AccountPartner } from "@/lib/cs/load-account";

function fmtMoney(n: number | null): string {
  // $0 es un DATO (MRR cero), no un faltante — solo null/no-finito son "—".
  if (n === null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-center" style={{ backgroundColor: usageScoreColor(value) }}>
      <p className="text-lg font-bold text-fg leading-tight">{value ?? "—"}</p>
      <p className="text-[10px] text-fg-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default function AccountAdoptionSection({ partner }: { partner: AccountPartner | null }) {
  if (!partner) return null; // LicensesSection ya muestra el estado degradado

  const trend = partner.uusTrend;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Score label="UUS" value={partner.uusScore} />
        <Score label="Marketing" value={partner.marketingScore} />
        <Score label="Sales" value={partner.salesScore} />
        <Score label="Service" value={partner.serviceScore} />
        <div className="rounded-lg border border-line px-3 py-2 text-center bg-surface-muted">
          <p className={`text-lg font-bold leading-tight ${trend === null ? "text-fg-muted" : trend < -0.02 ? "text-red-600" : trend > 0.02 ? "text-emerald-600" : "text-fg"}`}>
            {trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(2)}`}
          </p>
          <p className="text-[10px] text-fg-muted uppercase tracking-wide">Tend. 4 sem</p>
        </div>
      </div>

      {/* Componentes del UUS (managed only — aparecen al autorizar el scope) */}
      {(partner.activationScore !== null || partner.toolUsageScore !== null ||
        partner.valueMetricsScore !== null || partner.consumptionScore !== null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Score label="Activación" value={partner.activationScore} />
          <Score label="Uso de herram." value={partner.toolUsageScore} />
          <Score label="Métricas de valor" value={partner.valueMetricsScore} />
          <Score label="Consumo" value={partner.consumptionScore} />
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-fg-secondary">
        <span>Renovación: <strong className="text-fg">{fmtDate(partner.nextRenewalAt)}</strong></span>
        <span>MRR total: <strong className="text-fg">{fmtMoney(partner.mrrTotal)}</strong></span>
        <span>MRR por renovar: <strong className="text-fg">{fmtMoney(partner.mrrUpForRenewal)}</strong></span>
        {partner.managedExpiryAt && <span>Relación gestionada vence: <strong className="text-fg">{fmtDate(partner.managedExpiryAt)}</strong></span>}
        <SourceChip label="HubSpot Partner" date={partner.fetchedAt} />
      </div>

      {partner.cancellationHubs && (
        <p className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
          ⚠ Cancelación próxima registrada por HubSpot: {partner.cancellationHubs}
        </p>
      )}
      {partner.revenueSignal && (
        <div className="text-[11px] bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
          <span className="font-medium text-emerald-600">📈 Señal de ingresos: {partner.revenueSignal}</span>
          {partner.revenueSignalDetail && (
            <p className="text-fg-secondary mt-1 whitespace-pre-line">{partner.revenueSignalDetail.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()}</p>
          )}
        </div>
      )}
      {partner.activeProducts && (
        <p className="text-[11px] text-fg-muted">Productos activos: {partner.activeProducts.split(";").map((s) => s.trim()).join(" · ")}</p>
      )}
    </div>
  );
}
