"use client";

/**
 * components/cs/dashboard/AdoptionSection.tsx
 *
 * Adopción y uso en DOS niveles:
 *   1. estado_de_adopcion por PROYECTO (0-970 — llenado por el CSE): mini-barras.
 *   2. Uso real por CUENTA (Partner Clients de HubSpot): tabla-heatmap con UUS,
 *      score por hub, tendencia 4 semanas, renovación y MRR. Si el scope de
 *      partner no está autorizado, muestra el estado degradado.
 */
import Link from "next/link";
import SourceChip, { fmtChipDate } from "@/components/cs/SourceChip";
import { ADOPTION_META, usageScoreColor } from "./chart-theme";
import { isStale, STALE_AFTER_DAYS } from "@/lib/cs/partner-state";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

function fmtMoney(n: number | null): string {
  // $0 es un DATO (MRR cero), no un faltante — solo null/no-finito son "—".
  if (n === null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "2-digit" }) : "—";
}
function TrendArrow({ trend }: { trend: number | null }) {
  if (trend === null) return <span className="text-fg-muted">—</span>;
  if (trend > 0.02) return <span className="text-emerald-600" title={`+${trend.toFixed(2)}`}>↑</span>;
  if (trend < -0.02) return <span className="text-red-600" title={trend.toFixed(2)}>↓</span>;
  return <span className="text-fg-muted" title={trend.toFixed(2)}>→</span>;
}
function ScoreCell({ score }: { score: number | null }) {
  return (
    <td className="px-2 py-1.5 text-center text-xs font-medium text-fg" style={{ backgroundColor: usageScoreColor(score) }}>
      {score ?? "—"}
    </td>
  );
}

export default function AdoptionSection({
  adoptionStates,
  adoption,
  adoptionNoData,
  freshness,
  partnerVisible,
}: {
  adoptionStates: CsDashboardData["adoptionStates"];
  adoption: CsDashboardData["adoption"];
  adoptionNoData: CsDashboardData["adoptionNoData"];
  freshness: CsDashboardData["freshness"];
  /** Uso/UUS por cuenta es confidencial (términos de partner): solo CSL/SUPER_ADMIN.
   *  El estado de adopción POR PROYECTO (0-970, lo llena el CSE) sí es visible. */
  partnerVisible: boolean;
}) {
  const totalProjects = adoptionStates.reduce((s, a) => s + a.count, 0);
  const sortedStates = [...adoptionStates].sort(
    (a, b) => (ADOPTION_META[a.state]?.order ?? 9) - (ADOPTION_META[b.state]?.order ?? 9),
  );

  return (
    <div className="space-y-4">
      {/* Nivel 1: estado de adopción por proyecto (lo llena el CSE en HubSpot) */}
      {totalProjects > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wide">Estado de adopción por proyecto</span>
            <SourceChip label="HubSpot" date={freshness.stageSyncedAt} />
          </div>
          <div className="flex h-3 rounded-full overflow-hidden border border-line">
            {sortedStates.map((s) => (
              <div
                key={s.state}
                title={`${s.state}: ${s.count}`}
                style={{ width: `${(s.count / totalProjects) * 100}%`, backgroundColor: ADOPTION_META[s.state]?.color ?? "#374151" }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {sortedStates.map((s) => (
              <span key={s.state} className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ADOPTION_META[s.state]?.color ?? "#374151" }} />
                {s.state}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Nivel 2: uso real por cuenta (Partner Clients) — CONFIDENCIAL */}
      {partnerVisible && (
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wide">Uso por cuenta (HubSpot Partner)</span>
          {freshness.partnerSupported ? (
            <SourceChip label="HubSpot Partner" date={freshness.partnerFetchedAt} staleAfterDays={STALE_AFTER_DAYS.partner} />
          ) : (
            <SourceChip label="sin permiso de partner" tone="missing" />
          )}
        </div>
        {!freshness.partnerSupported ? (
          <p className="text-xs text-fg-muted bg-surface-muted border border-dashed border-line rounded-lg px-3 py-2.5">
            El scope del objeto Partner Clients no está autorizado en la app de HubSpot. Al re-autorizarla,
            acá aparecen la calificación de uso (UUS), puntuación por hub, tendencia, licencias y renovaciones de cada cuenta.
          </p>
        ) : adoption.length === 0 ? (
          <p className="text-xs text-fg-muted">
            {freshness.lastSyncAt
              ? `El último sync trajo ${freshness.lastSyncTotal ?? "?"} cuentas de partner, pero ninguna está vinculada a clientes visibles para vos.`
              : "Sin snapshots de partner todavía — corré «Actualizar partner»."}
          </p>
        ) : (
          <div className="space-y-2">
            {/* Cuentas SIN datos ARRIBA — la cuenta nunca onboardeada es probablemente
                la de mayor riesgo; antes ni aparecía (sesgo de supervivencia). */}
            {adoptionNoData.length > 0 && (
              <div className="text-[11px] bg-surface-muted border border-dashed border-line rounded-lg px-3 py-2">
                <span className="font-semibold text-fg-secondary uppercase tracking-wide text-[10px]">
                  Sin datos de uso ({adoptionNoData.length})
                </span>
                <span className="text-fg-muted"> — activas sin partner client vinculado: </span>
                {adoptionNoData.map((c, i) => (
                  <span key={c.clientId}>
                    {i > 0 && " · "}
                    <Link href={`/customer-success/${c.clientId}`} className="text-fg hover:text-brand font-medium">
                      {c.clientName}
                    </Link>
                  </span>
                ))}
              </div>
            )}
            <div className="overflow-x-auto border border-line rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-fg-muted bg-surface-muted">
                  <th className="px-2 py-1.5 font-medium">Cuenta</th>
                  <th className="px-2 py-1.5 font-medium text-center" title="Calificación de uso unificada">UUS</th>
                  <th className="px-2 py-1.5 font-medium text-center">Mkt</th>
                  <th className="px-2 py-1.5 font-medium text-center">Sales</th>
                  <th className="px-2 py-1.5 font-medium text-center">Service</th>
                  <th className="px-2 py-1.5 font-medium text-center" title="Tendencia últimas 4 semanas">Tend.</th>
                  <th className="px-2 py-1.5 font-medium">Renovación</th>
                  <th className="px-2 py-1.5 font-medium text-right">MRR</th>
                  <th className="px-2 py-1.5 font-medium text-right" title="Cuándo se sincronizó ESTA cuenta">Datos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {adoption.map((a) => (
                  <tr key={a.clientId} className="hover:bg-surface-muted/60">
                    <td className="px-2 py-1.5 text-xs">
                      <Link href={`/customer-success/${a.clientId}`} className="font-medium text-fg hover:text-brand">
                        {a.clientName}
                      </Link>
                    </td>
                    <ScoreCell score={a.uusScore} />
                    <ScoreCell score={a.marketingScore} />
                    <ScoreCell score={a.salesScore} />
                    <ScoreCell score={a.serviceScore} />
                    <td className="px-2 py-1.5 text-center text-sm"><TrendArrow trend={a.trend} /></td>
                    <td className="px-2 py-1.5 text-[11px] text-fg-secondary whitespace-nowrap">{fmtDate(a.nextRenewalAt)}</td>
                    <td className="px-2 py-1.5 text-[11px] text-fg text-right whitespace-nowrap">{fmtMoney(a.mrrTotal)}</td>
                    {/* Frescura POR FILA: el chip global usa el máximo — si una cuenta
                        sincronizó hoy y otra hace 2 meses, "toda la tabla decía hoy". */}
                    <td
                      className={`px-2 py-1.5 text-[10px] text-right whitespace-nowrap ${
                        isStale(a.fetchedAt, STALE_AFTER_DAYS.partner, new Date()) || a.fetchStatus === "partial"
                          ? "text-amber-600 font-medium"
                          : "text-fg-muted"
                      }`}
                      title={a.fetchStatus === "partial" ? "Última corrida parcial (sin asociaciones)" : undefined}
                    >
                      {fmtChipDate(a.fetchedAt) ?? "—"}
                      {a.fetchStatus === "partial" && " ⚠"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
