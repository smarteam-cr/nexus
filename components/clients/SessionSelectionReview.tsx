"use client";

/**
 * components/clients/SessionSelectionReview.tsx
 *
 * Selección REVISABLE de las sesiones que alimentan un handoff (A2). El agente
 * clasifica sesiones→proyecto (con su rationale); acá el humano AUDITA y PODA antes
 * de generar: quita las que no van y agrega alguna que el agente no trajo.
 *
 * Componente COMPARTIDO: se monta en ProjectHandoffSection (cuando no hay handoff) y
 * en el stepper del vendedor. Reusa los endpoints sesión↔proyecto existentes
 * (POST/DELETE /api/sessions/[id]/projects) — incluir marca source="manual".
 */
import { useState, useEffect, useCallback } from "react";

interface LinkedSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  isPrimary: boolean;
  source: string; // "agent" | "manual" | "legacy"
  confidence: number | null;
  rationale: string | null;
  feedsHandoff: boolean; // ¿alimenta el handoff? (título de venta o Ventas en la sala)
}
interface CandidateSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  linkedElsewhere: boolean;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function SessionSelectionReview({
  projectId,
  onChange,
  readOnly = false,
}: {
  projectId: string;
  onChange?: () => void;
  readOnly?: boolean;
}) {
  const [data, setData] = useState<{ linked: LinkedSession[]; candidates: CandidateSession[] }>({
    linked: [],
    candidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/session-candidates`);
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    }
  }, [projectId]);

  // Carga inicial con cadena de promesas (setState en callbacks → no dispara
  // react-hooks/set-state-in-effect). reload() reusa el fetch tras incluir/excluir.
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

  const include = useCallback(
    async (sessionId: string) => {
      setBusyId(sessionId);
      try {
        await fetch(`/api/sessions/${sessionId}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
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

  const exclude = useCallback(
    async (sessionId: string) => {
      setBusyId(sessionId);
      try {
        await fetch(`/api/sessions/${sessionId}/projects/${projectId}`, { method: "DELETE" });
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

  const { linked, candidates } = data;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg">
          Sesiones de este handoff{linked.length > 0 ? ` (${linked.length})` : ""}
        </p>
        {!readOnly && candidates.length > 0 && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors"
          >
            {showAdd ? "Cerrar" : "Agregar otra sesión"}
          </button>
        )}
      </div>

      <p className="text-[11px] text-fg-muted leading-relaxed">
        Solo las <span className="font-medium text-fg">sesiones de venta</span> (por título o con Ventas
        en la sala) alimentan el handoff; las demás van en gris. Revisá y podá antes de generar.
      </p>

      {linked.length === 0 ? (
        <p className="text-xs text-fg-muted">Todavía no hay sesiones clasificadas a este proyecto.</p>
      ) : (
        <ul className="space-y-2">
          {linked.map((s) => (
            <li
              key={s.sessionId}
              className={`flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 ${
                s.feedsHandoff ? "" : "opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-fg truncate">{s.title || "Sin título"}</span>
                  <span className="text-[10px] font-medium text-fg-muted flex-shrink-0">{fmtDate(s.date)}</span>
                  {s.source === "manual" ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Manual
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      IA{s.confidence != null ? ` ${Math.round(s.confidence * 100)}%` : ""}
                    </span>
                  )}
                  {!s.feedsHandoff && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      no entra al handoff
                    </span>
                  )}
                </div>
                {s.rationale && <p className="text-[11px] text-fg-muted mt-0.5 line-clamp-2">{s.rationale}</p>}
              </div>
              {!readOnly && (
                <button
                  onClick={() => exclude(s.sessionId)}
                  disabled={busyId === s.sessionId}
                  title="Quitar de este handoff"
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

      {!readOnly && showAdd && (
        <div className="rounded-lg border border-line p-3 space-y-2">
          <p className="text-[11px] text-fg-muted">
            Otras sesiones del cliente. Al agregar una queda marcada como manual y la IA ya no la cambia.
          </p>
          {candidates.length === 0 ? (
            <p className="text-xs text-fg-muted">No hay otras sesiones del cliente.</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {candidates.map((s) => (
                <li
                  key={s.sessionId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-fg truncate">{s.title || "Sin título"}</span>
                      <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(s.date)}</span>
                      {s.linkedElsewhere && (
                        <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                          en otro proyecto
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => include(s.sessionId)}
                    disabled={busyId === s.sessionId}
                    className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
