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
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { useWorkspace } from "./WorkspaceContext";
import { useMe } from "@/hooks/useMe";
import ProjectContextSection from "./ProjectContextSection";
import TagsStrip from "@/components/tags/TagsStrip";
import type { ImplementationType } from "@prisma/client";

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

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectHandoffSection({ projectId, clientId }: { projectId: string; clientId: string }) {
  const [status, setStatus] = useState<HandoffStatus | null>(null);
  const [tags, setTagsState] = useState<string[]>([]); // #5 — tags de producto/alcance del proyecto
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(false);
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

  // #5 — tags de producto/alcance del proyecto (tira compartida con el business case).
  const fetchTags = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/tags`);
      if (r.ok) { const d = await r.json(); setTagsState(d.tags ?? []); }
    } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  const saveTags = useCallback(async (slugs: string[]) => {
    setTagsState(slugs); // optimista
    try {
      const r = await fetch(`/api/projects/${projectId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: slugs }),
      });
      // res.ok=false NO lanza → chequear explícito para no dejar el chip "guardado" sin serlo.
      if (!r.ok) { setError("No se pudieron guardar los tags."); fetchTags(); }
    } catch { setError("Error de conexión al guardar los tags."); fetchTags(); }
  }, [projectId, fetchTags]);

  // Modalidad (impl/re-impl) — override del CSE/editor; acepta null ("Sin definir"). Optimista.
  const setModality = useCallback(async (value: ImplementationType | null) => {
    setStatus((s) => (s ? { ...s, implementationType: value } : s));
    try {
      const r = await fetch(`/api/projects/${projectId}/implementation-type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationType: value }),
      });
      if (!r.ok) { setError("No se pudo guardar la modalidad."); fetchStatus(); }
    } catch {
      setError("Error de conexión al guardar la modalidad."); fetchStatus();
    }
  }, [projectId, fetchStatus]);

  const handleGenerate = useCallback(async () => {
    const agentId = status?.agentId;
    if (!agentId) { setError("No se encontró el agente de handoff."); return; }
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    setGenerating(true);
    setError(null);
    const notifyUrl = `/clients/${clientId}`;
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
        if (result.status === "ERROR") {
          setError("El handoff falló durante la generación. Reintentá.");
          void notifyAgentDone({ group: "handoff", ok: false, url: notifyUrl });
          return;
        }
        if (result.status === "TIMEOUT") { setError("La generación está tardando más de lo normal. Revisá en unos minutos."); return; }
      }
      // 3. Sync a HubSpot (best-effort; reconciliable)
      if (handoffId) {
        fetch("/api/handoffs/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoffId }),
        }).catch(() => {});
      }
      // 4. Refrescar estado + tags + abrir el doc + avisar al cronograma (las fases las creó el handoff)
      await fetchStatus();
      fetchTags(); // el agente puede haber detectado/actualizado la clasificación (tags + modalidad)
      setShowDoc(true);
      bumpTimelineRefresh();
      bumpGpsRefresh(); // el widget del proyecto (pills de setup) se actualiza: handoff → ✓
      void notifyAgentDone({ group: "handoff", ok: true, url: notifyUrl });
    } catch {
      setError("Error de conexión al generar el handoff.");
    } finally {
      setGenerating(false);
    }
  }, [projectId, clientId, fetchStatus, fetchTags, status?.agentId, bumpTimelineRefresh, bumpGpsRefresh]);

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
          </div>
          <p className="text-xs text-fg-muted mt-0.5 truncate">
            {generated
              ? `Armado con ${status.sourceSessions.length} sesión${status.sourceSessions.length === 1 ? "" : "es"} del proyecto${status.lastRunAt ? ` · ${fmtDate(status.lastRunAt)}` : ""}`
              : projectSessionCount > 0
              ? `${projectSessionCount} sesión${projectSessionCount === 1 ? "" : "es"} clasificada${projectSessionCount === 1 ? "" : "s"} a este proyecto`
              : "Al generar se clasifican las sesiones del cliente a este proyecto"}
          </p>
          {/* #5 — clasificación del proyecto (modalidad + productos/alcance), compartida con el BC. */}
          <div className="mt-2">
            <TagsStrip
              tags={tags}
              implementationType={status.implementationType}
              canEdit={canEdit}
              onSetTags={saveTags}
              onSetModality={setModality}
            />
          </div>
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

      {/* Contexto — HubSpot · Google Meet · Fuentes manuales, en 3 columnas colapsables.
          Solo editores (el CSE no gestiona el contexto). Curado + display unificados. */}
      {canEdit && (
        <ProjectContextSection
          projectId={projectId}
          canEdit={canEdit}
          generated={generated}
          onSessionsChange={fetchStatus}
        />
      )}

      {generated && showDoc && status.canvasId && (
        <div className="border-t border-line px-4 py-4">
          <CanvasLinearView projectId={projectId} canvasId={status.canvasId} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}
