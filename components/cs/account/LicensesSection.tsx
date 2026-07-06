"use client";

/**
 * components/cs/account/LicensesSection.tsx
 *
 * UTILIZACIÓN de la cuenta (HubSpot Partner): licencias asignadas vs límite por
 * hub + contactos de marketing. Barra por hub con marca del límite. Degrada a
 * "sin permiso de partner" cuando no hay snapshot.
 */
import SourceChip from "@/components/cs/SourceChip";
import type { AccountPartner } from "@/lib/cs/load-account";

const HUB_LABEL: Record<string, string> = { core: "Principales", sales: "Sales Hub", service: "Service Hub" };

function UsageBar({ used, limit, label, suffix }: { used: number | null; limit: number | null; label: string; suffix?: string }) {
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
        {used ?? "—"} / {limit ?? "—"}{suffix ?? ""}
      </span>
    </div>
  );
}

export default function LicensesSection({ partner }: { partner: AccountPartner | null }) {
  if (!partner) {
    return (
      <p className="text-xs text-fg-muted bg-surface-muted border border-dashed border-line rounded-lg px-3 py-2.5">
        Sin datos de partner para esta cuenta — falta autorizar el scope de Partner Clients en la app
        de HubSpot, o la cuenta no está vinculada a un partner client.
      </p>
    );
  }
  const seats = partner.seats ?? {};
  const hubs = Object.entries(seats).filter(([, v]) => v && (v.assigned !== null || v.limit !== null));
  const unusedTotal = hubs.reduce((sum, [, v]) => sum + (v.available ?? 0), 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <SourceChip label="HubSpot Partner" date={partner.fetchedAt} />
        {unusedTotal > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30">
            {unusedTotal} licencia{unusedTotal !== 1 ? "s" : ""} pagada{unusedTotal !== 1 ? "s" : ""} sin asignar
          </span>
        )}
      </div>
      {hubs.length === 0 && partner.marketingContactsLimit === null ? (
        <p className="text-xs text-fg-muted">El snapshot no trae datos de licencias para esta cuenta.</p>
      ) : (
        <div className="space-y-1.5">
          {hubs.map(([hub, v]) => (
            <UsageBar key={hub} label={HUB_LABEL[hub] ?? hub} used={v.assigned} limit={v.limit} />
          ))}
          {(partner.marketingContactsLimit !== null || partner.marketingContactsUsed !== null) && (
            <UsageBar label="Contactos mkt" used={partner.marketingContactsUsed} limit={partner.marketingContactsLimit} />
          )}
        </div>
      )}
    </div>
  );
}
