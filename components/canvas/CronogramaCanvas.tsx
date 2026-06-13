"use client";

/**
 * components/canvas/CronogramaCanvas.tsx
 *
 * Canvas "Cronograma" (D.1): el GANTT es la única vista — la edición pasa EN
 * el cronograma, no en pestañas:
 *
 *   - Tareas: título/nota/semana/agregar/eliminar inline en el Gantt expandido
 *     (dirty + "Guardar" → PUT bulk con diff server-side). El ESTADO se togglea
 *     inmediato vía PATCH (optimista).
 *   - Actualización por IA: barra de instrucción → POST /timeline/assist →
 *     PROPUESTA completa (sin persistir) → preview en el mismo Gantt + resumen
 *     de cambios → Aplicar (PUT normal: diffea, preserva estados) / Descartar.
 *   - ESTRUCTURA de fases (crear/borrar/renombrar/duración/orden/tipo/notas):
 *     SOLO por la barra de IA — no hay editor de formularios aparte. Dos
 *     excepciones directas: la fecha de arranque (date input en el banner del
 *     Gantt, guarda al toque) y el bootstrap con 0 fases (mini-form de primera
 *     fase en el empty state — sin fases la barra de IA no opera).
 *
 * Generación inicial del detalle: agente "agent-timeline-detail" vía
 * POST /api/clients/[clientId]/analyze. Confirmación (gate de la vista
 * cliente): POST/DELETE /timeline/confirm-detail. Regeneración: DELETE
 * /timeline/detail (borra solo tareas) + re-correr.
 *
 * Render INTERNO (tema oscuro del panel de canvas), no el design system del Kickoff.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { plural } from "@/lib/timeline/weeks";
import { ConfirmDialog } from "@/components/ui";
import { PublishSurfaceButton } from "@/components/clients/PublishSurfaceButton";
import TimelineGantt, { type GanttPhase, type GanttTaskStatus } from "./TimelineGantt";

interface TaskDraft {
  id?: string;
  title: string;
  weekIndex: number;
  notes: string | null;
  status: GanttTaskStatus;
  needsValidation: boolean;
  source?: string;
  _key: string;
}

interface Phase {
  id?: string;
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  source?: string;
  tasks: TaskDraft[];
  _key: string;
}

// Propuesta de la IA (shape del PUT, ya saneada por el endpoint assist)
interface ProposalTask {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes?: string | null;
}
interface ProposalPhase {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  tasks?: ProposalTask[];
}
interface Proposal {
  anchorStartDate: string | null;
  phases: ProposalPhase[];
}

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [deleteDetailOpen, setDeleteDetailOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ── Asistente IA ──
  const [assistInput, setAssistInput] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [assistWarnings, setAssistWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const keyCounter = useRef(0);
  const nextKey = () => `new-${keyCounter.current++}`;
  const autoDetailRanRef = useRef(false); // auto-genera el detalle una vez por montaje

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
        setPhases(mapServerPhases(data.phases ?? []));
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
        setDetailConfirmedAt(data.detailConfirmedAt ?? null);
      } else {
        setPhases([]);
        setAnchor("");
        setDetailConfirmedAt(null);
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

  // Logo del cliente — mismo branding que ve el cliente, también del lado de Nexus.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/client-logo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setClientLogoUrl(d?.logoUrl ?? null))
      .catch(() => setClientLogoUrl(null));
  }, [projectId]);

  // ── Bootstrap (estructura SOLO por IA — pero sin fases la barra no opera) ──────
  const [bootName, setBootName] = useState("");
  const [bootWeeks, setBootWeeks] = useState(4);
  const [creatingFirst, setCreatingFirst] = useState(false);

  // ── Edición de tareas (inline en el Gantt) ────────────────────────────────────
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
  const addTask = (phaseKey: string, weekIndex: number) => {
    setPhases((ps) =>
      ps.map((p) =>
        p._key === phaseKey
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { title: "", weekIndex, notes: null, status: "PENDING" as const, needsValidation: false, _key: nextKey() },
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

  // ── Guardar (PUT bulk — fases + tareas; anchorOverride para fijar desde el Gantt) ──
  const buildPutBody = (phasesToSave: Phase[], anchorYmd: string) => ({
    anchorStartDate: anchorYmd ? new Date(anchorYmd).toISOString() : null,
    phases: phasesToSave.map((p, i) => {
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
  });

  const validateLocal = (): string | null => {
    for (const p of phases) {
      if (!p.name.trim()) return "Cada fase necesita un nombre.";
      if (!Number.isInteger(p.durationWeeks) || p.durationWeeks <= 0)
        return "La duración de cada fase debe ser un entero mayor que 0.";
      if (p.sessionCount != null && (!Number.isInteger(p.sessionCount) || p.sessionCount <= 0))
        return "Las sesiones deben ser un entero mayor que 0 (o vacío).";
      for (const t of p.tasks) {
        if (!t.title.trim()) return `Cada tarea de "${p.name || "la fase"}" necesita un título.`;
      }
    }
    return null;
  };

  const save = async (anchorOverride?: string) => {
    const localError = validateLocal();
    if (localError) return setError(localError);
    const anchorYmd = anchorOverride ?? anchor;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPutBody(phases, anchorYmd)),
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

  // Fijar fecha de arranque directamente desde el Gantt (guarda al toque)
  const setAnchorFromGantt = (ymd: string) => {
    setAnchor(ymd);
    void save(ymd);
  };

  // Crear la PRIMERA fase desde el empty state (persiste al toque). Las fases
  // siguientes —y toda la edición de estructura— van por la barra de IA.
  const createFirstPhase = async () => {
    const name = bootName.trim();
    if (!name || creatingFirst) return;
    const weeks = Math.max(1, bootWeeks || 1);
    setCreatingFirst(true);
    setError(null);
    try {
      const firstPhase: Phase = {
        name,
        durationWeeks: weeks,
        sessionCount: null,
        notes: null,
        activityType: null,
        tasks: [],
        _key: nextKey(),
      };
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPutBody([firstPhase], anchor)),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.details?.[0] ?? d?.error ?? "No se pudo crear la fase.");
      } else {
        setBootName("");
        await load();
      }
    } catch {
      setError("Error de conexión al crear la fase.");
    }
    setCreatingFirst(false);
  };

  // ── Generar el detalle del cronograma con IA (tareas por semana) ───────────────
  // Se dispara AUTOMÁTICAMENTE al abrir si hay fases sin tareas (auto=true →
  // silencioso si ya existe). También lo invoca "Regenerar detalle".
  const generateDetail = async (opts?: { auto?: boolean }) => {
    const auto = opts?.auto ?? false;
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
        if (!auto) setError(data?.message ?? data?.error ?? "Error al generar el detalle.");
      } else if (data?.timelineDetail?.skipped) {
        const reason = data.timelineDetail.reason;
        // En auto no molestamos si ya existe (caso esperado al reabrir) — solo recargamos.
        if (!auto) {
          setError(
            reason === "detail_exists"
              ? "Ya existe un detalle — usá 'Regenerar detalle' para rehacerlo."
              : `No se generó el detalle (${reason ?? "salida vacía"}).`,
          );
        } else if (reason === "detail_exists") {
          await load();
        }
      } else {
        await load();
      }
    } catch {
      if (!auto) setError("Error de conexión al generar el detalle.");
    }
    setGenerating(false);
  };

  // Auto-generar el detalle al abrir: si hay fases pero todavía no hay tareas, la
  // IA las crea sin que el CSE lo pida (proceso invisible). Una vez por montaje.
  useEffect(() => {
    if (loading || generating || autoDetailRanRef.current) return;
    const hasPhases = phases.length > 0;
    const hasTasks = phases.some((p) => p.tasks.length > 0);
    if (hasPhases && !hasTasks) {
      autoDetailRanRef.current = true;
      void generateDetail({ auto: true });
    }
  }, [loading, generating, phases]);

  // ── Asistente IA: instrucción → propuesta → aplicar/descartar ─────────────────
  const runAssist = async () => {
    const instruction = assistInput.trim();
    if (instruction.length < 4 || assisting) return;
    setAssisting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.details?.[0] ??
            data?.message ??
            (data?.error === "assist_invalid_proposal"
              ? "La IA devolvió una propuesta inválida — probá reformular la instrucción."
              : data?.error ?? "Error al pedir la actualización."),
        );
      } else {
        setProposal(data.proposal as Proposal);
        setAssistWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      }
    } catch {
      setError("Error de conexión con el asistente.");
    }
    setAssisting(false);
  };

  const applyProposal = async () => {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.details?.[0] ?? d?.error ?? "No se pudo aplicar la propuesta.");
      } else {
        setProposal(null);
        setAssistWarnings([]);
        setAssistInput("");
        await load();
      }
    } catch {
      setError("Error de conexión al aplicar.");
    }
    setApplying(false);
  };

  const discardProposal = () => {
    setProposal(null);
    setAssistWarnings([]);
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

  // ── Regenerar detalle: borra las tareas (conserva esqueleto/anchor/tipos) y las
  // vuelve a crear con IA. Único control manual del flujo auto. ──────────────────
  const regenerateDetail = async () => {
    setDeleteDetailOpen(false);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/timeline/detail`, { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo regenerar el detalle.");
      return;
    }
    await load();
    await generateDetail();
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
      if (!res.ok) await load();
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

  // ── Derivados ─────────────────────────────────────────────────────────────────
  const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
  const pendingValidation = phases.reduce(
    (n, p) => n + p.tasks.filter((t) => t.needsValidation).length,
    0,
  );

  const ganttPhases: GanttPhase[] = phases.map((p) => ({
    key: p._key,
    id: p.id,
    name: p.name || "(sin nombre)",
    durationWeeks: p.durationWeeks,
    sessionCount: p.sessionCount,
    activityType: p.activityType,
    tasks: p.tasks.map((t) => ({
      key: t._key,
      id: t.id,
      title: t.title,
      weekIndex: Math.min(t.weekIndex, Math.max(p.durationWeeks - 1, 0)),
      status: t.status,
      notes: t.notes,
      needsValidation: t.needsValidation,
    })),
  }));

  // Propuesta → preview del Gantt (read-only) + resumen del diff
  const proposalGantt: GanttPhase[] | null = proposal
    ? proposal.phases.map((p, i) => ({
        key: p.id ?? `prop-${i}`,
        id: p.id,
        name: p.name,
        durationWeeks: p.durationWeeks,
        sessionCount: p.sessionCount ?? null,
        activityType: p.activityType ?? null,
        tasks: (p.tasks ?? []).map((t, ti) => ({
          key: t.id ?? `prop-${i}-${ti}`,
          id: t.id,
          title: t.title,
          weekIndex: t.weekIndex,
          status: "PENDING" as const,
          notes: t.notes ?? null,
          needsValidation: false,
        })),
      }))
    : null;

  const diffSummary = (() => {
    if (!proposal) return null;
    const currentTaskById = new Map<string, TaskDraft>();
    for (const p of phases) for (const t of p.tasks) if (t.id) currentTaskById.set(t.id, t);
    const proposalTaskIds = new Set<string>();
    let added = 0;
    let edited = 0;
    for (const p of proposal.phases) {
      for (const t of p.tasks ?? []) {
        if (!t.id) {
          added++;
          continue;
        }
        proposalTaskIds.add(t.id);
        const cur = currentTaskById.get(t.id);
        if (cur && (cur.title !== t.title || cur.weekIndex !== t.weekIndex || (cur.notes ?? null) !== (t.notes ?? null))) {
          edited++;
        }
      }
    }
    let removed = 0;
    for (const id of currentTaskById.keys()) if (!proposalTaskIds.has(id)) removed++;

    const currentPhaseById = new Map(phases.filter((p) => p.id).map((p) => [p.id as string, p]));
    let phasesChanged = 0;
    let phasesAdded = 0;
    for (const p of proposal.phases) {
      if (!p.id) {
        phasesAdded++;
        continue;
      }
      const cur = currentPhaseById.get(p.id);
      if (cur && (cur.name !== p.name || cur.durationWeeks !== p.durationWeeks || (cur.activityType ?? null) !== (p.activityType ?? null))) {
        phasesChanged++;
      }
    }
    const proposalPhaseIds = new Set(proposal.phases.filter((p) => p.id).map((p) => p.id as string));
    const phasesRemoved = [...currentPhaseById.keys()].filter((id) => !proposalPhaseIds.has(id)).length;
    const anchorChanged =
      (proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : "") !== anchor;

    return { added, removed, edited, phasesAdded, phasesRemoved, phasesChanged, anchorChanged };
  })();

  return (
    <div className="space-y-4">
      {/* Logo del cliente — paridad con el preview del kickoff (lado Nexus). */}
      {clientLogoUrl && (
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clientLogoUrl} alt="Logo del cliente" className="h-9 w-auto max-w-[180px] object-contain" />
        </div>
      )}

      {/* ── Publicación de la superficie externa (D.1.5) — fuera del gate de
          tareas: publicar SIN detalle confirmado es válido (el cliente ve las
          fases solas). La regla es unificada: el flag gobierna la página
          /external/cronograma Y la sección embebida en el kickoff. ── */}
      {phases.length > 0 && !proposal && (
        <PublishSurfaceButton
          projectId={projectId}
          endpoint="publish-timeline"
          copy={{
            published: "Cronograma publicado al cliente",
            unpublished: "Cronograma no publicado",
            publishedHint: detailConfirmedAt
              ? "El cliente ve las fases y las acciones por semana — en su página propia y dentro del kickoff."
              : "El cliente ve las FASES (en su página propia y dentro del kickoff). Las acciones por semana aparecen cuando confirmes el detalle.",
            unpublishedHint:
              "El cliente no ve el cronograma — ni en su página propia ni dentro del kickoff — aunque tenga el acceso.",
          }}
        />
      )}

      {/* ── Cabecera: estado de generación / confirmar / regenerar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {generating && (
          <span className="flex items-center gap-2 text-sm font-medium text-blue-600">
            <span className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            Creando tareas internas…
          </span>
        )}

        {totalTasks > 0 && !proposal && !generating && (
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
              className="text-xs font-medium text-gray-500 hover:text-blue-400 border border-gray-700 hover:border-blue-700/60 rounded-lg px-3 py-1.5 transition-colors"
              title="Borra las tareas actuales y la IA propone unas nuevas"
            >
              Regenerar detalle
            </button>
          </div>
        )}
      </div>

      {/* ── Barra del asistente IA (en el cronograma, no aparte) ── */}
      {phases.length > 0 && !proposal && (
        <div className="flex items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2.5">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <input
            value={assistInput}
            onChange={(e) => setAssistInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runAssist();
            }}
            placeholder='Pedile un cambio al cronograma… ej: "atrasá Setup una semana y agregá tareas de migración de datos"'
            disabled={assisting}
            className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={runAssist}
            disabled={assisting || assistInput.trim().length < 4}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            {assisting ? (
              <>
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Pensando…
              </>
            ) : (
              "Actualizar con IA"
            )}
          </button>
        </div>
      )}

      {/* ── Banner de propuesta (preview sin guardar) ── */}
      {proposal && diffSummary && (
        <div className="rounded-2xl border border-violet-700/40 bg-violet-900/30 px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-300">
              Propuesta de la IA — vista previa, sin guardar
            </span>
            <span className="text-[11px] text-gray-400">
              {[
                diffSummary.added > 0 && `+${plural(diffSummary.added, "tarea nueva", "tareas nuevas")}`,
                diffSummary.removed > 0 && `−${plural(diffSummary.removed, "tarea", "tareas")}`,
                diffSummary.edited > 0 && `✎ ${plural(diffSummary.edited, "tarea editada", "tareas editadas")}`,
                diffSummary.phasesAdded > 0 && `+${plural(diffSummary.phasesAdded, "fase", "fases")}`,
                diffSummary.phasesRemoved > 0 && `−${plural(diffSummary.phasesRemoved, "fase", "fases")}`,
                diffSummary.phasesChanged > 0 && `${plural(diffSummary.phasesChanged, "fase modificada", "fases modificadas")}`,
                diffSummary.anchorChanged && "fecha de arranque modificada",
              ]
                .filter(Boolean)
                .join(" · ") || "sin cambios detectados"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={applyProposal}
                disabled={applying}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
              >
                {applying ? "Aplicando…" : "Aplicar cambios"}
              </button>
              <button
                onClick={discardProposal}
                disabled={applying}
                className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
          {assistWarnings.length > 0 && (
            <ul className="text-[11px] text-amber-300 space-y-0.5">
              {assistWarnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-500">
            Los estados de las tareas existentes se conservan al aplicar. Revisá el Gantt de abajo: es la propuesta.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/50 text-red-300">
          <span className="text-sm font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold text-red-200 hover:text-white px-2 py-1 rounded hover:bg-red-800/40">Cerrar</button>
        </div>
      )}

      {/* ── EL cronograma (Gantt editable; en propuesta → preview read-only) ── */}
      {phases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 px-5 py-8 text-center text-gray-400 space-y-4">
          <p className="text-sm">
            Todavía no hay cronograma. Creá la primera fase — después pedile los cambios a la IA.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <input
              value={bootName}
              onChange={(e) => setBootName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFirstPhase();
              }}
              placeholder="Nombre de la fase (ej: Kick-off)"
              disabled={creatingFirst}
              className="w-64 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input
                type="number"
                min={1}
                value={bootWeeks}
                onChange={(e) => setBootWeeks(parseInt(e.target.value, 10) || 1)}
                disabled={creatingFirst}
                className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
              />
              semanas
            </label>
            <button
              onClick={createFirstPhase}
              disabled={creatingFirst || !bootName.trim()}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 rounded-lg transition-colors"
            >
              {creatingFirst ? "Creando…" : "Crear fase"}
            </button>
          </div>
        </div>
      ) : proposal && proposalGantt ? (
        <TimelineGantt
          anchor={proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : null}
          phases={proposalGantt}
          readOnly
        />
      ) : (
        <TimelineGantt
          anchor={anchor || null}
          phases={ganttPhases}
          onToggleStatus={toggleStatus}
          onUpdateTask={(phaseKey, taskKey, patch) => updateTask(phaseKey, taskKey, patch)}
          onAddTask={addTask}
          onRemoveTask={removeTask}
          onSetAnchor={setAnchorFromGantt}
        />
      )}

      {/* ── Guardar (cambios estructurales/inline pendientes) ── */}
      {!proposal && dirty && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-amber-400">Cambios sin guardar</span>
          <button
            onClick={() => save()}
            disabled={saving}
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? "Guardando…" : "Guardar cronograma"}
          </button>
        </div>
      )}

      {/* Confirmación de regeneración del detalle */}
      <ConfirmDialog
        open={deleteDetailOpen}
        onConfirm={regenerateDetail}
        onCancel={() => setDeleteDetailOpen(false)}
        title="¿Regenerar el detalle del cronograma?"
        description="Se borran las tareas actuales y la IA propone unas nuevas a partir del contexto. Las fases, la fecha de arranque y los tipos se conservan."
        confirmLabel="Regenerar detalle"
      />
    </div>
  );
}
