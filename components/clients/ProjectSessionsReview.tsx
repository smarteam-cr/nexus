"use client";

/**
 * components/clients/ProjectSessionsReview.tsx
 *
 * Curación de la MEMBRESÍA de contexto del proyecto (plan "contexto por proyecto"):
 * qué sesiones alimentan handoff/kickoff/cronograma/análisis de ESTE proyecto.
 *
 *   - Miembros: cada sesión con su procedencia (IA + confidence + rationale / manual),
 *     estado de revisión y toggle excluir. La exclusión es un tombstone durable
 *     (included=false): la IA no la re-propone jamás.
 *   - Excluidas: visibles y reversibles ("Reincluir").
 *   - "Agregar sesiones": vincula otra sesión del cliente (multi-link = una reunión
 *     puede alimentar a varios proyectos).
 *   - "Confirmar contexto": estampa reviewedAt en los links de IA vigentes → el
 *     clasificador ya no los toca y el chip de aviso se apaga.
 *
 * Distinto de SessionSelectionReview (handoff-only: decide qué cuenta la historia de
 * venta); esto decide QUÉ ES del proyecto. API: /api/projects/[id]/project-sessions.
 *
 * Exporta además <UnreviewedSessionsChip>: chip ámbar "N sin revisar" que solo aparece
 * en clientes multi-proyecto y abre este panel en un modal.
 */
import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui";

interface MemberRow {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  isPrimary: boolean;
  source: string;
  confidence: number | null;
  rationale: string | null;
  included: boolean;
  reviewedAt: string | null;
  linkedElsewhere: boolean;
}
interface CandidateRow {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  linkedElsewhere: boolean;
}
interface PanelData {
  multiProject: boolean;
  unreviewedCount: number;
  members: MemberRow[];
  candidates: CandidateRow[];
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function ProvenanceBadge({ m }: { m: MemberRow }) {
  if (m.source === "manual") {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
        manual
      </span>
    );
  }
  return (
    <span
      title={m.rationale ?? undefined}
      className="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5 flex-shrink-0 cursor-help"
    >
      IA{m.confidence != null ? ` · ${Math.round(m.confidence * 100)}%` : ""}
    </span>
  );
}

export default function ProjectSessionsReview({
  projectId,
  onChange,
}: {
  projectId: string;
  /** Notifica cambios (para refrescar contadores/chips externos). */
  onChange?: () => void;
}) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/project-sessions`);
      if (r.ok) setData((await r.json()) as PanelData);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/project-sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setData(d as PanelData);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const setIncluded = useCallback(
    async (sessionId: string, included: boolean) => {
      setBusyId(sessionId);
      try {
        await fetch(`/api/projects/${projectId}/project-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, included }),
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

  const confirmAll = useCallback(async () => {
    setConfirming(true);
    try {
      await fetch(`/api/projects/${projectId}/project-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmAll: true }),
      });
      await reload();
      onChange?.();
    } catch {
      /* ignore */
    }
    setConfirming(false);
  }, [projectId, reload, onChange]);

  if (loading || !data) return <div className="h-16 rounded-xl skeleton-shimmer" />;

  const included = data.members.filter((m) => m.included);
  const excluded = data.members.filter((m) => !m.included);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? data.candidates.filter((c) => (c.title || "").toLowerCase().includes(q))
    : data.candidates;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fg">
            Sesiones que alimentan este proyecto{included.length > 0 ? ` (${included.length})` : ""}
          </p>
          <p className="text-[11px] text-fg-muted leading-relaxed mt-0.5">
            Handoff, kickoff, cronograma y análisis se generan SOLO con estas sesiones. Revisá que
            no se cuele contexto de otro proyecto del mismo cliente.
          </p>
        </div>
        {data.unreviewedCount > 0 && (
          <button
            onClick={confirmAll}
            disabled={confirming}
            className="flex-shrink-0 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            title="Marca como revisados los vínculos propuestos por la IA que siguen en la lista"
          >
            {confirming ? "Confirmando…" : `✓ Confirmar contexto (${data.unreviewedCount})`}
          </button>
        )}
      </div>

      {included.length === 0 ? (
        <p className="text-xs text-fg-muted">Este proyecto no tiene sesiones vinculadas todavía.</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
          {included.map((m) => (
            <li
              key={m.sessionId}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-fg truncate">{m.title || "Sin título"}</span>
                  <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(m.date)}</span>
                  <ProvenanceBadge m={m} />
                  {m.source === "agent" && !m.reviewedAt && (
                    <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      sin revisar
                    </span>
                  )}
                  {m.reviewedAt && (
                    <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      ✓ revisada
                    </span>
                  )}
                  {m.linkedElsewhere && (
                    <span className="text-[9px] font-medium text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      también en otro proyecto
                    </span>
                  )}
                </div>
                {m.rationale && (
                  <p className="text-[10px] text-fg-muted truncate mt-0.5" title={m.rationale}>
                    {m.rationale}
                  </p>
                )}
              </div>
              <button
                onClick={() => setIncluded(m.sessionId, false)}
                disabled={busyId === m.sessionId}
                title="Excluir de este proyecto (durable: la IA no la vuelve a proponer)"
                className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {excluded.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
            Excluidas por el equipo ({excluded.length})
          </p>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {excluded.map((m) => (
              <li
                key={m.sessionId}
                className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 opacity-70"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-fg-muted truncate line-through">
                    {m.title || "Sin título"}
                  </span>
                  <span className="text-[10px] text-fg-muted ml-2">{fmtDate(m.date)}</span>
                </div>
                <button
                  onClick={() => setIncluded(m.sessionId, true)}
                  disabled={busyId === m.sessionId}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  Reincluir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-fg-muted">¿Falta una sesión del cliente en este proyecto?</p>
        <button
          onClick={() => setShowAdd(true)}
          className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors inline-flex items-center gap-1 flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar sesiones
        </button>
      </div>

      <Modal
        open={showAdd}
        onClose={() => { setShowAdd(false); setSearch(""); }}
        title="Agregar sesiones del cliente"
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
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                    <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                    {c.linkedElsewhere && (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        en otro proyecto
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setIncluded(c.sessionId, true)}
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

/**
 * Chip ámbar "N sesiones sin revisar alimentan este contexto — Revisar".
 * Solo aparece si el cliente tiene ≥2 proyectos activos (anti-ruido: con 1 proyecto
 * no hay mezcla posible) Y hay links de IA sin confirmar. Nunca bloquea: es un aviso.
 * Al click abre el panel de curación en un modal.
 */
export function UnreviewedSessionsChip({ projectId }: { projectId: string }) {
  const [count, setCount] = useState(0);
  const [multiProject, setMultiProject] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/project-sessions`);
      if (r.ok) {
        const d = (await r.json()) as PanelData;
        setCount(d.unreviewedCount);
        setMultiProject(d.multiProject);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/project-sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) {
          setCount((d as PanelData).unreviewedCount);
          setMultiProject((d as PanelData).multiProject);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!multiProject || count === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors"
        title="Este cliente tiene varios proyectos: revisá qué sesiones alimentan este contexto"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {count} sesion{count === 1 ? "" : "es"} sin revisar — Revisar
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Contexto del proyecto" size="xl">
        <ProjectSessionsReview projectId={projectId} onChange={refresh} />
      </Modal>
    </>
  );
}
