"use client";

/**
 * components/cs/ExpansionSection.tsx
 *
 * Renovaciones próximas (≤90 días) y expansión abierta por cliente, desde el
 * snapshot de señales HubSpot (ClientCsSignals.deals). Proactividad comercial
 * de la líder de CS: preparar renovaciones, empujar expansión.
 */
import Link from "next/link";
import type { ClientSignalsRow } from "@/lib/cs/load-panel";

interface DealLite {
  id?: string;
  name?: string;
  amount?: string | null;
  closedate?: string | null;
  pipeline?: string | null;
}

function fmtMoney(a: string | number | null | undefined): string {
  const n = typeof a === "string" ? parseFloat(a) : (a ?? 0);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `$${n.toLocaleString("en-US")}`;
}

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "sin fecha";
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function ExpansionSection({
  signalsByClient,
  clientNames,
}: {
  signalsByClient: Record<string, ClientSignalsRow>;
  clientNames: Record<string, string>;
}) {
  const rows: { clientId: string; clientName: string; kind: "renewal" | "expansion"; deal: DealLite }[] = [];
  for (const [clientId, s] of Object.entries(signalsByClient)) {
    // clientNames viene de la cartera+alertas; el snapshot trae su propio nombre
    // como respaldo (cliente con señales pero sin proyecto activo ni alertas).
    const clientName = clientNames[clientId] ?? s.clientName ?? clientId;
    const deals = s.deals as { renewals?: DealLite[]; expansion?: DealLite[] } | null;
    for (const d of deals?.renewals ?? []) {
      const days = daysUntil(d.closedate);
      if (days !== null && days <= 90) rows.push({ clientId, clientName, kind: "renewal", deal: d });
    }
    for (const d of deals?.expansion ?? []) rows.push({ clientId, clientName, kind: "expansion", deal: d });
  }
  rows.sort((a, b) => (a.deal.closedate ?? "9999").localeCompare(b.deal.closedate ?? "9999"));

  if (rows.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-fg">📈 Expansión y renovaciones</h2>
        <span className="text-[11px] text-fg-muted">{rows.length} deal{rows.length !== 1 ? "s" : ""} en juego (próximos 90 días)</span>
      </div>
      <div className="bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
        {rows.map(({ clientId, clientName, kind, deal }, i) => {
          const days = daysUntil(deal.closedate);
          return (
            <div key={`${deal.id ?? i}`} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
                  kind === "renewal"
                    ? "text-purple-600 bg-purple-500/10 border-purple-500/30"
                    : "text-emerald-600 bg-emerald-500/10 border-emerald-500/25"
                }`}
              >
                {kind === "renewal" ? "🔄 Renovación" : "📈 Expansión"}
              </span>
              <Link href={`/clients/${clientId}`} className="text-xs font-semibold text-fg hover:text-brand">
                {clientName}
              </Link>
              <span className="text-xs text-fg-secondary truncate">{deal.name ?? "Deal"}</span>
              <span className="ml-auto flex items-center gap-3 flex-shrink-0">
                <span className="text-xs font-semibold text-fg">{fmtMoney(deal.amount)}</span>
                <span className={`text-[11px] ${days !== null && days <= 30 ? "text-red-600 font-medium" : "text-fg-muted"}`}>
                  {fmtDate(deal.closedate)}
                  {days !== null && days >= 0 && ` (${days} días)`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
