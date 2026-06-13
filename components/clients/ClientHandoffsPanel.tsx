"use client";

/**
 * components/clients/ClientHandoffsPanel.tsx
 *
 * Handoffs del cliente como DOCUMENTOS INTERNOS de traspaso Sales → CS.
 * Índice de cards a pantalla completa → al abrir una, el documento (CanvasLinearView,
 * editable/validable). Sin badges ni "sofisticación": el sync a HubSpot sigue
 * corriendo en background pero no se muestra acá. Muestra con qué sesiones de ventas
 * se armó (item de validación). El Handoff vive a nivel cliente (model Handoff)
 * aunque su contenido siga en el canvas project-bound.
 */

import { useCallback, useEffect, useState } from "react";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import NewHandoffButton from "@/components/clients/NewHandoffButton";

interface SourceSession {
  id: string;
  title: string;
  date: string;
}

interface HandoffSummary {
  id: string;
  projectId: string;
  projectName: string;
  canvasId: string | null;
  createdAt: string;
  sourceSessions?: SourceSession[];
}

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
        if (selectNewest) setSelectedId(list[0]?.id ?? null); // tras crear, entrar al nuevo
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
      <div className="px-6 py-8 space-y-4 max-w-4xl">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="px-6 py-12 max-w-3xl">
        <div className="rounded-2xl border border-dashed border-line bg-surface-muted px-6 py-10 text-center">
          <h3 className="text-base font-semibold text-fg">Todavía no hay handoffs</h3>
          <p className="mt-2 mb-5 text-sm text-fg-muted max-w-md mx-auto">
            Un handoff nace cuando se gana un deal: lleva la información de ventas a CS y arranca
            el proyecto en Nexus.
          </p>
          <div className="flex justify-center">
            <NewHandoffButton kind="existing" clientId={clientId} clientName={clientName} onCreated={() => load(true)} />
          </div>
        </div>
      </div>
    );
  }

  const selected = selectedId ? handoffs.find((h) => h.id === selectedId) : null;

  // ── Vista DOCUMENTO (un handoff abierto) ────────────────────────────────────
  if (selected) {
    return (
      <div className="px-6 py-8 space-y-5">
        <button
          onClick={() => setSelectedId(null)}
          className="text-xs font-medium text-fg-muted hover:text-fg flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Handoffs
        </button>

        <div className="flex flex-wrap items-baseline gap-3 max-w-3xl">
          <h2 className="text-lg font-semibold text-fg">{selected.projectName}</h2>
          <span className="text-xs text-fg-muted">Handoff · {fmtDate(selected.createdAt)}</span>
        </div>

        {selected.sourceSessions && selected.sourceSessions.length > 0 && (
          <div className="max-w-3xl rounded-xl border border-line bg-surface-muted px-4 py-3">
            <p className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">
              Armado a partir de {selected.sourceSessions.length} sesión{selected.sourceSessions.length === 1 ? "" : "es"} de ventas
            </p>
            <ul className="space-y-0.5">
              {selected.sourceSessions.map((s) => (
                <li key={s.id} className="text-xs text-fg-secondary flex items-center gap-2 min-w-0">
                  <span className="w-1 h-1 rounded-full bg-fg-muted flex-shrink-0" />
                  <span className="truncate">{s.title}</span>
                  <span className="text-fg-muted flex-shrink-0">· {fmtDate(s.date)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected.canvasId ? (
          <CanvasLinearView projectId={selected.projectId} canvasId={selected.canvasId} />
        ) : (
          <div className="max-w-3xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
            Este handoff todavía no tiene un documento generado.
          </div>
        )}
      </div>
    );
  }

  // ── Vista ÍNDICE (cards a pantalla completa) ────────────────────────────────
  return (
    <div className="px-6 py-8 space-y-5">
      <div className="flex items-center justify-between gap-3 max-w-4xl">
        <div>
          <h2 className="text-xl font-bold text-fg">Handoffs</h2>
          <p className="text-sm text-fg-muted mt-0.5">Documentos internos de traspaso Sales → CS. Abrí uno para editarlo y validarlo.</p>
        </div>
        <NewHandoffButton kind="existing" clientId={clientId} clientName={clientName} onCreated={() => load(true)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        {handoffs.map((h) => (
          <button
            key={h.id}
            onClick={() => setSelectedId(h.id)}
            className="text-left rounded-2xl border border-line bg-surface hover:border-brand/50 hover:bg-surface-hover transition-colors p-5 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-fg truncate">{h.projectName}</h3>
                <p className="text-xs text-fg-muted mt-0.5">Handoff · {fmtDate(h.createdAt)}</p>
              </div>
              <svg className="w-4 h-4 text-fg-muted group-hover:text-brand transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
            {h.sourceSessions && h.sourceSessions.length > 0 && (
              <p className="text-[11px] text-fg-muted mt-3">
                Armado con {h.sourceSessions.length} sesión{h.sourceSessions.length === 1 ? "" : "es"} de ventas
              </p>
            )}
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-brand">Abrir documento</span>
          </button>
        ))}
      </div>
    </div>
  );
}
