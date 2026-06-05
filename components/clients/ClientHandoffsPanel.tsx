"use client";

/**
 * components/clients/ClientHandoffsPanel.tsx
 *
 * Vista de los handoffs (entidad cliente-level) de un cliente. Lista los handoffs
 * y, para el seleccionado, renderiza el contenido del canvas "Handoff" del proyecto
 * vía CanvasLinearView (lectura/curación del CSE). El handoff vive a nivel cliente
 * (model Handoff) aunque su contenido siga en el canvas project-bound.
 */

import { useCallback, useEffect, useState } from "react";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import NewHandoffButton from "@/components/clients/NewHandoffButton";

interface HandoffSummary {
  id: string;
  projectId: string;
  projectName: string;
  canvasId: string | null;
  hubspotDealId: string | null;
  hubspotProjectId: string | null;
  hubspotSyncStatus: string;
  hubspotSyncError: string | null;
  createdAt: string;
}

const SYNC_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "HubSpot: pendiente", cls: "bg-amber-900/30 text-amber-300 border-amber-700/40" },
  synced: { label: "HubSpot: sincronizado", cls: "bg-emerald-900/30 text-emerald-300 border-emerald-700/40" },
  failed: { label: "HubSpot: error", cls: "bg-red-900/30 text-red-300 border-red-700/40" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export default function ClientHandoffsPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [handoffs, setHandoffs] = useState<HandoffSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(
    async (selectNewest = false) => {
      try {
        const r = await fetch(`/api/clients/${clientId}/handoffs`);
        const data = r.ok ? await r.json() : { handoffs: [] };
        const list: HandoffSummary[] = data.handoffs ?? [];
        setHandoffs(list);
        setSelectedId((prev) => (selectNewest ? list[0]?.id ?? null : prev ?? list[0]?.id ?? null));
      } catch {
        setHandoffs([]);
      }
    },
    [clientId],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (handoffs === null) {
    return (
      <div className="px-6 py-8 space-y-4 max-w-3xl">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="px-6 py-12 max-w-3xl">
        <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-10 text-center">
          <h3 className="text-base font-semibold text-white">Todavía no hay handoffs</h3>
          <p className="mt-2 mb-5 text-sm text-gray-400 max-w-md mx-auto">
            Un handoff nace cuando se gana un deal: lleva la información de ventas a CS y arranca
            el proyecto en Nexus.
          </p>
          <div className="flex justify-center">
            <NewHandoffButton
              kind="existing"
              clientId={clientId}
              clientName={clientName}
              onCreated={() => load(true)}
            />
          </div>
        </div>
      </div>
    );
  }

  const selected = handoffs.find((h) => h.id === selectedId) ?? handoffs[0];
  const sync = SYNC_BADGE[selected.hubspotSyncStatus] ?? SYNC_BADGE.pending;

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Encabezado: selector (si >1) + CTA nuevo handoff */}
      <div className="flex flex-wrap items-center gap-2 max-w-3xl">
        {handoffs.length > 1 &&
          handoffs.map((h) => {
            const isActive = h.id === selected.id;
            return (
              <button
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? "border-brand text-white bg-brand/10"
                    : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                }`}
              >
                {h.projectName} · {fmtDate(h.createdAt)}
              </button>
            );
          })}
        <div className="ml-auto">
          <NewHandoffButton
            kind="existing"
            clientId={clientId}
            clientName={clientName}
            onCreated={() => load(true)}
          />
        </div>
      </div>

      {/* Cabecera del handoff seleccionado */}
      <div className="flex flex-wrap items-center gap-3 max-w-3xl">
        <h2 className="text-lg font-semibold text-white">{selected.projectName}</h2>
        <span className="text-xs text-gray-500">{fmtDate(selected.createdAt)}</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${sync.cls}`}>
          {sync.label}
        </span>
        {selected.hubspotSyncStatus === "failed" && selected.hubspotSyncError && (
          <span className="text-[11px] text-red-300/80" title={selected.hubspotSyncError}>
            (ver detalle)
          </span>
        )}
      </div>

      {/* Contenido: vista lineal del canvas Handoff del proyecto */}
      {selected.canvasId ? (
        <CanvasLinearView projectId={selected.projectId} canvasId={selected.canvasId} />
      ) : (
        <div className="max-w-3xl rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          Este handoff todavía no tiene un canvas generado.
        </div>
      )}
    </div>
  );
}
