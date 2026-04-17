"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientCanvas } from "@/lib/canvas/template";
import { CLIENT_CANVAS_LABELS } from "@/lib/canvas/template";
import HubBadge from "@/components/ui/HubBadge";
import ProjectTypeBadge from "@/components/ui/ProjectTypeBadge";

interface Suggestion {
  id: string;
  section: string;
  current: unknown;
  suggested: unknown;
  sourceLabel: string | null;
  createdAt: string;
}

type Confidence = "confirmed" | "inferred" | "empty";

const CONFIDENCE_STYLES: Record<Confidence, { dot: string; border: string; bg: string; label: string }> = {
  confirmed: { dot: "bg-green-500", border: "border-gray-100", bg: "bg-white", label: "Confirmado" },
  inferred:  { dot: "bg-amber-400", border: "border-amber-200", bg: "bg-amber-50/50", label: "Por confirmar" },
  empty:     { dot: "bg-gray-300", border: "border-dashed border-gray-200", bg: "bg-white", label: "Sin datos" },
};

export default function ClientCanvasPanel({ clientId, embedded }: { clientId: string; embedded?: boolean }) {
  const [canvas, setCanvas] = useState<ClientCanvas | null>(null);
  const [confidence, setConfidence] = useState<Record<string, Confidence>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const fetchCanvas = useCallback(async () => {
    try {
      const [canvasRes, suggestionsRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/canvas`),
        fetch(`/api/clients/${clientId}/canvas/suggestions`),
      ]);
      const canvasData = await canvasRes.json();
      const suggestionsData = await suggestionsRes.json();
      setCanvas(canvasData.canvas);
      setConfidence(canvasData.confidence ?? {});
      setSuggestions(suggestionsData.suggestions ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchCanvas(); }, [fetchCanvas]);

  const refreshCanvas = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/canvas/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRefreshError(data.error ?? "Error al actualizar");
      } else {
        await fetchCanvas();
      }
    } catch {
      setRefreshError("Error de conexión");
    }
    setRefreshing(false);
  };

  const saveSection = async (section: string, value: unknown) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvas: { [section]: value }, confidence: { [section]: "confirmed" } }),
      });
      const data = await res.json();
      if (data.canvas) setCanvas(data.canvas);
      if (data.confidence) setConfidence(data.confidence);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleSuggestion = async (suggestionId: string, action: "accept" | "reject") => {
    try {
      const suggestion = suggestions.find((s) => s.id === suggestionId);
      const res = await fetch(`/api/clients/${clientId}/canvas/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, action }),
      });
      const data = await res.json();
      if (data.canvas) setCanvas(data.canvas);
      if (data.confidence) setConfidence(data.confidence);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="columns-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="break-inside-avoid mb-4 h-32 bg-gray-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!canvas) return <p className="p-5 text-sm text-gray-400">Error al cargar el canvas.</p>;

  const sections = Object.keys(canvas) as (keyof ClientCanvas)[];
  const filledCount = sections.filter((k) => !checkEmpty(canvas[k])).length;

  return (
    <div className={embedded ? "p-5 space-y-4" : "max-w-5xl mx-auto px-6 py-8 space-y-6"}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Estrategia</h2>
            <p className="text-sm text-gray-400 mt-0.5">Conocimiento compartido entre proyectos</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshCanvas}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand hover:bg-brand/20 transition-colors disabled:opacity-50 text-xs font-medium"
            >
              <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? "Actualizando..." : "Actualizar con IA"}
            </button>
            <span className="text-xs text-gray-400">{filledCount}/{sections.length}</span>
            {saving && <span className="text-xs text-gray-400">Guardando...</span>}
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{filledCount}/{sections.length} campos</span>
          <button
            onClick={refreshCanvas}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50 text-xs font-medium"
          >
            <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Actualizando..." : "Actualizar con IA"}
          </button>
        </div>
      )}

      {refreshError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
          <span>{refreshError}</span>
          <button onClick={() => setRefreshError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Legends */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        {(Object.entries(CONFIDENCE_STYLES) as [Confidence, typeof CONFIDENCE_STYLES[Confidence]][]).map(([key, style]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        ))}
      </div>

      {/* Suggestions banner */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs text-amber-800">
            <strong>{suggestions.length}</strong> {suggestions.length === 1 ? "sugerencia nueva" : "sugerencias nuevas"} del agente — revisa y acepta o rechaza
          </span>
          <button
            onClick={() => suggestions.forEach((s) => handleSuggestion(s.id, "accept"))}
            className="ml-auto px-2.5 py-1 text-[10px] font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            Aceptar todos
          </button>
        </div>
      )}

      {/* Unified masonry grid — drafts and confirmed cards together in section order */}
      <div className="columns-1 md:columns-2 gap-4">
        {sections.map((key) => {
          const suggestion = suggestions.find((s) => s.section === key);
          const isEmpty = checkEmpty(canvas[key]);
          const conf: Confidence = isEmpty ? "empty" : (confidence[key] as Confidence) ?? "inferred";
          const style = CONFIDENCE_STYLES[conf];

          // If there's a pending suggestion for this section, render as draft card
          if (suggestion) {
            return (
              <div key={key} className="break-inside-avoid mb-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/30 overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-800 flex-1 leading-tight">
                    {CLIENT_CANVAS_LABELS[key as keyof ClientCanvas] ?? key}
                  </h4>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-600 bg-amber-100 flex-shrink-0">
                    BORRADOR
                  </span>
                  {suggestion.sourceLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 border border-violet-100 font-medium flex-shrink-0 truncate max-w-[100px]">
                      {suggestion.sourceLabel}
                    </span>
                  )}
                  <button onClick={() => handleSuggestion(suggestion.id, "accept")} className="p-1 rounded text-green-600 hover:bg-green-50 flex-shrink-0" title="Aceptar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={() => handleSuggestion(suggestion.id, "reject")} className="p-1 rounded text-red-500 hover:bg-red-50 flex-shrink-0" title="Rechazar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="px-4 py-3 border-t border-amber-200/50">
                  <CanvasValue
                    value={suggestion.suggested}
                    sectionKey={key}
                    onSave={(val) => {
                      handleSuggestion(suggestion.id, "accept");
                      saveSection(key, val);
                    }}
                  />
                </div>
              </div>
            );
          }

          // Regular confirmed/empty section
          return (
            <div
              key={key}
              className={`break-inside-avoid mb-4 rounded-2xl ${isEmpty ? "border-2" : "border"} ${style.border} ${style.bg} p-5 transition-all`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                <h3 className="text-sm font-semibold text-gray-800">{CLIENT_CANVAS_LABELS[key] ?? key}</h3>
                {conf === "confirmed" && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 font-medium">
                    Confirmada
                  </span>
                )}
                {conf === "inferred" && (
                  <button
                    onClick={() => saveSection(key, canvas[key])}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors"
                  >
                    Confirmar
                  </button>
                )}
              </div>

              {isEmpty ? (
                <p className="text-sm text-gray-300 italic">Sin datos aún</p>
              ) : (
                <CanvasValue value={canvas[key]} sectionKey={key} onSave={(val) => saveSection(key, val)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Proyectos activos movido a WorkspaceClient — fuera del canvas de empresa */}
    </div>
  );
}

// ── Render values matching existing card style ──────────────────────────────

function CanvasValue({ value, sectionKey, onSave }: { value: unknown; sectionKey: string; onSave: (val: unknown) => void }) {
  // ── Specialized renderers ──
  if (sectionKey === "escala_rendimiento") {
    return <EscalaRendimiento value={value as ClientCanvas["escala_rendimiento"]} onSave={onSave} />;
  }

  if (sectionKey === "retos_estrategicos") {
    const items = value as ClientCanvas["retos_estrategicos"];
    if (!items?.length) return <p className="text-sm text-gray-300 italic">Sin datos</p>;
    return (
      <div className="space-y-2">
        {items.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${r.estado === "validado" ? "bg-green-500" : "bg-amber-400"}`} />
            <div className="flex-1">
              <p className="text-gray-700">{r.descripcion}</p>
              <p className="text-[10px] text-gray-400">{r.fuente} · {r.estado === "validado" ? "Validado" : "Por validar"}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sectionKey === "oportunidades_futuras") {
    const items = value as ClientCanvas["oportunidades_futuras"];
    if (!items?.length) return <p className="text-sm text-gray-300 italic">Sin datos</p>;
    const estadoColors: Record<string, string> = {
      identificada: "bg-gray-100 text-gray-600",
      propuesta: "bg-blue-50 text-blue-600",
      aceptada: "bg-green-50 text-green-600",
      descartada: "bg-red-50 text-red-500",
    };
    return (
      <div className="space-y-2">
        {items.map((o, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="text-brand mt-1">•</span>
            <div className="flex-1">
              <p className="text-gray-700">{o.descripcion}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 font-medium">{o.hub}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${estadoColors[o.estado] ?? "bg-gray-100 text-gray-500"}`}>{o.estado}</span>
                <span className="text-[10px] text-gray-400">Nivel {o.escala_nivel}/4</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Generic renderers ──
  if (typeof value === "string") {
    return <EditableText value={value} onSave={(v) => onSave(v)} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-gray-300 italic">Sin datos</p>;

    if (typeof value[0] === "string") {
      return (
        <ul className="space-y-1">
          {value.map((item, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-brand mt-1">•</span>
              <span>{item as string}</span>
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((item, i) => (
          <div key={i} className="text-sm text-gray-600 space-y-0.5">
            {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
              <p key={k}>
                <span className="font-medium text-gray-500 capitalize">{k.replace(/_/g, " ")}:</span>{" "}
                {Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "")}
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="space-y-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-gray-400 capitalize mb-0.5">{k.replace(/_/g, " ")}</p>
            <p className="text-sm text-gray-700">{String(v ?? "—")}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── Escala de rendimiento ────────────────────────────────────────────────────

function EscalaRendimiento({ value, onSave }: { value: ClientCanvas["escala_rendimiento"]; onSave: (val: unknown) => void }) {
  const v = value ?? { general: 0, por_hub: { marketing: 0, sales: 0, service: 0 }, objetivo: 0 };

  const updateHub = (hub: "marketing" | "sales" | "service", level: number) => {
    const newPorHub = { ...v.por_hub, [hub]: level };
    const activeHubs = [newPorHub.marketing, newPorHub.sales, newPorHub.service].filter((l) => l > 0);
    const newGeneral = activeHubs.length > 0 ? Math.round(activeHubs.reduce((a, b) => a + b, 0) / activeHubs.length) : 0;
    onSave({ ...v, por_hub: newPorHub, general: newGeneral });
  };

  const updateObjetivo = (objetivo: number) => {
    onSave({ ...v, objetivo });
  };

  const LevelSelector = ({ label, level, color, onChange }: { label: string; level: number; color: string; onChange: (n: number) => void }) => (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-8 h-6 rounded text-[10px] font-semibold transition-colors ${
              n <= level ? color : "bg-gray-100 text-gray-400 hover:bg-gray-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-[11px] font-semibold text-gray-600 w-6 text-right">{level}/4</span>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl font-bold text-gray-900">{v.general}</span>
        <span className="text-sm text-gray-400">/4 general</span>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-gray-400">Meta:</span>
          <select
            value={v.objetivo}
            onChange={(e) => updateObjetivo(Number(e.target.value))}
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 font-medium focus:outline-none"
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}/4</option>
            ))}
          </select>
        </div>
      </div>
      <LevelSelector label="Marketing" level={v.por_hub?.marketing ?? 0} color="bg-orange-400 text-white" onChange={(n) => updateHub("marketing", n)} />
      <LevelSelector label="Sales" level={v.por_hub?.sales ?? 0} color="bg-blue-400 text-white" onChange={(n) => updateHub("sales", n)} />
      <LevelSelector label="Service" level={v.por_hub?.service ?? 0} color="bg-green-400 text-white" onChange={(n) => updateHub("service", n)} />
    </div>
  );
}

function EditableText({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (!editing) {
    return (
      <p
        className="text-sm text-gray-700 cursor-pointer hover:text-gray-900 transition-colors"
        onClick={() => setEditing(true)}
      >
        {value || <span className="italic text-gray-300">Click para editar</span>}
      </p>
    );
  }

  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); setEditing(false); }}
      autoFocus
      rows={3}
      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 resize-none"
    />
  );
}

// ── Proyectos activos (dinámico) ─────────────────────────────────────────────

interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  projectType: string | null;
  serviceType: string | null;
  tags: string[];
  currentStage: number;
  currentStep: number;
}

const STAGE_NAMES: Record<number, string> = { 1: "Diagnóstico", 2: "Planificación", 3: "Adopción" };

export function ProjectosActivos({ clientId }: { clientId: string }) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchProjects = () => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {});
  };

  useEffect(() => { fetchProjects(); }, [clientId]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/sync-services`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        const parts = [];
        if (data.created) parts.push(`${data.created} creados`);
        if (data.updated) parts.push(`${data.updated} actualizados`);
        if (data.skipped) parts.push(`${data.skipped} inactivos`);
        setSyncResult(parts.length ? parts.join(", ") : `${data.found} servicios encontrados, sin cambios`);
        fetchProjects();
      }
    } catch {
      setSyncResult("Error de conexión");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">Proyectos activos</h3>
        {projects.length > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {projects.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {syncResult && (
            <span className="text-[10px] text-green-600 animate-in fade-in">{syncResult}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Sincronizar servicios desde HubSpot"
          >
            <svg className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Sincronizando..." : "Sync HubSpot"}
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">Sin proyectos</p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-2 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Sincronizar servicios desde HubSpot
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400">
                  Etapa {p.currentStage}: {STAGE_NAMES[p.currentStage] ?? `Etapa ${p.currentStage}`}
                </p>
              </div>
              <ProjectTypeBadge projectType={p.projectType} size="xs" />
              <HubBadge tags={p.tags} serviceType={p.serviceType} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function checkEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "number") return value === 0;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((v) =>
      typeof v === "string" ? !v.trim()
      : typeof v === "number" ? v === 0
      : Array.isArray(v) ? v.length === 0
      : typeof v === "object" && v !== null ? checkEmpty(v)
      : true
    );
  }
  if (typeof value === "string") return !value.trim();
  return true;
}
