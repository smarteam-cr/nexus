"use client";

/**
 * components/clients/SessionSelectionReview.tsx
 *
 * Selección revisable de las sesiones que alimentan un handoff (A2 rediseñado).
 *   - Panel limpio: SOLO las sesiones que alimentan el handoff (handoff/kickoff/Ventas, o
 *     forzadas a mano). La "X" las saca del handoff sin desvincularlas del proyecto.
 *   - "Buscar más sesiones": pop-up con las demás sesiones del cliente (buscador +
 *     las que aplican destacadas). "Agregar" fuerza la inclusión (lo manual manda).
 *   - Nudge para pegar transcripciones a mano cuando una reunión clave no se grabó.
 *
 * Componente COMPARTIDO (ProjectHandoffSection + stepper). Reusa el override por sesión
 * vía POST /api/projects/[projectId]/handoff-sessions.
 */
import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui";

interface FeedingSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  source: string;
  confidence: number | null;
  rationale: string | null;
  forced: boolean;
}
interface CandidateSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  applies: boolean;
  linkedElsewhere: boolean;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function SessionSelectionReview({
  projectId,
  onChange,
  readOnly = false,
  onAddManual,
}: {
  projectId: string;
  onChange?: () => void;
  readOnly?: boolean;
  onAddManual?: () => void;
}) {
  const [data, setData] = useState<{ feeding: FeedingSession[]; candidates: CandidateSession[] }>({
    feeding: [],
    candidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/session-candidates`);
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/session-candidates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const setFeeds = useCallback(
    async (sessionId: string, feeds: boolean) => {
      setBusyId(sessionId);
      try {
        await fetch(`/api/projects/${projectId}/handoff-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, feeds }),
        });
        await reload();
        onChange?.();
      } catch {
        /* ignore */
      }
      setBusyId(null);
    },
    [projectId, reload, onChange],
  );

  if (loading) return <div className="h-16 rounded-xl skeleton-shimmer" />;

  const { feeding, candidates } = data;
  const q = search.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => (c.title || "").toLowerCase().includes(q)) : candidates;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-fg">
        Sesiones que alimentan el handoff{feeding.length > 0 ? ` (${feeding.length})` : ""}
      </p>
      <p className="text-[11px] text-fg-muted leading-relaxed">
        Detectamos las sesiones de handoff, kickoff o con Ventas en la sala. Revisá y podá antes de generar.
      </p>

      {feeding.length === 0 ? (
        <p className="text-xs text-fg-muted">
          Todavía no hay sesiones de venta para este proyecto. Buscá más abajo o pegá la transcripción a mano.
        </p>
      ) : (
        <ul className="space-y-2">
          {feeding.map((s) => (
            <li
              key={s.sessionId}
              className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-fg truncate">{s.title || "Sin título"}</span>
                  <span className="text-[10px] font-medium text-fg-muted flex-shrink-0">{fmtDate(s.date)}</span>
                  {s.forced ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Agregada
                    </span>
                  ) : s.source === "manual" ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Manual
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      IA{s.confidence != null ? ` ${Math.round(s.confidence * 100)}%` : ""}
                    </span>
                  )}
                </div>
                {s.rationale && <p className="text-[11px] text-fg-muted mt-0.5 line-clamp-2">{s.rationale}</p>}
              </div>
              {!readOnly && (
                <button
                  onClick={() => setFeeds(s.sessionId, false)}
                  disabled={busyId === s.sessionId}
                  title="Quitar del handoff (no la desvincula del proyecto)"
                  className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0 mt-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-fg-muted">¿Crees que falta alguna sesión del cliente?</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors inline-flex items-center gap-1 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            Buscar más sesiones
          </button>
        </div>
      )}

      {!readOnly && onAddManual && (
        <button
          onClick={onAddManual}
          className="w-full text-left text-[11px] text-fg-muted bg-surface-muted rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors"
        >
          ¿Una reunión clave no se grabó? <span className="text-brand font-medium">Ingresá la transcripción a mano</span>
        </button>
      )}

      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setSearch("");
        }}
        title="Buscar sesiones del cliente"
        size="md"
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título…"
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-3"
        />
        {filtered.length === 0 ? (
          <p className="text-xs text-fg-muted py-2">No hay más sesiones del cliente.</p>
        ) : (
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {filtered.map((c) => (
              <li
                key={c.sessionId}
                className={`flex items-center gap-2 rounded-lg border border-line px-3 py-2 ${c.applies ? "" : "opacity-60"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                    <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                    {c.applies && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        aplica
                      </span>
                    )}
                    {c.linkedElsewhere && (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        en otro proyecto
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setFeeds(c.sessionId, true)}
                  disabled={busyId === c.sessionId}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  Agregar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
