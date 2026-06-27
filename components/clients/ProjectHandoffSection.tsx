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
import { useWorkspace } from "./WorkspaceContext";
import { useMe } from "@/hooks/useMe";
import SessionSelectionReview from "./SessionSelectionReview";

interface HandoffStatus {
  handoffId: string | null;
  /** Id del agente de handoff, resuelto por grupo en el GET (no hardcodeado). */
  agentId: string | null;
  canvasId: string | null;
  generated: boolean;
  blockCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  sourceSessions: { id: string; title: string; date: string }[];
  projectSessionCount: number;
  implementationType: "IMPLEMENTATION" | "REIMPLEMENTATION" | null;
}

/** Fuente manual del handoff (transcript/resumen pegado a mano). */
interface ManualSource {
  id: string;
  title: string | null;
  content: string;
  createdByEmail: string | null;
  createdAt: string;
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
  // Fuentes manuales (transcripts/resúmenes pegados a mano)
  const [sources, setSources] = useState<ManualSource[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const { bumpTimelineRefresh, bumpGpsRefresh } = useWorkspace();
  // RBAC: solo VENTAS/CSL/MARKETING/SUPER_ADMIN editan el handoff (capacidad
  // handoffAnywhere). El CSE lo VE pero no lo genera ni edita.
  const me = useMe();
  const canEdit = me?.capabilities.includes("handoffAnywhere") ?? false;

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff`);
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const fetchSources = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-sources`);
      if (r.ok) { const d = await r.json(); setSources(d.sources ?? []); }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const addSource = useCallback(async () => {
    const content = newContent.trim();
    if (!content || savingSource) return;
    setSavingSource(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || undefined, content }),
      });
      if (r.ok) { setNewTitle(""); setNewContent(""); await fetchSources(); }
    } catch { /* ignore */ }
    setSavingSource(false);
  }, [projectId, newTitle, newContent, savingSource, fetchSources]);

  const removeSource = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${projectId}/handoff-sources/${id}`, { method: "DELETE" });
      await fetchSources();
    } catch { /* ignore */ }
  }, [projectId, fetchSources]);

  // Override CSE del tipo de implementación que infirió el agente (optimista + persiste).
  const setImplType = useCallback(async (value: "IMPLEMENTATION" | "REIMPLEMENTATION") => {
    setStatus((s) => (s ? { ...s, implementationType: value } : s));
    try {
      await fetch(`/api/projects/${projectId}/implementation-type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationType: value }),
      });
    } catch {
      fetchStatus();
    }
  }, [projectId, fetchStatus]);

  const handleGenerate = useCallback(async () => {
    const agentId = status?.agentId;
    if (!agentId) { setError("No se encontró el agente de handoff."); return; }
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
        body: JSON.stringify({ agentId, projectId, async: true }),
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
      // 4. Refrescar estado + abrir el doc + avisar al cronograma (las fases las creó el handoff)
      await fetchStatus();
      setShowDoc(true);
      bumpTimelineRefresh();
      bumpGpsRefresh(); // el widget del proyecto (pills de setup) se actualiza: handoff → ✓
    } catch {
      setError("Error de conexión al generar el handoff.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, clientId, fetchStatus, status?.agentId, bumpTimelineRefresh, bumpGpsRefresh]);

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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-fg">Handoff Sales→CS</h3>
            {badge}
            {canEdit ? (
              <span className="inline-flex rounded-lg border border-line overflow-hidden text-[10px] font-bold uppercase tracking-wider" title="Tipo inferido por el agente — clic para corregir">
                {(["IMPLEMENTATION", "REIMPLEMENTATION"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setImplType(v)}
                    className={`px-2 py-0.5 transition-colors ${
                      status.implementationType === v
                        ? v === "IMPLEMENTATION"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700"
                        : "text-fg-muted hover:text-fg hover:bg-surface-hover"
                    }`}
                  >
                    {v === "IMPLEMENTATION" ? "Impl." : "Re-impl."}
                  </button>
                ))}
              </span>
            ) : status.implementationType ? (
              <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${status.implementationType === "IMPLEMENTATION" ? "text-blue-700 bg-blue-50 border-blue-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                {status.implementationType === "IMPLEMENTATION" ? "Implementación" : "Re-implementación"}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {generated
              ? `Armado con ${status.sourceSessions.length} sesión${status.sourceSessions.length === 1 ? "" : "es"} del proyecto${status.lastRunAt ? ` · ${fmtDate(status.lastRunAt)}` : ""}`
              : projectSessionCount > 0
              ? `${projectSessionCount} sesión${projectSessionCount === 1 ? "" : "es"} clasificada${projectSessionCount === 1 ? "" : "s"} a este proyecto`
              : "Al generar se clasifican las sesiones del cliente a este proyecto"}
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
          {canEdit && (
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
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 pb-3 -mt-1">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        </div>
      )}

      {/* Selección revisable de sesiones — curar antes de generar (A2). Solo editores;
          el CSE no la ve (rama canEdit), igual que el botón Generar. */}
      {!generated && canEdit && (
        <div className="border-t border-line px-5 py-3">
          <SessionSelectionReview
            projectId={projectId}
            onChange={fetchStatus}
            onAddManual={() => setShowSources(true)}
          />
        </div>
      )}

      {/* Fuentes manuales — solo editores del handoff (el CSE no las gestiona) */}
      {canEdit && (
      <div className="border-t border-line px-5 py-3">
        <button
          onClick={() => setShowSources((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-fg-muted hover:text-fg transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showSources ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Fuentes manuales{sources.length > 0 ? ` (${sources.length})` : ""}
        </button>

        {showSources && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-fg-muted leading-relaxed">
              Pegá transcripts o resúmenes de reuniones que NO entraron por el sync (ej. un Zoom externo).
              El agente de handoff los usa como una fuente más, etiquetados como manuales. Se guardan y
              cuentan también al regenerar.
            </p>

            {sources.length > 0 && (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">{s.title || "Sin título"}</p>
                      <p className="text-[11px] text-fg-muted truncate">{s.content.slice(0, 140)}</p>
                    </div>
                    <button
                      onClick={() => removeSource(s.id)}
                      title="Quitar fuente"
                      className="text-fg-muted hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 rounded-lg border border-line p-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Título (ej. Zoom con el cliente — 12 jun)"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Pegá acá el transcript o el resumen…"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={addSource}
                  disabled={savingSource || newContent.trim().length === 0}
                  className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {savingSource ? "Agregando…" : "Agregar fuente"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {generated && showDoc && status.canvasId && (
        <div className="border-t border-line px-4 py-4">
          <CanvasLinearView projectId={projectId} canvasId={status.canvasId} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}
