"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// ── RunsIndicator ──────────────────────────────────────────────────────────────
//
// El CENTRO DE CORRIDAS v1: un ítem del sidebar con badge + popover que muestra
// qué agentes están corriendo (con su fase real) y las últimas corridas
// terminadas (con el error humanizado si fallaron). Cierra el hueco "cerré la
// pestaña y perdí el resultado": la corrida vive en AgentRun y acá se reencuentra.
//
// Patrón CsAlertNotifier: watermark en localStorage (cero schema) — el badge
// cuenta las corridas terminadas DESPUÉS de la última vez que abriste el popover;
// abrirlo lo avanza. Polling perezoso: ~60s de fondo para el badge, ~10s con el
// popover abierto. El panel usa position:fixed calculado desde el trigger (misma
// mecánica que <Menu>: escapa del overflow-hidden del rail).

const POLL_BG_MS = 60_000;
const POLL_OPEN_MS = 10_000;
const WATERMARK_KEY = "nexus.agent-runs.watermark";

interface RunRow {
  id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  currentPhase: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  agentName: string;
  error: string | null;
}

interface Feed {
  running: RunRow[];
  recent: RunRow[];
}

function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function readWatermark(): string | null {
  try {
    return localStorage.getItem(WATERMARK_KEY);
  } catch {
    return null;
  }
}

export default function RunsIndicator({ isOpen }: { isOpen: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // El watermark vive en localStorage; el estado solo fuerza re-render del badge.
  const [watermark, setWatermark] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-runs?take=10");
      if (!res.ok) return;
      setFeed((await res.json()) as Feed);
    } catch {
      /* red caída: el próximo tick reintenta */
    }
  }, []);

  // Primer tick + watermark inicial (primera vez: "ahora", sin backlog fantasma).
  // El setState-en-effect es intencional: localStorage no existe en SSR y un lazy
  // initializer causaría hydration mismatch (mismo criterio que el mount guard de Modal).
  useEffect(() => {
    let wm = readWatermark();
    if (!wm) {
      wm = new Date().toISOString();
      try {
        localStorage.setItem(WATERMARK_KEY, wm);
      } catch {
        /* sin localStorage */
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage
    setWatermark(wm);
    void fetchFeed();
  }, [fetchFeed]);

  // Polling: lento de fondo, rápido con el popover abierto.
  useEffect(() => {
    const t = setInterval(() => void fetchFeed(), open ? POLL_OPEN_MS : POLL_BG_MS);
    return () => clearInterval(t);
  }, [open, fetchFeed]);

  // Cierre por click-afuera / Escape / scroll externo (mecánica <Menu>).
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll(e: Event) {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const runningCount = feed?.running.length ?? 0;
  const unseen = watermark
    ? (feed?.recent ?? []).filter((r) => r.updatedAt > watermark).length
    : 0;

  const toggle = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) });
      // Abrirlo = visto: el watermark avanza y el badge se apaga.
      const now = new Date().toISOString();
      try {
        localStorage.setItem(WATERMARK_KEY, now);
      } catch {
        /* sin localStorage */
      }
      setWatermark(now);
      void fetchFeed();
    }
    setOpen((p) => !p);
  };

  return (
    <div ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={!isOpen ? "Corridas de agentes" : undefined}
        className={cn(
          "w-full flex items-center rounded-lg text-sm transition-colors text-fg-muted hover:text-fg hover:bg-surface-hover",
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5",
        )}
      >
        <span className="relative flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {(runningCount > 0 || unseen > 0) && (
            <span
              className={cn(
                "absolute -top-1 -right-1 w-2 h-2 rounded-full",
                runningCount > 0 ? "bg-brand" : "bg-emerald-400",
              )}
            />
          )}
        </span>
        {isOpen && (
          <span className="flex-1 truncate text-left">Corridas de agentes</span>
        )}
        {isOpen && unseen > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums bg-brand/20 text-brand-light rounded-full px-1.5 py-0.5">
            {unseen}
          </span>
        )}
      </button>

      {open && pos && (
        <div
          role="dialog"
          aria-label="Corridas de agentes"
          className="fixed z-50 w-80 bg-surface border border-line rounded-xl shadow-xl overflow-y-auto"
          style={{ ...pos, maxHeight: "min(480px, calc(100vh - 16px))" }}
        >
          <div className="px-3 py-2.5 border-b border-line">
            <p className="text-xs font-semibold text-fg">Corridas de agentes</p>
          </div>

          {runningCount > 0 && (
            <div className="px-3 py-2 space-y-2 border-b border-line">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">En curso</p>
              {feed!.running.map((r) => (
                <div key={r.id} className="flex items-start gap-2">
                  <span className="mt-0.5 w-3 h-3 flex-shrink-0 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <div className="min-w-0">
                    <p className="text-xs text-fg truncate">
                      {r.agentName}
                      {r.clientName && <span className="text-fg-muted"> · {r.clientName}</span>}
                    </p>
                    <p className="text-[11px] text-fg-muted truncate">
                      {r.currentPhase ?? "Corriendo…"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">Últimas</p>
            {(feed?.recent ?? []).length === 0 && (
              <p className="text-xs text-fg-muted py-1">Sin corridas recientes.</p>
            )}
            {(feed?.recent ?? []).map((r) => {
              const inner = (
                <div className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-surface-hover transition-colors">
                  {r.status === "DONE" ? (
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg truncate">
                      {r.agentName}
                      {r.clientName && <span className="text-fg-muted"> · {r.clientName}</span>}
                    </p>
                    <p className="text-[11px] text-fg-muted truncate" title={r.error ?? undefined}>
                      {r.status === "ERROR" ? (r.error ?? "Falló") : haceCuanto(r.updatedAt)}
                    </p>
                  </div>
                </div>
              );
              return r.clientId ? (
                <Link key={r.id} href={`/clients/${r.clientId}`} onClick={() => setOpen(false)} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={r.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
