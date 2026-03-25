"use client";

import { useState, useEffect, useCallback } from "react";
import type { ClientCanvas } from "@/lib/canvas/template";
import { CLIENT_CANVAS_LABELS } from "@/lib/canvas/template";

interface Suggestion {
  id: string;
  section: string;
  current: unknown;
  suggested: unknown;
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
      const res = await fetch(`/api/clients/${clientId}/canvas/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, action }),
      });
      const data = await res.json();
      if (data.canvas) setCanvas(data.canvas);
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
    <div className={embedded ? "space-y-4" : "max-w-5xl mx-auto px-6 py-8 space-y-6"}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Canvas de empresa</h2>
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

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
            {suggestions.length} sugerencia{suggestions.length > 1 ? "s" : ""} pendiente{suggestions.length > 1 ? "s" : ""}
          </p>
          {suggestions.map((s) => (
            <div key={s.id} className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-xs font-medium text-amber-700">
                {CLIENT_CANVAS_LABELS[s.section as keyof ClientCanvas] ?? s.section}
              </p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {typeof s.suggested === "string" ? s.suggested : JSON.stringify(s.suggested, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button onClick={() => handleSuggestion(s.id, "accept")} className="px-3 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors">Aprobar</button>
                <button onClick={() => handleSuggestion(s.id, "reject")} className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors">Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Canvas masonry grid */}
      <div className="columns-1 md:columns-2 gap-4">
        {sections.map((key) => {
          const isEmpty = checkEmpty(canvas[key]);
          const conf: Confidence = isEmpty ? "empty" : (confidence[key] as Confidence) ?? "inferred";
          const style = CONFIDENCE_STYLES[conf];

          return (
            <div
              key={key}
              className={`break-inside-avoid mb-4 rounded-2xl ${isEmpty ? "border-2" : "border"} ${style.border} ${style.bg} p-5 transition-all`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                <h3 className="text-sm font-semibold text-gray-800">{CLIENT_CANVAS_LABELS[key] ?? key}</h3>
                {conf === "inferred" && (
                  <button
                    onClick={() => saveSection(key, canvas[key])}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
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
    </div>
  );
}

// ── Render values matching existing card style ──────────────────────────────

function CanvasValue({ value, sectionKey, onSave }: { value: unknown; sectionKey: string; onSave: (val: unknown) => void }) {
  if (typeof value === "string") {
    return <EditableText value={value} onSave={(v) => onSave(v)} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-gray-300 italic">Sin datos</p>;

    // String array (herramientas)
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

    // Object array (stakeholders)
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

function checkEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((v) =>
      typeof v === "string" ? !v.trim() : Array.isArray(v) ? v.length === 0 : false
    );
  }
  if (typeof value === "string") return !value.trim();
  return true;
}
