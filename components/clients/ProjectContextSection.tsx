"use client";

/**
 * components/clients/ProjectContextSection.tsx
 *
 * Sección "Contexto" del proyecto (reemplaza el bloque suelto "Detectado en HubSpot" +
 * selección de sesiones + fuentes manuales). Colapsable (toggle) y en 3 columnas:
 * HubSpot · Google Meet · Fuentes manuales. Es la materia prima que los agentes usan al
 * generar. Por defecto EXPANDIDO si el handoff no se generó (hace falta ver/curar las
 * fuentes), y COLAPSADO una vez generado (ya pesa menos); el toggle manual manda.
 *
 * Reusa los componentes existentes en `columnMode` (HubspotTimelinePanel,
 * SessionSelectionReview) y posee la gestión de fuentes manuales. Solo editores
 * (handoffAnywhere): el CSE no gestiona el contexto. Gateado por `canEdit` en el padre.
 */
import { useState, useCallback, useEffect } from "react";
import HubspotTimelinePanel from "./HubspotTimelinePanel";
import SessionSelectionReview from "./SessionSelectionReview";
import { ContextColumn, ContextColumnList, ContextRow, CTX_ICONS } from "./context-column";

interface ManualSource {
  id: string;
  title: string | null;
  content: string;
  createdByEmail: string | null;
  createdAt: string;
}

export default function ProjectContextSection({
  projectId,
  canEdit,
  generated,
  onSessionsChange,
}: {
  projectId: string;
  canEdit: boolean;
  generated: boolean;
  /** El padre re-consulta el estado del handoff cuando cambian las sesiones que alimentan. */
  onSessionsChange?: () => void;
}) {
  // Colapso: por defecto colapsado si ya se generó. `override` (toggle manual) manda.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !generated;

  // Contadores por columna (los reportan los hijos / la columna manual los sabe directo).
  // Todos miden lo MISMO: "fuentes que alimentan el handoff" — HubSpot y Meet cuentan lo
  // que alimenta (no excluido); las excluidas a mano van aparte.
  const [hubspotCount, setHubspotCountState] = useState(0);
  const [hubspotExcluded, setHubspotExcludedState] = useState(0);
  const [meetCount, setMeetCountState] = useState(0);
  const [meetExcluded, setMeetExcludedState] = useState(0);
  const setHubspotCount = useCallback((n: number) => setHubspotCountState((c) => (c === n ? c : n)), []);
  const setHubspotExcluded = useCallback((n: number) => setHubspotExcludedState((c) => (c === n ? c : n)), []);
  const setMeetCount = useCallback((n: number) => setMeetCountState((c) => (c === n ? c : n)), []);
  const setMeetExcluded = useCallback((n: number) => setMeetExcludedState((c) => (c === n ? c : n)), []);

  // Fuentes manuales (transcripts/resúmenes pegados a mano).
  const [sources, setSources] = useState<ManualSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-sources`);
      if (r.ok) { const d = await r.json(); setSources(d.sources ?? []); }
    } catch { /* ignore */ }
  }, [projectId]);
  // Carga inicial inline (el setState es post-fetch, no síncrono — patrón sin set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/handoff-sources`);
        if (r.ok) { const d = await r.json(); if (!cancelled) setSources(d.sources ?? []); }
      } catch { /* ignore */ } finally { if (!cancelled) setLoadingSources(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const addSource = useCallback(async () => {
    const content = newContent.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || undefined, content }),
      });
      if (r.ok) { setNewTitle(""); setNewContent(""); setShowAdd(false); await fetchSources(); }
    } catch { /* ignore */ }
    setSaving(false);
  }, [projectId, newTitle, newContent, saving, fetchSources]);

  const removeSource = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${projectId}/handoff-sources/${id}`, { method: "DELETE" });
      await fetchSources();
    } catch { /* ignore */ }
  }, [projectId, fetchSources]);

  // "Alimentan" = todo lo que entra al handoff (mismo criterio en las 3 columnas). Las
  // excluidas a mano (Meet + HubSpot) se cuentan aparte (no alimentan, pero son gestionables).
  const feedTotal = hubspotCount + meetCount + sources.length;
  const excludedTotal = meetExcluded + hubspotExcluded;
  const dot = (color: string) => <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />;

  return (
    <div className="border-t border-line">
      {/* Header colapsable */}
      <button
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <svg className={`w-4 h-4 text-fg-secondary flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-bold text-fg">Contexto</span>
        <span className="text-[11px] text-fg-muted">
          {feedTotal} fuente{feedTotal === 1 ? "" : "s"} alimentan
          {excludedTotal > 0 ? ` · ${excludedTotal} excluida${excludedTotal === 1 ? "" : "s"}` : ""}
        </span>
        <span className="hidden sm:flex items-center gap-3 ml-2 text-[11px] text-fg-secondary">
          <span className="inline-flex items-center gap-1" title="HubSpot (alimentan)">{dot("#ff7a59")}{hubspotCount}</span>
          <span className="inline-flex items-center gap-1" title="Google Meet (alimentan)">{dot("#16a34a")}{meetCount}</span>
          <span className="inline-flex items-center gap-1" title="Fuentes manuales">{dot("#7c6df2")}{sources.length}</span>
        </span>
        <span className="ml-auto text-xs text-fg-muted">{open ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Cuerpo: 3 columnas. Siempre montado (los contadores del header valen colapsado);
          se oculta con `hidden` para no desmontar y re-fetchear al togglear. */}
      <div className={open ? "px-5 pb-4" : "hidden"}>
        <p className="text-[11px] text-fg-muted mb-2.5">
          Estas fuentes arman el handoff. Todo lo <span className="font-medium text-fg-secondary">incluido</span> alimenta la
          generación; <span className="font-medium text-fg-secondary">excluí</span> lo que sea de otro proyecto. En HubSpot,
          el material de la era del proyecto; el resto queda como trasfondo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ContextColumn icon={CTX_ICONS.hubspot} color="#ff7a59" title="HubSpot" count={hubspotCount}>
            <HubspotTimelinePanel
              projectId={projectId}
              columnMode
              onCount={setHubspotCount}
              onExcludedCount={setHubspotExcluded}
              canEdit={canEdit}
            />
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={meetCount}>
            <SessionSelectionReview
              projectId={projectId}
              columnMode
              onCount={setMeetCount}
              onExcludedCount={setMeetExcluded}
              onChange={onSessionsChange}
              readOnly={!canEdit}
            />
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={sources.length}>
            <ContextColumnList loading={loadingSources} empty="Sin notas ni transcripciones a mano.">
              {sources.map((s) => (
                <ContextRow
                  key={s.id}
                  icon={CTX_ICONS.note}
                  meta="Manual"
                  title={s.title || "Sin título"}
                  snippet={s.content.slice(0, 120)}
                  onRemove={canEdit ? () => removeSource(s.id) : undefined}
                  removeTitle="Quitar fuente"
                />
              ))}
            </ContextColumnList>

            {canEdit && (showAdd ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título (ej. Zoom con el cliente)"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  placeholder="Pegá el transcript o resumen…"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
                />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => { setShowAdd(false); setNewTitle(""); setNewContent(""); }} className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-lg transition-colors">Cancelar</button>
                  <button onClick={addSource} disabled={saving || newContent.trim().length === 0} className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">{saving ? "Agregando…" : "Agregar"}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Agregar fuente
              </button>
            ))}
          </ContextColumn>
        </div>
      </div>
    </div>
  );
}
