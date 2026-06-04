"use client";

/**
 * components/canvas/CronogramaCanvas.tsx
 *
 * Canvas "Cronograma": VER + EDITAR el ProjectTimeline (fases/semanas/sesiones).
 * Fuente única = ProjectTimeline (el Kickoff lo refleja read-only). Consume el
 * endpoint existente GET/PUT /api/projects/[id]/timeline (PUT = bulk con diff:
 * fases con id → update, sin id → create, faltantes → delete).
 *
 * Render INTERNO (tema oscuro del panel de canvas), no el design system del Kickoff.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface Phase {
  id?: string; // las fases existentes traen id; las nuevas no (→ create)
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  source?: string; // AGENT | MODIFIED | HUMAN (solo display)
  _key: string; // key estable de React
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function addWeeks(iso: string, w: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + w * 7);
  return d;
}
function fmtDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  AGENT: { label: "IA", cls: "text-blue-300 bg-blue-900/30 border-blue-700/40" },
  MODIFIED: { label: "Editado", cls: "text-teal-300 bg-teal-900/30 border-teal-700/40" },
  HUMAN: { label: "Manual", cls: "text-gray-300 bg-gray-800 border-gray-700" },
};

export default function CronogramaCanvas({ projectId }: { projectId: string }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [anchor, setAnchor] = useState<string>(""); // yyyy-mm-dd o ""
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyCounter = useRef(0);
  const nextKey = () => `new-${keyCounter.current++}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      const data = await res.json();
      if (data.exists) {
        setPhases(
          (data.phases ?? []).map((p: Phase & { id: string }) => ({
            id: p.id,
            name: p.name,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            notes: p.notes,
            source: p.source,
            _key: p.id,
          })),
        );
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
      } else {
        setPhases([]);
        setAnchor("");
      }
      setError(null);
    } catch {
      setError("No se pudo cargar el cronograma.");
    }
    setLoading(false);
    setDirty(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const updatePhase = (key: string, patch: Partial<Phase>) => {
    setPhases((ps) => ps.map((p) => (p._key === key ? { ...p, ...patch } : p)));
    setDirty(true);
  };
  const addPhase = () => {
    setPhases((ps) => [...ps, { name: "", durationWeeks: 1, sessionCount: null, notes: null, _key: nextKey() }]);
    setDirty(true);
  };
  const removePhase = (key: string) => {
    setPhases((ps) => ps.filter((p) => p._key !== key));
    setDirty(true);
  };
  const move = (key: string, dir: -1 | 1) => {
    setPhases((ps) => {
      const i = ps.findIndex((p) => p._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ps.length) return ps;
      const copy = [...ps];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };

  const save = async () => {
    for (const p of phases) {
      if (!p.name.trim()) return setError("Cada fase necesita un nombre.");
      if (!Number.isInteger(p.durationWeeks) || p.durationWeeks <= 0)
        return setError("La duración de cada fase debe ser un entero mayor que 0.");
      if (p.sessionCount != null && (!Number.isInteger(p.sessionCount) || p.sessionCount <= 0))
        return setError("Las sesiones deben ser un entero mayor que 0 (o vacío).");
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        anchorStartDate: anchor ? new Date(anchor).toISOString() : null,
        phases: phases.map((p, i) => ({
          ...(p.id ? { id: p.id } : {}),
          name: p.name.trim(),
          order: i,
          durationWeeks: p.durationWeeks,
          sessionCount: p.sessionCount,
          notes: p.notes?.trim() ? p.notes.trim() : null,
        })),
      };
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.details?.[0] ?? d?.error ?? "No se pudo guardar el cronograma.");
        setSaving(false);
        return;
      }
      const data = await res.json();
      if (data.exists) {
        setPhases(
          (data.phases ?? []).map((p: Phase & { id: string }) => ({
            id: p.id,
            name: p.name,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            notes: p.notes,
            source: p.source,
            _key: p.id,
          })),
        );
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
      }
      setDirty(false);
    } catch {
      setError("Error de conexión al guardar.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-3 max-w-3xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  // Rangos de fecha acumulados (si hay anchor).
  let cum = 0;
  const rows = phases.map((p) => {
    const start = cum;
    cum += p.durationWeeks || 1;
    return { p, start, end: cum };
  });
  const totalWeeks = phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Cabecera: fecha de arranque + total */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
            Fecha de arranque
          </label>
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              setAnchor(e.target.value);
              setDirty(true);
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-[11px] text-gray-500 mt-1">Opcional. Si la fijás, las fechas de cada fase se calculan solas.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{plural(totalWeeks, "semana", "semanas")}</div>
          <div className="text-[11px] text-gray-400">{plural(phases.length, "fase", "fases")} en total</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/50 text-red-300">
          <span className="text-sm font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold text-red-200 hover:text-white px-2 py-1 rounded hover:bg-red-800/40">Cerrar</button>
        </div>
      )}

      {/* Fases */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 px-5 py-8 text-center text-gray-400">
          <p className="text-sm">Todavía no hay cronograma. Agregá la primera fase.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ p, start, end }, i) => {
            const range = anchor
              ? `${fmtDay(addWeeks(anchor, start))} – ${fmtDay(addWeeks(anchor, end))}`
              : `Semana ${start + 1}${end > start + 1 ? `–${end}` : ""}`;
            const src = p.source ? SOURCE_LABEL[p.source] : null;
            return (
              <div key={p._key} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-xl font-bold text-blue-400 tabular-nums pt-1 w-8 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={p.name}
                        onChange={(e) => updatePhase(p._key, { name: e.target.value })}
                        placeholder="Nombre de la fase"
                        className="flex-1 bg-transparent text-base font-semibold text-white border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none pb-0.5"
                      />
                      {src && (
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${src.cls}`}>{src.label}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <label className="flex items-center gap-1.5 text-gray-400">
                        <span className="text-xs">Duración</span>
                        <input
                          type="number"
                          min={1}
                          value={p.durationWeeks}
                          onChange={(e) => updatePhase(p._key, { durationWeeks: parseInt(e.target.value, 10) || 0 })}
                          className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-xs">sem</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-gray-400">
                        <span className="text-xs">Sesiones</span>
                        <input
                          type="number"
                          min={1}
                          value={p.sessionCount ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updatePhase(p._key, { sessionCount: v === "" ? null : parseInt(v, 10) || 0 });
                          }}
                          placeholder="—"
                          className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
                        />
                      </label>
                      <span className="text-xs text-gray-500">{range}</span>
                    </div>

                    <textarea
                      value={p.notes ?? ""}
                      onChange={(e) => updatePhase(p._key, { notes: e.target.value || null })}
                      placeholder="Notas (opcional)"
                      rows={1}
                      className="w-full bg-transparent text-sm text-gray-300 border border-gray-800 hover:border-gray-700 focus:border-blue-500 focus:outline-none rounded-lg px-2.5 py-1.5 resize-none"
                    />
                  </div>

                  {/* Controles de la fase */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <button onClick={() => move(p._key, -1)} disabled={i === 0} title="Subir" className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-25 disabled:hover:bg-transparent">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button onClick={() => move(p._key, 1)} disabled={i === rows.length - 1} title="Bajar" className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-25 disabled:hover:bg-transparent">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button onClick={() => removePhase(p._key)} title="Eliminar fase" className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button onClick={addPhase} className="flex items-center gap-1.5 text-sm font-medium text-gray-300 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Agregar fase
        </button>
        <div className="ml-auto flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-400">Cambios sin guardar</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? "Guardando…" : "Guardar cronograma"}
          </button>
        </div>
      </div>
    </div>
  );
}
