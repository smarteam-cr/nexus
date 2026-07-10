"use client";

/**
 * components/cs/account/AccountView.tsx
 *
 * VISTA POR CUENTA de Customer Success: header (equipo HubSpot + frescura),
 * resumen ejecutivo citado, proyectos activos (salud+cronograma+operativa HS),
 * alertas del watchdog, utilización de licencias, adopción/uso y últimas minutas.
 * Cada sección declara su fuente (SourceChip) — la regla del módulo.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import SourceChip, { fmtChipDate } from "@/components/cs/SourceChip";
import AlertsFeed from "@/components/cs/AlertsFeed";
import ActiveProjectsSection from "./ActiveProjectsSection";
import AccountUsageReport from "./AccountUsageReport";
import AccountBriefSection from "./AccountBriefSection";
import type { CsAccountData } from "@/lib/cs/load-account";
import { PARTNER_STATE_META } from "@/lib/cs/partner-state";

function Section({ title, children, source }: { title: string; children: ReactNode; source?: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {source}
      </div>
      {children}
    </section>
  );
}

export default function AccountView({ data }: { data: CsAccountData }) {
  const p = data.partner;
  return (
    <div className="space-y-7">
      {/* Header de la cuenta */}
      <div className="bg-surface border border-line rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {p?.hsCsmName && (
          <span className="text-fg-secondary" title={p.hsCsmEmail ?? undefined}>
            <span className="text-fg-muted">CSM HubSpot: </span>{p.hsCsmName}
          </span>
        )}
        {p?.hsGrowthName && (
          <span className="text-fg-secondary" title={p.hsGrowthEmail ?? undefined}>
            <span className="text-fg-muted">Growth: </span>{p.hsGrowthName}
          </span>
        )}
        {p?.cslImplementaciones && (
          <span className="text-fg-secondary"><span className="text-fg-muted">CSL: </span>{p.cslImplementaciones}</span>
        )}
        {p?.country && <span className="text-fg-secondary">{p.country}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {data.partnerVisible &&
            (p ? (
              <SourceChip label="HubSpot Partner" date={p.fetchedAt} />
            ) : (
              // La CAUSA real del vacío (no_scope / never_synced / no_match), no un
              // texto ambiguo: la resuelve el loader contra cs-partner-sync-status.
              <SourceChip
                label={data.partnerState === "ok" ? "HubSpot Partner" : PARTNER_STATE_META[data.partnerState].chip}
                tone="missing"
              />
            ))}
          {data.signals && <SourceChip label="Señales" date={data.signals.fetchedAt} />}
          <Link href={`/clients/${data.clientId}`} className="text-[11px] font-medium text-brand hover:text-brand/80">
            Workspace →
          </Link>
        </span>
      </div>

      {/* Resumen ejecutivo citado */}
      <Section title="🧭 Resumen de la cuenta" source={<span className="text-[11px] text-fg-muted">generado por agente — cada afirmación cita su fuente</span>}>
        <div className="bg-surface border border-line rounded-xl p-4">
          <AccountBriefSection clientId={data.clientId} brief={data.brief} />
        </div>
      </Section>

      {/* Alertas del watchdog (reuso del feed) */}
      {data.alerts.length > 0 && (
        <Section title="🚨 Alertas de la cuenta">
          <AlertsFeed initialAlerts={data.alerts} />
        </Section>
      )}

      {/* Proyectos activos */}
      <Section title="📁 Proyectos activos">
        <ActiveProjectsSection projects={data.projects} projectOps={data.projectOps} />
      </Section>

      {/* Uso/licencias/MRR: CONFIDENCIAL (términos de partner) — solo CSL/SUPER_ADMIN.
          Una sola sección tipo REPORTE (antes eran dos cajas que duplicaban el dato). */}
      {data.partnerVisible && (
        <Section title="📊 Uso, adopción y licencias">
          <div className="bg-surface border border-line rounded-xl p-4">
            <AccountUsageReport partner={data.partner} partnerState={data.partnerState} />
          </div>
        </Section>
      )}

      {/* Últimas minutas (fuente citable) */}
      {data.minutes.length > 0 && (
        <Section title="📝 Últimas sesiones">
          <div className="space-y-2">
            {data.minutes.map((m) => (
              <div key={m.sessionId} className="bg-surface border border-line rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link href={`/sessions/${m.sessionId}`} className="text-xs font-semibold text-fg hover:text-brand truncate">
                    {m.sessionTitle}
                  </Link>
                  <SourceChip label="Minuta" date={m.date} title={new Date(m.date).toLocaleString("es-CR", { hour12: false })} />
                  <span className="text-[10px] text-fg-muted ml-auto whitespace-nowrap">{fmtChipDate(m.date)}</span>
                </div>
                {m.summary && <p className="text-[11px] text-fg-secondary mt-1.5 line-clamp-3">{m.summary}</p>}
                {m.risks.length > 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠ {m.risks.map((r) => r.text).slice(0, 2).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
