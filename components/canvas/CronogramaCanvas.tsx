"use client";

/**
 * components/canvas/CronogramaCanvas.tsx
 *
 * Canvas "Cronograma": VER + EDITAR el ProjectTimeline.
 * Fuente única = ProjectTimeline (el Kickoff lo refleja read-only).
 *
 * D.1 — dos pestañas sobre el mismo modelo:
 *   - Gantt  → TimelineGantt (visualización + toggle de ESTADO por tarea vía
 *     PATCH /timeline/tasks/[taskId]; no edita estructura).
 *   - Editor → estructura: fases (como siempre) + tipo de actividad + tareas
 *     por semana. Guarda por PUT bulk (diff server-side de dos niveles).
 *
 * Disparo del agente de detalle: POST /api/clients/[clientId]/analyze con
 * agentId "agent-timeline-detail" (por eso este componente necesita clientId).
 * Confirmación del detalle (gate de la vista cliente): POST/DELETE
 * /timeline/confirm-detail. Regeneración: DELETE /timeline/detail (borra solo
 * tareas, conserva esqueleto/anchor/tipos) + re-correr el agente.
 *
 * Render INTERNO (tema oscuro del panel de canvas), no el design system del Kickoff.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { plural, computePhaseRanges, totalWeeks, fmtPhaseRange } from "@/lib/timeline/weeks";
import { ConfirmDialog } from "@/components/ui";
import TimelineGantt, { type GanttPhase, type GanttTaskStatus } from "./TimelineGantt";

interface TaskDraft {
  id?: string; // las existentes traen id; las nuevas no (→ create)
  title: string;
  weekIndex: number; // 0-indexed relativo a la fase (UI muestra 1-based)
  notes: string | null;
  status: GanttTaskStatus;
  needsValidation: boolean;
  source?: string;
  _key: string;
}

interface Phase {
  id?: string; // las fases existentes traen id; las nuevas no (→ create)
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  source?: string; // AGENT | MODIFIED | HUMAN (solo display)
  tasks: TaskDraft[];
  _key: string; // key estable de React
}

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  AGENT: { label: "IA", cls: "text-blue-300 bg-blue-900/30 border-blue-700/40" },
  MODIFIED: { label: "Editado", cls: "text-teal-300 bg-teal-900/30 border-teal-700/40" },
  HUMAN: { label: "Manual", cls: "text-gray-300 bg-gray-800 border-gray-700" },
};

const ACTIVITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Sin tipo" },
  { value: "EXPLORACION", label: "Exploración" },
  { value: "PLANIFICACION", label: "Planificación" },
  { value: "CONFIGURACION", label: "Configuración" },
  { value: "ADOPCION", label: "Adopción" },
  { value: "SEGUIMIENTO", label: "Seguimiento" },
];

interface ServerTask {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  status: GanttTaskStatus;
  notes: string | null;
  needsValidation: boolean;
  source: string;
}

interface ServerPhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  source: string;
  tasks: ServerTask[];
}

export default function CronogramaCanvas({ projectId, clientId }: { projectId: string; clientId: string }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [anchor, setAnchor] = useState<string>(""); // yyyy-mm-dd o ""
  const [detailConfirmedAt, setDetailConfirmedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<"gantt" | "editor">("editor");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [deleteDetailOpen, setDeleteDetailOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyCounter = useRef(0);
  const tabInitialized = useRef(false);
  const nextKey = () => `new-${keyCounter.current++}`;

  const mapServerPhases = (serverPhases: ServerPhase[]): Phase[] =>
    serverPhases.map((p) => ({
      id: p.id,
      name: p.name,
      durationWeeks: p.durationWeeks,
      sessionCount: p.sessionCount,
      notes: p.notes,
      activityType: p.activityType,
      source: p.source,
      tasks: (p.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        notes: t.notes,
        status: t.status,
        needsValidation: t.needsValidation,
        source: t.source,
        _key: t.id,
      })),
      _key: p.id,
    }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      const data = await res.json();
      if (data.exists) {
        const mapped = mapServerPhases(data.phases ?? []);
        setPhases(mapped);
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
        setDetailConfirmedAt(data.detailConfirmedAt ?? null);
        if (!tabInitialized.current) {
          tabInitialized.current = true;
          setTab(mapped.some((p) => p.tasks.length > 0) ? "gantt" : "editor");
        }
      } else {
        setPhases([]);
        setAnchor("");
        setDetailConfirmedAt(null);
        if (!tabInitialized.current) {
          tabInitialized.current = true;
          setTab("editor");
        }
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

  // ── Edición de fases ──────────────────────────────────────────────────────────
  const updatePhase = (key: string, patch: Partial<Phase>) => {
    setPhases((ps) => ps.map((p) => (p._key === key ? { ...p, ...patch } : p)));
    setDirty(true);
  };
  const addPhase = () => {
    setPhases((ps) => [
      ...ps,
      { name: "", durationWeeks: 1, sessionCount: null, notes: null, activityType: null, tasks: [], _key: nextKey() },
    ]);
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

  // ── Edición de tareas (estructura — el estado se cambia en el Gantt) ──────────
  const updateTask = (phaseKey: string, taskKey: string, patch: Partial<TaskDraft>) => {
    setPhases((ps) =>
      ps.map((p) =>
        p._key === phaseKey
          ? { ...p, tasks: p.tasks.map((t) => (t._key === taskKey ? { ...t, ...patch } : t)) }
          : p,
      ),
    );
    setDirty(true);
  };
  const addTask = (phaseKey: string) => {
    setPhases((ps) =>
      ps.map((p) =>
        p._key === phaseKey
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { title: "", weekIndex: 0, notes: null, status: "PENDING" as const, needsValidation: false, _key: nextKey() },
              ],
            }
          : p,
      ),
    );
    setDirty(true);
  };
  const removeTask = (phaseKey: string, taskKey: string) => {
    setPhases((ps) =>
      ps.map((p) => (p._key === phaseKey ? { ...p, tasks: p.tasks.filter((t) => t._key !== taskKey) } : p)),
    );
    setDirty(true);
  };

  // ── Guardar (PUT bulk — fases + tareas) ───────────────────────────────────────
  const save = async () => {
    for (const p of phases) {
      if (!p.name.trim()) return setError("Cada fase necesita un nombre.");
      if (!Number.isInteger(p.durationWeeks) || p.durationWeeks <= 0)
        return setError("La duración de cada fase debe ser un entero mayor que 0.");
      if (p.sessionCount != null && (!Number.isInteger(p.sessionCount) || p.sessionCount <= 0))
        return setError("Las sesiones deben ser un entero mayor que 0 (o vacío).");
      for (const t of p.tasks) {
        if (!t.title.trim()) return setError(`Cada tarea de "${p.name || "la fase"}" necesita un título.`);
      }
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        anchorStartDate: anchor ? new Date(anchor).toISOString() : null,
        phases: phases.map((p, i) => {
          // order de tareas: secuencial dentro de cada semana, en el orden actual de la lista
          const perWeek = new Map<number, number>();
          const tasks = p.tasks.map((t) => {
            const weekIndex = Math.min(Math.max(t.weekIndex, 0), Math.max(p.durationWeeks - 1, 0));
            const order = perWeek.get(weekIndex) ?? 0;
            perWeek.set(weekIndex, order + 1);
            return {
              ...(t.id ? { id: t.id } : {}),
              title: t.title.trim(),
              weekIndex,
              order,
              notes: t.notes?.trim() ? t.notes.trim() : null,
            };
          });
          return {
            ...(p.id ? { id: p.id } : {}),
            name: p.name.trim(),
            order: i,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            notes: p.notes?.trim() ? p.notes.trim() : null,
            activityType: p.activityType || null,
            tasks,
          };
        }),
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
        setPhases(mapServerPhases(data.phases ?? []));
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
        setDetailConfirmedAt(data.detailConfirmedAt ?? null);
      }
      setDirty(false);
    } catch {
      setError("Error de conexión al guardar.");
    }
    setSaving(false);
  };

  // ── Generar detalle con IA ────────────────────────────────────────────────────
  const generateDetail = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: 1,
          step: 0,
          stepLabel: "Detalle de cronograma",
          sectionLabel: "Detalle de cronograma",
          agentId: "agent-timeline-detail",
          projectId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Error al generar el detalle.");
      } else if (data?.timelineDetail?.skipped) {
        const reason = data.timelineDetail.reason;
        setError(
          reason === "detail_exists"
            ? "Ya existe un detalle — borralo ('Borrar detalle') para regenerarlo."
            : `No se generó el detalle (${reason ?? "salida vacía"}).`,
        );
      } else {
        await load();
        setTab("gantt");
      }
    } catch {
      setError("Error de conexión al generar el detalle.");
    }
    setGenerating(false);
  };

  // ── Confirmación del detalle (gate de la vista cliente) ───────────────────────
  const setDetailConfirmed = async (confirm: boolean) => {
    setConfirmBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/confirm-detail`, {
        method: confirm ? "POST" : "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error ?? "No se pudo actualizar la confirmación.");
      else setDetailConfirmedAt(data.confirmedAt ?? null);
    } catch {
      setError("Error de conexión.");
    }
    setConfirmBusy(false);
  };

  // ── Borrar detalle (conserva esqueleto/anchor/tipos) ──────────────────────────
  const deleteDetail = async () => {
    const res = await fetch(`/api/projects/${projectId}/timeline/detail`, { method: "DELETE" });
    setDeleteDetailOpen(false);
    if (!res.ok) {
      setError("No se pudo borrar el detalle.");
      return;
    }
    await load();
    setTab("editor");
  };

  // ── Toggle de estado desde el Gantt (PATCH, optimista) ────────────────────────
  const toggleStatus = async (taskId: string, next: GanttTaskStatus) => {
    setPhases((ps) =>
      ps.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)),
      })),
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) await load(); // revert con el estado real
    } catch {
      await load();
    }
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

  // Derivados
  const ranges = computePhaseRanges(phases);
  const rows = phases.map((p, i) => ({ p, ...ranges[i] }));
  const weeksTotal = totalWeeks(phases);
  const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
  const pendingValidation = phases.reduce(
    (n, p) => n + p.tasks.filter((t) => t.needsValidation).length,
    0,
  );
  const persistedPhases: GanttPhase[] = phases
    .filter((p): p is Phase & { id: string } => !!p.id)
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      order: i,
      durationWeeks: p.durationWeeks,
      sessionCount: p.sessionCount,
      notes: p.notes,
      activityType: p.activityType,
      tasks: p.tasks
        .filter((t): t is TaskDraft & { id: string } => !!t.id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          weekIndex: t.weekIndex,
          order: 0,
          status: t.status,
          notes: t.notes,
          needsValidation: t.needsValidation,
          source: t.source ?? "HUMAN",
        })),
    }));

  return (
    <div className="space-y-5">
      {/* Cabecera: tabs + acciones del detalle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-800 bg-gray-900 p-0.5">
          {(["gantt", "editor"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "gantt" ? "Gantt" : "Editor"}
            </button>
          ))}
        </div>

        {phases.length > 0 && totalTasks === 0 && (
          <button
            onClick={generateDetail}
            disabled={generating}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
          >
            {generating ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Generando detalle…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generar detalle con IA
              </>
            )}
          </button>
        )}

        {/* Barra de confirmación del detalle */}
        {totalTasks > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {pendingValidation > 0 && (
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/50 rounded-lg px-2.5 py-1.5">
                ⚠ {plural(pendingValidation, "tarea por validar", "tareas por validar")}
              </span>
            )}
            {detailConfirmedAt ? (
              <>
                <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-2.5 py-1.5">
                  ✓ Detalle confirmado — visible para el cliente
                </span>
                <button
                  onClick={() => setDetailConfirmed(false)}
                  disabled={confirmBusy}
                  className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                >
                  Quitar confirmación
                </button>
              </>
            ) : (
              <button
                onClick={() => setDetailConfirmed(true)}
                disabled={confirmBusy}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3.5 py-1.5 disabled:opacity-50 transition-colors"
                title="Habilita que el cliente vea las acciones por semana en el kickoff"
              >
                Confirmar detalle
              </button>
            )}
            <button
              onClick={() => setDeleteDetailOpen(true)}
              className="text-xs font-medium text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-700/60 rounded-lg px-3 py-1.5 transition-colors"
              title="Borra todas las tareas (conserva fases, fechas y tipos) para regenerar"
            >
              Borrar detalle
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/50 text-red-300">
          <span className="text-sm font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold text-red-200 hover:text-white px-2 py-1 rounded hover:bg-red-800/40">Cerrar</button>
        </div>
      )}

      {/* ── Pestaña Gantt ── */}
      {tab === "gantt" && (
        <>
          {dirty && (
            <p className="text-xs text-amber-400">
              Hay cambios sin guardar en el Editor — el Gantt muestra lo último guardado.
            </p>
          )}
          {persistedPhases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-700 px-5 py-8 text-center text-gray-400">
              <p className="text-sm">Todavía no hay cronograma guardado. Crealo en la pestaña Editor.</p>
            </div>
          ) : (
            <TimelineGantt anchor={anchor || null} phases={persistedPhases} onToggleStatus={toggleStatus} />
          )}
        </>
      )}

      {/* ── Pestaña Editor ── */}
      {tab === "editor" && (
        <>
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
              <div className="text-2xl font-bold text-white">{plural(weeksTotal, "semana", "semanas")}</div>
              <div className="text-[11px] text-gray-400">
                {plural(phases.length, "fase", "fases")}
                {totalTasks > 0 && ` · ${plural(totalTasks, "tarea", "tareas")}`}
              </div>
            </div>
          </div>

          {/* Fases */}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-700 px-5 py-8 text-center text-gray-400">
              <p className="text-sm">Todavía no hay cronograma. Agregá la primera fase.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map(({ p, start, end }, i) => {
                const range = fmtPhaseRange(anchor || null, { start, end });
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
                          <label className="flex items-center gap-1.5 text-gray-400">
                            <span className="text-xs">Tipo</span>
                            <select
                              value={p.activityType ?? ""}
                              onChange={(e) => updatePhase(p._key, { activityType: e.target.value || null })}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                            >
                              {ACTIVITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
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

                        {/* ── Tareas de la fase (estructura; el estado se togglea en el Gantt) ── */}
                        <div className="pt-1 space-y-1.5">
                          {p.tasks.length > 0 && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                              Tareas por semana
                            </p>
                          )}
                          {[...p.tasks]
                            .sort((a, b) => a.weekIndex - b.weekIndex)
                            .map((t) => (
                              <div
                                key={t._key}
                                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                                  t.needsValidation
                                    ? "bg-amber-500/10 border border-amber-500/40"
                                    : "border border-gray-800"
                                }`}
                              >
                                <select
                                  value={Math.min(t.weekIndex, Math.max(p.durationWeeks - 1, 0))}
                                  onChange={(e) => updateTask(p._key, t._key, { weekIndex: parseInt(e.target.value, 10) })}
                                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500 flex-shrink-0"
                                  title="Semana de la fase"
                                >
                                  {Array.from({ length: Math.max(p.durationWeeks, 1) }).map((_, w) => (
                                    <option key={w} value={w}>Sem {w + 1}</option>
                                  ))}
                                </select>
                                <input
                                  value={t.title}
                                  onChange={(e) => updateTask(p._key, t._key, { title: e.target.value })}
                                  placeholder="Tarea (visible para el cliente al confirmar)"
                                  className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none"
                                />
                                {t.needsValidation && (
                                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-300 bg-amber-500/20 border border-amber-500/60 rounded px-1.5 py-0.5 flex-shrink-0">
                                    Por validar
                                  </span>
                                )}
                                <input
                                  value={t.notes ?? ""}
                                  onChange={(e) => updateTask(p._key, t._key, { notes: e.target.value || null })}
                                  placeholder="Nota interna"
                                  className="w-32 bg-transparent text-[11px] text-gray-500 border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none flex-shrink-0 hidden sm:block"
                                />
                                <button
                                  onClick={() => removeTask(p._key, t._key)}
                                  title="Eliminar tarea"
                                  className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ))}
                          <button
                            onClick={() => addTask(p._key)}
                            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                            Agregar tarea
                          </button>
                        </div>
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
        </>
      )}

      {/* Confirmación de borrado del detalle */}
      <ConfirmDialog
        open={deleteDetailOpen}
        onConfirm={deleteDetail}
        onCancel={() => setDeleteDetailOpen(false)}
        title="¿Borrar el detalle del cronograma?"
        description="Se borran TODAS las tareas y se quita la confirmación. Las fases, la fecha de arranque y los tipos se conservan — podés regenerar el detalle con IA después."
        confirmLabel="Borrar detalle"
      />
    </div>
  );
}
