"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { zClass } from "@/lib/ui/z";
import { useAgentRuns, type RunRow } from "./AgentRunsProvider";

// ── RunsIndicator ──────────────────────────────────────────────────────────────
//
// El CENTRO DE CORRIDAS: el ítem del sidebar que muestra qué agentes están
// corriendo (con su fase real) y las últimas corridas terminadas (con el error
// humanizado si fallaron). Cierra el hueco "me fui a otra pantalla y perdí el
// hilo": la corrida vive en AgentRun y acá se reencuentra, con enlace directo al
// resultado.
//
// Los DATOS ya no son suyos: los sirve AgentRunsProvider, que es quien poletea y
// quien avisa cuando algo termina. Antes este componente tenía su propio fetch, y
// por eso el seguimiento moría o se duplicaba según qué pantalla estuviera abierta.
// Acá solo queda la PRESENTACIÓN.
//
// Patrón CsAlertNotifier: watermark en localStorage (cero schema) — el badge cuenta
// las corridas terminadas DESPUÉS de la última vez que abriste el popover; abrirlo
// lo avanza.
//
// El panel va en un PORTAL a document.body con coordenadas fixed desde el trigger
// (mecánica de NavFlyout). El fixed solo no bastaba: el rail es un `<aside sticky>`
// y `position: sticky` crea un contexto de apilamiento, así que el z-index del
// panel se resolvía DENTRO del sidebar y lo tapaba cualquier capa de la columna
// principal (bug 2026-07: el bloque translúcido "Pendiente del cliente" del
// cronograma se le encimaba). Ver la nota de lib/ui/z.ts.
//
// ⚠ Consecuencia del portal: el panel deja de ser descendiente de `rootRef`, así
// que el cierre por click/scroll afuera DEBE consultar también `panelRef` — si no,
// tocar adentro del panel lo cerraría.

const WATERMARK_KEY = "nexus.agent-runs.watermark";
const FILTRO_KEY = "nexus.agent-runs.filtro";

type Filtro = "mias" | "todas";

function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function leerLS(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function escribirLS(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin localStorage */
  }
}

export default function RunsIndicator({ isOpen }: { isOpen: boolean }) {
  const runs = useAgentRuns();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("mias");
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // El panel vive en un portal (fuera de rootRef): su propio ref para el click-afuera.
  const panelRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  // El watermark vive en localStorage; el estado solo fuerza re-render del badge.
  const [watermark, setWatermark] = useState<string | null>(null);

  // Hidratación de localStorage (no existe en SSR: un lazy initializer daría
  // hydration mismatch, mismo criterio que el mount guard de Modal).
  useEffect(() => {
    let wm = leerLS(WATERMARK_KEY);
    if (!wm) {
      wm = new Date().toISOString();
      escribirLS(WATERMARK_KEY, wm);
    }
    const f = leerLS(FILTRO_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage
    setWatermark(wm);
    if (f === "todas" || f === "mias") setFiltro(f);
  }, []);

  // Cierre por click-afuera / Escape / scroll externo (mecánica <Menu>).
  useEffect(() => {
    if (!open) return;
    // `dentro` cubre las DOS ramas del árbol: el trigger (rootRef, en el sidebar) y
    // el panel portaleado a body (panelRef) — que ya no es descendiente del primero.
    const dentro = (n: Node) =>
      !!rootRef.current?.contains(n) || !!panelRef.current?.contains(n);
    function onClick(e: MouseEvent) {
      if (e.target instanceof Node && !dentro(e.target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll(e: Event) {
      if (e.target instanceof Node && dentro(e.target)) return;
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

  const aplicaFiltro = useCallback(
    (rows: RunRow[]) => (filtro === "mias" ? rows.filter((r) => r.mine) : rows),
    [filtro],
  );

  const enCurso = useMemo(() => aplicaFiltro(runs?.running ?? []), [runs?.running, aplicaFiltro]);
  const recientes = useMemo(() => aplicaFiltro(runs?.recent ?? []), [runs?.recent, aplicaFiltro]);

  // El badge y el spinner del rail siempre hablan de LO MÍO, sin importar el filtro
  // del panel: es tu trabajo el que te tiene esperando.
  const misEnCurso = runs?.misEnCurso ?? [];
  const corriendo = misEnCurso.length;
  const sinVer = watermark
    ? (runs?.recent ?? []).filter((r) => r.mine && r.updatedAt > watermark).length
    : 0;
  const fase = runs?.fase ?? null;

  const cambiarFiltro = (f: Filtro) => {
    setFiltro(f);
    escribirLS(FILTRO_KEY, f);
  };

  const toggle = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) });
      // Abrirlo = visto: el watermark avanza y el badge se apaga.
      const now = new Date().toISOString();
      escribirLS(WATERMARK_KEY, now);
      setWatermark(now);
      runs?.refrescar();
    }
    setOpen((p) => !p);
  };

  // Con algo corriendo la etiqueta cuenta la FASE real ("Generando secciones…"),
  // que es la única señal honesta de que el agente avanza. Es el dato que se perdía
  // al navegar: ahora viaja en el feed y se pinta acá, en toda la app.
  const etiqueta = corriendo > 0 ? (fase ?? "Generando…") : "Corridas de agentes";

  return (
    <div ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-live="polite"
        title={
          !isOpen
            ? corriendo > 0
              ? `${corriendo} agente${corriendo !== 1 ? "s" : ""} en curso${fase ? ` · ${fase}` : ""}`
              : "Corridas de agentes"
            : undefined
        }
        className={cn(
          "w-full flex items-center rounded-lg text-sm transition-colors hover:bg-surface-hover",
          corriendo > 0 ? "text-fg" : "text-fg-muted hover:text-fg",
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5",
        )}
      >
        <span className="relative flex-shrink-0">
          {corriendo > 0 ? (
            // Anillo girando: reemplaza al punto de 2px, que no se leía como "algo
            // está pasando" — y era lo único que sobrevivía al cambiar de pantalla.
            <span className="block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {corriendo === 0 && sinVer > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
          )}
          {/* Colapsado no hay lugar para el contador: va pegado al anillo. */}
          {!isOpen && corriendo > 1 && (
            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold tabular-nums bg-brand text-primary-fg rounded-full px-1 leading-[14px]">
              {corriendo}
            </span>
          )}
        </span>
        {isOpen && <span className="flex-1 truncate text-left">{etiqueta}</span>}
        {isOpen && corriendo > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums bg-brand/20 text-brand-light rounded-full px-1.5 py-0.5">
            {corriendo}
          </span>
        )}
        {isOpen && corriendo === 0 && sinVer > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums bg-brand/20 text-brand-light rounded-full px-1.5 py-0.5">
            {sinVer}
          </span>
        )}
      </button>

      {hydrated && open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Corridas de agentes"
          className={cn(
            "fixed w-80 bg-surface border border-line rounded-xl shadow-xl overflow-y-auto",
            zClass("POPOVER"),
          )}
          style={{ ...pos, maxHeight: "min(480px, calc(100vh - 16px))" }}
        >
          <div className="px-3 py-2.5 border-b border-line flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fg">Corridas de agentes</p>
            {/* Mías por defecto; "Todas" sigue mostrando lo del equipo (nada se
                oculta, solo deja de interrumpir). */}
            <div className="flex items-center gap-0.5 bg-surface-muted border border-line rounded-lg p-0.5">
              {(["mias", "todas"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => cambiarFiltro(f)}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors",
                    filtro === f ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {f === "mias" ? "Mías" : "Todas"}
                </button>
              ))}
            </div>
          </div>

          {enCurso.length > 0 && (
            <div className="px-3 py-2 space-y-2 border-b border-line">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">En curso</p>
              {enCurso.map((r) => (
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
            {recientes.length === 0 && (
              <p className="text-xs text-fg-muted py-1">
                {filtro === "mias" ? "No lanzaste ninguna corrida todavía." : "Sin corridas recientes."}
              </p>
            )}
            {recientes.map((r) => (
              // `resultUrl` lo calcula el server (lib/agents/run-url.ts): lleva al
              // canvas donde quedó lo generado, no a la home del cliente.
              <Link key={r.id} href={r.resultUrl} onClick={() => setOpen(false)} className="block">
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
              </Link>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
