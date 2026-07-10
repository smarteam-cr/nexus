"use client";

/**
 * components/cs/account/AccountUsageReport.tsx
 *
 * USO, ADOPCIÓN Y LICENCIAS de la cuenta (HubSpot Partner) en formato REPORTE:
 * una sola sección (reemplaza a LicensesSection + AccountAdoptionSection, que
 * duplicaban encabezados y partían el mismo dato en dos cajas).
 *
 *  - Tiles GRANDES: UUS + puntaje por hub (incl. Commerce, que viajaba hasta el
 *    DTO y nadie pintaba) + tendencia 4 semanas. Cada tile lleva una explicación
 *    FIJA en palabras simples (constante local — no generada por IA).
 *  - Licencias: barras assigned/limit por hub + contactos de marketing.
 *  - Negocio: MRR (total/gestionado/por renovar), renovación próxima y por hub,
 *    ediciones contratadas por hub, vencimiento de la relación gestionada.
 *  - Señales: cancelación próxima y señal de ingresos con su explicación.
 *
 * Sin datos, muestra la CAUSA real (partnerState): scope sin autorizar / sync
 * nunca corrido / cuenta sin partner client — no el texto ambiguo de antes.
 *
 * Colores de score: usageScoreColor COMPARTIDO con el heatmap del panel general
 * (chart-theme). No modificar sus umbrales desde acá — cambiaría ambas vistas.
 * CONFIDENCIAL (términos de partner): la monta AccountView solo si partnerVisible.
 */
import SourceChip from "@/components/cs/SourceChip";
import { usageScoreColor } from "@/components/cs/dashboard/chart-theme";
import { PARTNER_STATE_META, STALE_AFTER_DAYS, type PartnerState } from "@/lib/cs/partner-state";
import type { AccountPartner } from "@/lib/cs/load-account";

function fmtMoney(n: number | null): string {
  // $0 es un DATO (MRR cero), no un faltante — solo null/no-finito son "—".
  if (n === null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/** Explicación fija de cada puntaje — texto curado, NO lo redacta la IA. */
const SCORE_EXPLAIN: Record<string, string> = {
  uus: "Uso combinado de toda la plataforma que HubSpot compara con cuentas similares (0–100).",
  marketing: "Adopción de Marketing Hub frente a cuentas similares (0–100).",
  sales: "Adopción de Sales Hub frente a cuentas similares (0–100).",
  service: "Adopción de Service Hub frente a cuentas similares (0–100).",
  commerce: "Adopción de Commerce Hub frente a cuentas similares (0–100).",
  trend: "Cambio del UUS en las últimas 4 semanas — negativo = el uso viene cayendo.",
};

const HUB_LABEL: Record<string, string> = { core: "Principales", sales: "Sales Hub", service: "Service Hub" };
const EDITION_HUB: Record<string, string> = {
  marketing: "Marketing", sales: "Sales", service: "Service", ops: "Ops", content: "Content", commerce: "Commerce",
};
const RENEWAL_HUB: Record<string, string> = { marketing: "Marketing", sales: "Sales", service: "Service", ops: "Ops" };

function BigScore({ label, value, explain }: { label: string; value: number | null; explain: string }) {
  return (
    <div
      className="rounded-xl border border-line px-3 py-3 text-center flex flex-col justify-between gap-1"
      style={{ backgroundColor: usageScoreColor(value) }}
    >
      <p className="text-3xl font-bold text-fg leading-none">{value !== null ? Math.round(value) : "—"}</p>
      <div>
        <p className="text-[11px] font-semibold text-fg uppercase tracking-wide">{label}</p>
        <p className="text-[10px] text-fg-muted leading-snug mt-0.5">{explain}</p>
      </div>
    </div>
  );
}

function UsageBar({ used, limit, label }: { used: number | null; limit: number | null; label: string }) {
  if (used === null && limit === null) return null;
  const pct = used !== null && limit ? Math.min(100, (used / limit) * 100) : 0;
  const full = pct >= 95;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-fg-secondary w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden">
        <div className={`h-full rounded-full ${full ? "bg-red-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-fg w-24 text-right flex-shrink-0">
        {used ?? "—"} / {limit ?? "—"}
      </span>
    </div>
  );
}

export default function AccountUsageReport({
  partner,
  partnerState,
}: {
  partner: AccountPartner | null;
  partnerState: PartnerState;
}) {
  if (!partner) {
    const meta = partnerState === "ok" ? null : PARTNER_STATE_META[partnerState];
    return (
      <p className="text-xs text-fg-muted bg-surface-muted border border-dashed border-line rounded-lg px-3 py-2.5">
        {meta?.message ?? "Sin datos de partner para esta cuenta."}
      </p>
    );
  }

  const seats = partner.seats ?? {};
  const hubs = Object.entries(seats).filter(([, v]) => v && (v.assigned !== null || v.limit !== null));
  const unusedTotal = hubs.reduce((sum, [, v]) => sum + (v.available ?? 0), 0);
  const trend = partner.uusTrend;
  const editions = Object.entries(partner.hubEditions ?? {}).filter(([, e]) => e && e !== "none");
  const renewalsByHub = Object.entries(partner.renewalsByHub ?? {}).filter(([, d]) => d);

  return (
    <div className="space-y-4">
      {/* Procedencia + estado de la corrida + acceso directo al portal */}
      <div className="flex flex-wrap items-center gap-2">
        <SourceChip label="HubSpot Partner" date={partner.fetchedAt} staleAfterDays={STALE_AFTER_DAYS.partner} />
        {partner.fetchStatus === "partial" && (
          <SourceChip label="corrida parcial — sin asociaciones" tone="stale" title="El último sync no pudo leer las asociaciones a companies; los datos son válidos pero el matching no se actualizó." />
        )}
        {unusedTotal > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30">
            {unusedTotal} licencia{unusedTotal !== 1 ? "s" : ""} pagada{unusedTotal !== 1 ? "s" : ""} sin asignar
          </span>
        )}
        {partner.portalLink && (
          <a
            href={partner.portalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] font-medium text-brand hover:text-brand/80"
          >
            Abrir en HubSpot →
          </a>
        )}
      </div>

      {/* Puntajes tipo reporte: números grandes + explicación fija */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <BigScore label="UUS" value={partner.uusScore} explain={SCORE_EXPLAIN.uus} />
        <BigScore label="Marketing" value={partner.marketingScore} explain={SCORE_EXPLAIN.marketing} />
        <BigScore label="Sales" value={partner.salesScore} explain={SCORE_EXPLAIN.sales} />
        <BigScore label="Service" value={partner.serviceScore} explain={SCORE_EXPLAIN.service} />
        <BigScore label="Commerce" value={partner.commerceScore} explain={SCORE_EXPLAIN.commerce} />
        <div className="rounded-xl border border-line px-3 py-3 text-center flex flex-col justify-between gap-1 bg-surface-muted">
          <p
            className={`text-3xl font-bold leading-none ${
              trend === null ? "text-fg-muted" : trend < -0.02 ? "text-red-600" : trend > 0.02 ? "text-emerald-600" : "text-fg"
            }`}
          >
            {trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(2)}`}
          </p>
          <div>
            <p className="text-[11px] font-semibold text-fg uppercase tracking-wide">Tend. 4 sem</p>
            <p className="text-[10px] text-fg-muted leading-snug mt-0.5">{SCORE_EXPLAIN.trend}</p>
          </div>
        </div>
      </div>

      {/* Licencias (absorbe la sección "Utilización de licencias") */}
      {(hubs.length > 0 || partner.marketingContactsLimit !== null || partner.marketingContactsUsed !== null) && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wide">Licencias</p>
          {hubs.map(([hub, v]) => (
            <UsageBar key={hub} label={HUB_LABEL[hub] ?? hub} used={v.assigned} limit={v.limit} />
          ))}
          {(partner.marketingContactsLimit !== null || partner.marketingContactsUsed !== null) && (
            <UsageBar label="Contactos mkt" used={partner.marketingContactsUsed} limit={partner.marketingContactsLimit} />
          )}
        </div>
      )}

      {/* Negocio: MRR + renovaciones + ediciones */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-fg-secondary">
        <span>MRR total: <strong className="text-fg">{fmtMoney(partner.mrrTotal)}</strong></span>
        {partner.mrrManaged !== null && <span>MRR gestionado: <strong className="text-fg">{fmtMoney(partner.mrrManaged)}</strong></span>}
        <span>MRR por renovar: <strong className="text-fg">{fmtMoney(partner.mrrUpForRenewal)}</strong></span>
        <span>Renovación: <strong className="text-fg">{fmtDate(partner.nextRenewalAt)}</strong></span>
        {partner.managedExpiryAt && <span>Relación gestionada vence: <strong className="text-fg">{fmtDate(partner.managedExpiryAt)}</strong></span>}
      </div>
      {renewalsByHub.length > 0 && (
        <p className="text-[11px] text-fg-muted">
          Renovación por hub: {renewalsByHub.map(([hub, d]) => `${RENEWAL_HUB[hub] ?? hub} ${fmtDate(d)}`).join(" · ")}
        </p>
      )}
      {editions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {editions.map(([hub, ed]) => (
            <span key={hub} className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-fg-secondary bg-surface-muted border-line">
              {EDITION_HUB[hub] ?? hub}: {ed}
            </span>
          ))}
        </div>
      )}

      {/* Señales */}
      {partner.cancellationHubs && (
        <p className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
          ⚠ Cancelación próxima registrada por HubSpot: {partner.cancellationHubs}
        </p>
      )}
      {partner.revenueSignal && (
        <div className="text-[11px] bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
          <span className="font-medium text-emerald-600">📈 Señal de ingresos: {partner.revenueSignal}</span>
          {partner.revenueSignalDetail && (
            <p className="text-fg-secondary mt-1 whitespace-pre-line">
              {partner.revenueSignalDetail.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()}
            </p>
          )}
        </div>
      )}
      {partner.activeProducts && (
        <p className="text-[11px] text-fg-muted">
          Productos activos: {partner.activeProducts.split(";").map((s) => s.trim()).join(" · ")}
        </p>
      )}
    </div>
  );
}
