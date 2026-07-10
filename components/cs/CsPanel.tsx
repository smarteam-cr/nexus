"use client";

/**
 * components/cs/CsPanel.tsx
 *
 * Orquestador del panel de Éxito del cliente:
 *   1. Feed de alertas del watchdog (arriba — lo primero que ve la líder).
 *   2. Expansión y renovaciones (proactividad comercial).
 *   3. Buckets de salud de la cartera (PortfolioGrid REUSADO tal cual) con
 *      chips de señales HubSpot por cliente.
 * Header con "Actualizar señales" (refresh HubSpot) y "Correr watchdog" (dev/manual).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import PortfolioGrid from "@/components/dashboard/PortfolioGrid";
import AlertsFeed from "./AlertsFeed";
import ExpansionSection from "./ExpansionSection";
import type { CsPanelData, ClientSignalsRow } from "@/lib/cs/load-panel";

const DAY_MS = 86_400_000;
const COLD_DAYS = 21;

function SignalChips({ s }: { s: ClientSignalsRow | undefined }) {
  if (!s) return null;
  const chips: { label: string; cls: string; title: string }[] = [];
  const coldDays = s.lastEngagementAt
    ? Math.floor((Date.now() - new Date(s.lastEngagementAt).getTime()) / DAY_MS)
    : null;
  if (coldDays !== null && coldDays > COLD_DAYS) {
    chips.push({ label: `🧊 ${coldDays}d`, cls: "text-sky-600 bg-sky-500/10 border-sky-500/30", title: `Sin contacto hace ${coldDays} días` });
  }
  if (s.ticketsSupported && (s.openTicketCount ?? 0) > 0) {
    chips.push({ label: `🎫 ${s.openTicketCount}`, cls: "text-amber-600 bg-amber-500/10 border-amber-500/30", title: `${s.openTicketCount} tickets de soporte abiertos` });
  }
  if (s.nextRenewalCloseAt) {
    const days = Math.ceil((new Date(s.nextRenewalCloseAt).getTime() - Date.now()) / DAY_MS);
    if (days <= 90) {
      chips.push({ label: `🔄 ${days}d`, cls: "text-purple-600 bg-purple-500/10 border-purple-500/30", title: `Renovación en ${days} días` });
    }
  }
  if ((s.openExpansionAmount ?? 0) > 0) {
    chips.push({ label: "📈", cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25", title: `Expansión abierta: $${s.openExpansionAmount?.toLocaleString("en-US")}` });
  }
  if (chips.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {chips.map((c) => (
        <span key={c.label} title={c.title} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap normal-case ${c.cls}`}>
          {c.label}
        </span>
      ))}
    </span>
  );
}

export default function CsPanel({
  data,
  canSyncPartner = false,
}: {
  data: CsPanelData;
  /** El sync de partner (datos confidenciales) solo lo disparan CSL/SUPER_ADMIN. */
  canSyncPartner?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [syncingPartner, setSyncingPartner] = useState(false);

  const clientNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of data.rows) m[r.clientId] = r.clientCompany || r.clientName;
    for (const a of data.alerts) if (!m[a.clientId]) m[a.clientId] = a.clientName;
    return m;
  }, [data.rows, data.alerts]);

  const oldestFetch = useMemo(() => {
    const dates = Object.values(data.signalsByClient).map((s) => s.fetchedAt).sort();
    return dates[0] ?? null;
  }, [data.signalsByClient]);

  async function refreshSignals() {
    setRefreshing(true);
    toast.info("Actualizando señales de HubSpot… puede tardar un par de minutos.");
    try {
      const r = await fetchJson<{ refreshed: unknown[]; skippedFresh: number; failed: unknown[] }>(
        "/api/cs/signals/refresh",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      toast.success(`Señales actualizadas: ${r.refreshed.length} clientes (${r.skippedFresh} ya frescos).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron actualizar las señales.");
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshPartner() {
    setSyncingPartner(true);
    toast.info("Sincronizando Partner Clients de HubSpot…");
    try {
      const r = await fetchJson<{ supported: boolean; total: number; createdClients: unknown[] }>(
        "/api/cs/partner/refresh",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      if (!r.supported) {
        toast.error("El scope de Partner Clients no está autorizado en la app de HubSpot — hay que re-autorizarla.", { duration: 0 });
      } else {
        toast.success(`Partner: ${r.total} cuentas sincronizadas${r.createdClients.length ? ` (${r.createdClients.length} clientes nuevos)` : ""}.`);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "El sync de partner falló.");
    } finally {
      setSyncingPartner(false);
    }
  }

  async function runWatchdog() {
    setRunning(true);
    toast.info("Corriendo el watchdog… tria los proyectos con novedades.");
    try {
      const r = await fetchJson<{ ran: number; candidates: number }>("/api/cs/watchdog/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast.success(`Watchdog: ${r.ran} de ${r.candidates} proyectos con novedades triados.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "El watchdog falló.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* Acciones del panel */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        <button
          onClick={refreshSignals}
          disabled={refreshing}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {refreshing ? "Actualizando…" : "↻ Actualizar señales de HubSpot"}
        </button>
        {canSyncPartner && (
          <button
            onClick={refreshPartner}
            disabled={syncingPartner}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            {syncingPartner ? "Sincronizando…" : "🤝 Actualizar partner"}
          </button>
        )}
        <button
          onClick={runWatchdog}
          disabled={running}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {running ? "Corriendo…" : "🐕 Correr watchdog"}
        </button>
        {oldestFetch && (
          <span className="text-[11px] text-fg-muted">
            {/* hour12: false — mismo motivo que SourceChip: sin esto, el marcador
                a.m./p.m. puede diferir en el espacio Unicode entre servidor y
                cliente (ICU distinto) y rompe la hidratación aunque se vea igual. */}
            señales de HubSpot al {new Date(oldestFetch).toLocaleDateString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
      </div>

      {/* 1. Alertas del watchdog */}
      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-fg">🚨 Alertas</h2>
          <span className="text-[11px] text-fg-muted">triadas por el watchdog — severidad, razón y acción sugerida</span>
        </div>
        <AlertsFeed initialAlerts={data.alerts} />
      </section>

      {/* 2. Expansión y renovaciones */}
      <ExpansionSection signalsByClient={data.signalsByClient} clientNames={clientNames} />

      {/* 3. Cartera (motor existente, con chips de señales) */}
      <PortfolioGrid
        rows={data.rows}
        renderClientChips={(clientId) => <SignalChips s={data.signalsByClient[clientId]} />}
      />
    </div>
  );
}
