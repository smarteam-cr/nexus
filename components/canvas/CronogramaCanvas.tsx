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
import { useToast } from "@/components/ui/Toast";
import TimelineGantt, { type GanttPhase, type GanttTaskStatus } from "./TimelineGantt";
import TimelineAssistDialog from "./TimelineAssistDialog";

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
  status?: GanttTaskStatus; // D.2 — avance a nivel fase
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
  status: GanttTaskStatus;
  tasks: ServerTask[];
}

// D.2 — borrador de avance que propone el agente (el CSE confirma → status real).
interface PendingProgress {
  currentPhaseId: string | null;
  asOfSessionId: string | null;
  reasoning: string;
  phases: Array<{ id: string; done: boolean }>;
  tasks: Array<{ id: string; done: boolean }>;
}

export default function CronogramaCanvas({ projectId, clientId }: { projectId: string; clientId: string }) {
  const toast = useToast();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [anchor, setAnchor] = useState<string>(""); // yyyy-mm-dd o ""
  const [kickoffDate, setKickoffDate] = useState<string>(""); // yyyy-mm-dd de la sesión de kickoff (sugerencia)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ── Publicación al cliente (in-canvas) ──
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishWorking, setPublishWorking] = useState(false);
  // ── Asistente IA ──
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistScopePhaseId, setAssistScopePhaseId] = useState<string | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [assistWarnings, setAssistWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  // ── Avance detectado por el agente (D.2) — borrador que el CSE confirma ──
  const [pendingProgress, setPendingProgress] = useState<PendingProgress | null>(null);
  const [progressPhaseSel, setProgressPhaseSel] = useState<Set<string>>(new Set());
  const [progressTaskSel, setProgressTaskSel] = useState<Set<string>>(new Set());
  const [applyingProgress, setApplyingProgress] = useState(false);
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
      status: p.status,
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
        setKickoffDate(data.kickoffSessionDate ? String(data.kickoffSessionDate).slice(0, 10) : "");
        setPublishedAt(data.timelinePublishedAt ?? null);
        // Propuesta de re-generación del agente (re-run con cronograma ya existente):
        // se muestra como vista previa aplicable, reusando el mismo banner que el assist.
        // No pisa una propuesta de assist en curso (prev tiene prioridad).
        setProposal((prev) =>
          prev ?? (data.pendingProposal ? (data.pendingProposal as Proposal) : null),
        );
        // D.2 — borrador de avance: lo expone el GET. Inicializa la selección con
        // TODO lo propuesto pre-marcado (el CSE puede destildar antes de aplicar).
        const pp = data.pendingProgress ? (data.pendingProgress as PendingProgress) : null;
        setPendingProgress(pp);
        setProgressPhaseSel(new Set((pp?.phases ?? []).map((p) => p.id)));
        setProgressTaskSel(new Set((pp?.tasks ?? []).map((t) => t.id)));
      } else {
        setPhases([]);
        setAnchor("");
        setKickoffDate("");
        setPendingProgress(null);
        setPublishedAt(null);
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

  // ── Publicar / actualizar / ocultar el cronograma para el cliente ──────────────
  // Publicar (o "Actualizar publicación") siempre confirma el detalle de paso
  // (confirm-detail) para que las tareas crucen al cliente — re-publicar destraba
  // el caso en que detailConfirmedAt quedó en null y el cronograma seguía publicado.
  const publishTimeline = async (publish: boolean) => {
    setPublishWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-timeline`, {
        method: publish ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setError("No se pudo cambiar la publicación del cronograma.");
        return;
      }
      if (publish) {
        await fetch(`/api/projects/${projectId}/timeline/confirm-detail`, { method: "POST" }).catch(() => {});
      }
      await load();
      toast.success(publish ? "Cronograma publicado al cliente." : "Cronograma ocultado.");
    } catch {
      setError("Error de conexión al publicar el cronograma.");
    } finally {
      setPublishWorking(false);
    }
  };

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
      }
      setDirty(false);
    } catch {
      setError("Error de conexión al guardar.");
    }
    setSaving(false);
  };

  // Fijar/cambiar la fecha de arranque desde el Gantt: actualiza el preview (fechas
  // reales) y marca dirty — se PERSISTE con "Guardar cronograma", no al instante.
  const setAnchorFromGantt = (ymd: string) => {
    setAnchor(ymd);
    setDirty(true);
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
        // En auto (al montar sin detalle) no bloqueamos con banner, pero ya no es
        // mudo: un toast suave avisa que se puede reintentar a mano.
        if (!auto) setError(data?.message ?? data?.error ?? "Error al generar el detalle.");
        else toast.info("No se pudo generar el detalle automáticamente. Usá «Regenerar detalle» para reintentar.");
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
      else toast.info("No se pudo generar el detalle automáticamente. Usá «Regenerar detalle» para reintentar.");
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
  const submitAssist = async (instruction: string, scopePhaseId: string | null) => {
    if (instruction.trim().length < 4 || assisting) return;
    setAssisting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, scopePhaseId }),
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
        setAssistOpen(false); // cerrar el dialog; la propuesta se ve en el Gantt (preview)
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
        await load();
      }
    } catch {
      setError("Error de conexión al aplicar.");
    }
    setApplying(false);
  };

  const discardProposal = async () => {
    // Si la propuesta vino del agente (re-run), está persistida en pendingProposal →
    // limpiarla en el server para que no reaparezca al recargar. La de assist es solo en
    // memoria (el DELETE es no-op inofensivo). El estado local se limpia pase lo que pase.
    try {
      await fetch(`/api/projects/${projectId}/timeline/proposal`, { method: "DELETE" });
    } catch {
      /* limpiar local igual */
    }
    setProposal(null);
    setAssistWarnings([]);
  };

  // ── Avance (D.2): aplicar lo que el CSE confirmó / descartar el borrador ──────
  const applyProgress = async () => {
    if (!pendingProgress) return;
    setApplyingProgress(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/progress/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phaseIds: [...progressPhaseSel],
          taskIds: [...progressTaskSel],
          currentPhaseId: pendingProgress.currentPhaseId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "No se pudo aplicar el avance.");
      } else {
        setPendingProgress(null);
        await load();
      }
    } catch {
      setError("Error de conexión al aplicar el avance.");
    }
    setApplyingProgress(false);
  };

  const discardProgress = async () => {
    try {
      await fetch(`/api/projects/${projectId}/timeline/progress`, { method: "DELETE" });
    } catch {
      /* limpiar local igual */
    }
    setPendingProgress(null);
  };

  const toggleSet = (s: Set<string>, id: string): Set<string> => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
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
    status: p.status,
    tasks: p.tasks.map((t) => ({
      key: t._key,
      id: t.id,
      title: t.title,
      weekIndex: Math.min(t.weekIndex, Math.max(p.durationWeeks - 1, 0)),
      status: t.status,
      notes: t.notes,
      needsValidation: t.needsValidation,
      source: t.source,
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

      {/* ── Publicar al cliente (in-canvas) ── */}
      {phases.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {publishedAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Publicado — el cliente ve este cronograma
              </span>
            ) : (
              <span className="text-sm text-gray-400">
                Este cronograma todavía no está publicado al cliente.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {publishedAt ? (
              <>
                <button
                  onClick={() => publishTimeline(true)}
                  disabled={publishWorking}
                  className="text-xs font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                  title="Vuelve a empujar la versión actual (fases + tareas) al cliente"
                >
                  {publishWorking ? "Actualizando…" : "Actualizar publicación"}
                </button>
                <button
                  onClick={() => publishTimeline(false)}
                  disabled={publishWorking}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-700/50 hover:border-amber-600 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                >
                  Ocultar
                </button>
              </>
            ) : (
              <button
                onClick={() => publishTimeline(true)}
                disabled={publishWorking}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
              >
                {publishWorking ? "Publicando…" : "Publicar al cliente"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Estado de generación del detalle ── */}
      {generating && (
        <span className="flex items-center gap-2 text-sm font-medium text-blue-400">
          <span className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          Creando tareas internas…
        </span>
      )}

      {/* ── Disparador del asistente IA (abre el dialog; el preview vuelve al Gantt) ── */}
      {phases.length > 0 && !proposal && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2.5">
          <span className="text-sm text-gray-400">
            ¿Necesitás ajustar el cronograma? Pedíselo a la IA — vos revisás antes de aplicar.
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setAssistScopePhaseId(null); setAssistOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Pedir cambio con IA
            </button>
          </div>
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

      {/* ── Banner de AVANCE detectado por el agente (D.2) — propone, el CSE confirma ── */}
      {pendingProgress &&
        (pendingProgress.phases.length > 0 ||
          pendingProgress.tasks.length > 0 ||
          !!pendingProgress.currentPhaseId) && (
          <div className="rounded-2xl border border-emerald-600/40 bg-emerald-900/25 px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold uppercase tracking-wider text-emerald-300">
                Avance detectado por el agente — revisá y confirmá
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={applyProgress}
                  disabled={applyingProgress}
                  className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  {applyingProgress ? "Aplicando…" : "Aplicar avance"}
                </button>
                <button
                  onClick={discardProgress}
                  disabled={applyingProgress}
                  className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>

            {pendingProgress.reasoning && (
              <p className="text-[13px] text-gray-200 leading-relaxed max-w-3xl">{pendingProgress.reasoning}</p>
            )}

            {pendingProgress.currentPhaseId && (
              <p className="text-xs text-blue-200 inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded-md px-2 py-1">
                <span className="uppercase tracking-wide text-blue-300/80 font-semibold">Hoy</span>
                <span className="font-semibold">
                  {phases.find((p) => p.id === pendingProgress.currentPhaseId)?.name ?? "—"}
                </span>
              </p>
            )}

            {pendingProgress.phases.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                  Fases completadas
                </span>
                {pendingProgress.phases.map((ph) => {
                  const name = phases.find((p) => p.id === ph.id)?.name ?? "(fase)";
                  const checked = progressPhaseSel.has(ph.id);
                  return (
                    <label key={ph.id} className="flex items-center gap-2.5 text-sm text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setProgressPhaseSel((s) => toggleSet(s, ph.id))}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className={checked ? "" : "line-through text-gray-600"}>{name}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {pendingProgress.tasks.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
                  Tareas hechas
                </span>
                {pendingProgress.tasks.map((tk) => {
                  let title = "(tarea)";
                  let phaseName = "";
                  for (const p of phases) {
                    const t = p.tasks.find((t) => t.id === tk.id);
                    if (t) { title = t.title; phaseName = p.name; break; }
                  }
                  const checked = progressTaskSel.has(tk.id);
                  return (
                    <label key={tk.id} className="flex items-center gap-2.5 text-sm text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setProgressTaskSel((s) => toggleSet(s, tk.id))}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className={checked ? "" : "line-through text-gray-600"}>{title}</span>
                      {phaseName && <span className="text-gray-500 text-xs">· {phaseName}</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-gray-400 pt-2 border-t border-emerald-700/25">
              Al aplicar, vos confirmás el avance (se marca como hecho). El agente solo lo propone — destildá lo que no corresponda.
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

      {/* ── Alerta global de handoff flaco (reemplaza el badge "por validar" por fila) ── */}
      {totalTasks > 0 && pendingValidation > 0 && !proposal && !generating && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-xs leading-relaxed">
            Este cronograma se generó con handoff limitado — revisá que las tareas reflejen el proyecto real.
          </span>
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
          onAssistPhase={(phase) => { setAssistScopePhaseId(phase.id ?? null); setAssistOpen(true); }}
          kickoffDate={kickoffDate || null}
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

      <TimelineAssistDialog
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        phases={phases.map((p) => ({ id: p.id, name: p.name }))}
        initialScopePhaseId={assistScopePhaseId}
        onSubmit={submitAssist}
        loading={assisting}
      />
    </div>
  );
}
