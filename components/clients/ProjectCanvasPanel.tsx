"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectCanvas } from "@/lib/canvas/template";
import { PROJECT_CANVAS_LABELS } from "@/lib/canvas/template";

export default function ProjectCanvasPanel({ projectId }: { projectId: string }) {
  const [canvas, setCanvas] = useState<ProjectCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const fetchCanvas = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/canvas`);
      const data = await res.json();
      setCanvas(data.canvas);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchCanvas(); }, [fetchCanvas]);

  const refreshCanvas = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/canvas/refresh`, { method: "POST" });
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
      const res = await fetch(`/api/projects/${projectId}/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvas: { [section]: value } }),
      });
      const data = await res.json();
      if (data.canvas) setCanvas(data.canvas);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!canvas) return <p className="p-5 text-sm text-gray-500">Error al cargar el canvas.</p>;

  const sections = Object.keys(canvas) as (keyof ProjectCanvas)[];
  const filledCount = sections.filter((k) => {
    const v = canvas[k];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object" && v !== null) return Object.values(v).some((val) => typeof val === "string" ? val.trim() : Array.isArray(val) ? val.length > 0 : true);
    return false;
  }).length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Canvas de proyecto</h2>
          <p className="text-xs text-gray-500 mt-0.5">Conocimiento del caso de uso actual</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <button
            onClick={refreshCanvas}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand-light hover:bg-brand/20 transition-colors disabled:opacity-50 text-xs font-medium"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Actualizando..." : "Actualizar con IA"}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${(filledCount / sections.length) * 100}%` }} />
            </div>
            <span>{filledCount}/{sections.length}</span>
          </div>
          {saving && <span className="text-gray-600">Guardando...</span>}
        </div>
      </div>

      {refreshError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <span>{refreshError}</span>
          <button onClick={() => setRefreshError(null)} className="ml-auto text-red-400/60 hover:text-red-400">&times;</button>
        </div>
      )}

      {/* Canvas cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((key) => (
          <CanvasCard
            key={key}
            label={PROJECT_CANVAS_LABELS[key] ?? key}
            value={canvas[key]}
            onSave={(val) => saveSection(key, val)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Card renderer (always open) ──────────────────────────────────────────────

function CanvasCard({
  label,
  value,
  onSave,
}: {
  label: string;
  value: unknown;
  onSave: (val: unknown) => void;
}) {
  const isEmpty = checkEmpty(value);

  return (
    <div className={`rounded-xl border p-5 space-y-3 transition-colors ${
      isEmpty ? "border-gray-800 bg-gray-900/30" : "border-gray-700 bg-gray-900/60"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isEmpty ? "bg-gray-600" : "bg-green-500"}`} />
        <h3 className="text-sm font-semibold text-gray-200">{label}</h3>
      </div>

      {Array.isArray(value) ? (
        <ArrayEditor items={value} onSave={onSave} />
      ) : typeof value === "object" && value !== null ? (
        <ObjectField obj={value as Record<string, unknown>} onSave={onSave} />
      ) : (
        <StringEditor value={String(value ?? "")} onSave={onSave} />
      )}
    </div>
  );
}

function ObjectField({ obj, onSave }: { obj: Record<string, unknown>; onSave: (val: unknown) => void }) {
  const [local, setLocal] = useState(obj);

  const handleBlur = () => {
    if (JSON.stringify(local) !== JSON.stringify(obj)) onSave(local);
  };

  return (
    <div className="space-y-2">
      {Object.entries(local).map(([k, v]) => {
        if (Array.isArray(v)) {
          return (
            <div key={k}>
              <label className="text-xs text-gray-500 capitalize">{k.replace(/_/g, " ")}</label>
              <TagsEditor
                tags={v as string[]}
                onSave={(newTags) => {
                  const updated = { ...local, [k]: newTags };
                  setLocal(updated);
                  onSave(updated);
                }}
              />
            </div>
          );
        }
        return (
          <div key={k}>
            <label className="text-xs text-gray-500 capitalize">{k.replace(/_/g, " ")}</label>
            <input
              value={String(v ?? "")}
              onChange={(e) => setLocal({ ...local, [k]: e.target.value })}
              onBlur={handleBlur}
              className="w-full mt-0.5 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand/50"
            />
          </div>
        );
      })}
    </div>
  );
}

function StringEditor({ value, onSave }: { value: string; onSave: (val: unknown) => void }) {
  const [local, setLocal] = useState(value);
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand/50"
    />
  );
}

function ArrayEditor({ items, onSave }: { items: unknown[]; onSave: (val: unknown) => void }) {
  if (items.length === 0 || typeof items[0] === "string") {
    return <TagsEditor tags={items as string[]} onSave={onSave} />;
  }

  const [local, setLocal] = useState(items as Record<string, unknown>[]);

  const handleChange = (idx: number, field: string, value: string) => {
    const updated = [...local];
    updated[idx] = { ...updated[idx], [field]: value };
    setLocal(updated);
  };

  const handleBlur = () => {
    if (JSON.stringify(local) !== JSON.stringify(items)) onSave(local);
  };

  const addItem = () => {
    const template = items[0]
      ? Object.fromEntries(Object.keys(items[0] as object).map((k) => [k, Array.isArray((items[0] as Record<string, unknown>)[k]) ? [] : ""]))
      : { nombre: "" };
    setLocal([...local, template as Record<string, unknown>]);
  };

  return (
    <div className="space-y-3">
      {local.map((item, idx) => (
        <div key={idx} className="p-2 bg-gray-800/50 rounded-lg space-y-1.5">
          {Object.entries(item).map(([k, v]) =>
            Array.isArray(v) ? (
              <div key={k}>
                <label className="text-xs text-gray-500 capitalize">{k.replace(/_/g, " ")}</label>
                <TagsEditor
                  tags={v as string[]}
                  onSave={(newTags) => {
                    handleChange(idx, k, newTags as unknown as string);
                    const updated = [...local];
                    updated[idx] = { ...updated[idx], [k]: newTags };
                    setLocal(updated);
                    onSave(updated);
                  }}
                />
              </div>
            ) : (
              <div key={k}>
                <label className="text-xs text-gray-500 capitalize">{k.replace(/_/g, " ")}</label>
                <input
                  value={String(v ?? "")}
                  onChange={(e) => handleChange(idx, k, e.target.value)}
                  onBlur={handleBlur}
                  className="w-full mt-0.5 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-brand/50"
                />
              </div>
            )
          )}
        </div>
      ))}
      <button onClick={addItem} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
        + Agregar
      </button>
    </div>
  );
}

function TagsEditor({ tags, onSave }: { tags: string[]; onSave: (val: unknown) => void }) {
  const [local, setLocal] = useState(tags);
  const [input, setInput] = useState("");

  const add = () => {
    if (!input.trim()) return;
    const updated = [...local, input.trim()];
    setLocal(updated);
    setInput("");
    onSave(updated);
  };

  const remove = (idx: number) => {
    const updated = local.filter((_, i) => i !== idx);
    setLocal(updated);
    onSave(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {local.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
            {tag}
            <button onClick={() => remove(i)} className="text-gray-500 hover:text-gray-300">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Agregar..."
          className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-brand/50"
        />
        <button onClick={add} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300">+</button>
      </div>
    </div>
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
