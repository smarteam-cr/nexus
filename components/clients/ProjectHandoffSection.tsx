"use client";

/**
 * components/clients/ProjectHandoffSection.tsx
 *
 * Sección dedicada del HANDOFF dentro de cada proyecto (handoff por-proyecto, 1:1).
 * Siempre visible arriba del proyecto: muestra estado claro (Generado / No generado /
 * Generando…), botón para generar/regenerar, y el documento (CanvasLinearView del
 * canvas "Handoff"). La generación corre el agente scopeado a las sesiones de ESTE
 * proyecto (SessionProject) — async + polling.
 */
import { useState, useEffect, useCallback } from "react";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import { pollAgentRun } from "@/lib/clients/poll-agent-run";

const HANDOFF_AGENT_ID = "cmmla1g1x00005wijix3qnr7u";

interface HandoffStatus {
  handoffId: string | null;
  canvasId: string | null;
  generated: boolean;
  blockCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  sourceSessions: { id: string; title: string; date: string }[];
  projectSessionCount: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectHandoffSection({ projectId, clientId }: { projectId: string; clientId: string }) {
  const [status, setStatus] = useState<HandoffStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff`);
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      // 1. Asegurar entidad Handoff + canvas
      const ensure = await fetch(`/api/projects/${projectId}/handoff`, { method: "POST" });
      const ensureData = await ensure.json().catch(() => ({}));
      if (!ensure.ok) { setError(ensureData.error ?? "No se pudo preparar el handoff."); return; }
      const handoffId: string | undefined = ensureData.handoffId;

      // 2. Correr el agente handoff (async/background, scopeado a las sesiones del proyecto)
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: HANDOFF_AGENT_ID, projectId, async: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // NO_PROJECT_SESSIONS u otro error → mostrar el mensaje claro, no generar.
        setError(data.message ?? data.error ?? "No se pudo generar el handoff.");
        return;
      }
      if (data.runId) {
        const result = await pollAgentRun(clientId, data.runId);
        if (result.status === "ERROR") { setError("El handoff falló durante la generación. Reintentá."); return; }
        if (result.status === "TIMEOUT") { setError("La generación está tardando más de lo normal. Revisá en unos minutos."); return; }
      }
      // 3. Sync a HubSpot (best-effort; reconciliable)
      if (handoffId) {
        fetch("/api/handoffs/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoffId }),
        }).catch(() => {});
      }
      // 4. Refrescar estado + abrir el doc
      await fetchStatus();
      setShowDoc(true);
    } catch {
      setError("Error de conexión al generar el handoff.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, clientId, fetchStatus]);

  if (loading) return <div className="h-14 rounded-2xl skeleton-shimmer" />;
  if (!status) return null;

  const { generated, projectSessionCount } = status;

  const badge = generating
    ? <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Generando…</span>
    : generated
    ? <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Generado</span>
    : <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted bg-surface-muted border border-line rounded-full px-2 py-0.5">No generado</span>;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-fg">Handoff Sales→CS</h3>
            {badge}
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {generated
              ? `Armado con ${status.sourceSessions.length} sesión${status.sourceSessions.length === 1 ? "" : "es"} del proyecto${status.lastRunAt ? ` · ${fmtDate(status.lastRunAt)}` : ""}`
              : projectSessionCount > 0
              ? `${projectSessionCount} sesión${projectSessionCount === 1 ? "" : "es"} clasificada${projectSessionCount === 1 ? "" : "s"} a este proyecto`
              : "Este proyecto no tiene sesiones clasificadas todavía"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {generated && status.canvasId && (
            <button
              onClick={() => setShowDoc((v) => !v)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
            >
              {showDoc ? "Ocultar" : "Ver documento"}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {generating ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : null}
            {generating ? "Generando…" : generated ? "Regenerar" : "Generar handoff"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 pb-3 -mt-1">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      {generated && showDoc && status.canvasId && (
        <div className="border-t border-line px-4 py-4">
          <CanvasLinearView projectId={projectId} canvasId={status.canvasId} />
        </div>
      )}
    </section>
  );
}
