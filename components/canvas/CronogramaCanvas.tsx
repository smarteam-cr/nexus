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
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import TimelineGantt, { type GanttPhase, type GanttTaskStatus } from "./TimelineGantt";
import TimelineAssistDialog from "./TimelineAssistDialog";
import PublishBar from "./PublishBar";
import CronogramaProgressButton from "@/components/clients/CronogramaProgressButton";
import { useWorkspace } from "@/components/clients/WorkspaceContext";

interface TaskDraft {
  id?: string;
  title: string;
  weekIndex: number;
  notes: string | null;
  status: GanttTaskStatus;
  needsValidation: boolean;
  source?: string;
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | null;
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
  party: "CLIENTE" | "SMARTEAM" | "AMBOS" | null;
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

export default function CronogramaCanvas({ projectId, clientId, headerSlot }: { projectId: string; clientId: string; headerSlot?: HTMLElement | null }) {
  const toast = useToast();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [anchor, setAnchor] = useState<string>(""); // yyyy-mm-dd o ""
  const [kickoffDate, setKickoffDate] = useState<string>(""); // yyyy-mm-dd de la sesión de kickoff (sugerencia)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [chainingProgress, setChainingProgress] = useState(false); // F — fase "evaluando avance" del encadenado
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ── Publicación al cliente (in-canvas) ──
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  // ¿Se publicó al menos una vez? (publishedSnapshot != null). Gobierna: primera publicación
  // sin modal (#3) + bloquear "Generar cronograma" sobre un cronograma ya vivo (#2).
  const [hasPublishedOnce, setHasPublishedOnce] = useState(false);
  // Señal del workspace: al generar el handoff, el cronograma (si está vacío) recarga sus fases.
  const { timelineRefreshSignal, bumpGpsRefresh } = useWorkspace();
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const [publishWorking, setPublishWorking] = useState(false);
  // Modal de razón del cambio — SOLO al "Subir al cliente" (no en el auto-guardado).
  const [publishReasonOpen, setPublishReasonOpen] = useState(false);
  const [publishReasonText, setPublishReasonText] = useState("");
  // ── Asistente IA ──
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistScopePhaseId, setAssistScopePhaseId] = useState<string | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [assistWarnings, setAssistWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  // #4 — razón del cambio (TimelineChange/audit). Con el auto-guardado ya NO se pide
  // tipeada: las ediciones manuales usan una razón automática y la IA usa su instrucción.
  const [assistInstruction, setAssistInstruction] = useState("");
  // ── Avance detectado por el agente (D.2) — borrador que el CSE confirma ──
  const [pendingProgress, setPendingProgress] = useState<PendingProgress | null>(null);
  const [progressPhaseSel, setProgressPhaseSel] = useState<Set<string>>(new Set());
  const [progressTaskSel, setProgressTaskSel] = useState<Set<string>>(new Set());
  const [progressSuspendedSel, setProgressSuspendedSel] = useState<Set<string>>(new Set());
  const [applyingProgress, setApplyingProgress] = useState(false);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const keyCounter = useRef(0);
  const nextKey = () => `new-${keyCounter.current++}`;
  // Auto-guardado: cuenta de ediciones locales. Si cambia DURANTE un PUT, no pisamos
  // el estado con la respuesta del server (evita perder lo que el CSE tipeó mientras guardaba).
  const editSeq = useRef(0);
  const markDirty = () => { editSeq.current++; setDirty(true); };
  // Si un auto-guardado FALLA, guardamos el editSeq fallido: el efecto no reintenta
  // hasta que haya una edición nueva (evita una tormenta de PUTs cada 1.5 s si el server rechaza).
  const lastFailedSeqRef = useRef<number | null>(null);

  // Adopta los ids asignados por el server SOBRE el estado local, preservando el
  // contenido que el CSE tipeó durante el PUT. Solo zipea por posición cuando las
  // cantidades coinciden (no hubo add/remove durante el PUT) → nunca reasigna un id a
  // otra fila. Evita DUPLICAR ítems nuevos (sin id) al re-guardar, sin pisar ediciones.
  const mergeServerIds = (local: Phase[], server: ServerPhase[]): Phase[] => {
    if (server.length !== local.length) return local; // estructura cambió → no es seguro zipear
    return local.map((p, pi) => {
      const sp = server[pi];
      const sameTaskCount = (sp.tasks?.length ?? 0) === p.tasks.length;
      return {
        ...p,
        id: p.id ?? sp.id,
        _key: p.id ? p._key : sp.id,
        tasks: sameTaskCount
          ? p.tasks.map((t, ti) => (t.id ? t : { ...t, id: sp.tasks[ti].id, _key: sp.tasks[ti].id }))
          : p.tasks,
      };
    });
  };

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
        party: t.party,
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
        setHasPublishedOnce(!!data.hasPublishedOnce);
        setLastEditedAt(data.lastEditedByHuman ?? null);
        // Propuesta de re-generación del agente (re-run con cronograma ya existente):
        // se muestra como vista previa aplicable, reusando el mismo banner que el assist.
        // No pisa una propuesta de assist en curso (prev tiene prioridad).
        setProposal((prev) =>
          prev ?? (data.pendingProposal ? (data.pendingProposal as Proposal) : null),
        );
        // D.2 — borrador de avance: lo expone el GET. Pre-tildá las fases propuestas y, de las
        // tareas, SOLO las que el agente infirió hechas (done:true). El resto arranca Pendiente
        // y nada Suspendido — el CSE resuelve cada tarea (hecha/suspendida) antes de cerrar la fase.
        const pp = data.pendingProgress ? (data.pendingProgress as PendingProgress) : null;
        setPendingProgress(pp);
        setProgressPhaseSel(new Set((pp?.phases ?? []).map((p) => p.id)));
        setProgressTaskSel(new Set((pp?.tasks ?? []).filter((t) => t.done).map((t) => t.id)));
        setProgressSuspendedSel(new Set());
      } else {
        setPhases([]);
        setAnchor("");
        setKickoffDate("");
        setPendingProgress(null);
        setPublishedAt(null);
        setHasPublishedOnce(false);
        setLastEditedAt(null);
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

  // Generar el handoff crea las fases del cronograma como efecto. El handoff bumpea
  // timelineRefreshSignal → si el cronograma está VACÍO, recargamos para que aparezcan (no
  // pisamos uno con datos/ediciones). Solo reacciona al CAMBIO de la señal, no al montaje.
  const lastTimelineSignal = useRef(timelineRefreshSignal);
  useEffect(() => {
    if (timelineRefreshSignal === lastTimelineSignal.current) return;
    lastTimelineSignal.current = timelineRefreshSignal;
    if (phases.length === 0 && !loading) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineRefreshSignal]);

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
  const publishTimeline = async (publish: boolean, reason?: string) => {
    setPublishWorking(true);
    setError(null);
    try {
      // Confirmar el detalle ANTES de publicar: el snapshot client-safe se arma
      // dentro de publish-timeline (POST) y debe incluir las tareas (gated por
      // detailConfirmedAt). Re-publicar también destraba detailConfirmedAt=null.
      if (publish) {
        await fetch(`/api/projects/${projectId}/timeline/confirm-detail`, { method: "POST" }).catch(() => {});
      }
      const res = await fetch(`/api/projects/${projectId}/publish-timeline`, {
        method: publish ? "POST" : "DELETE",
        ...(publish
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason ?? "" }) }
          : {}),
      });
      if (!res.ok) {
        // Mostrar el motivo REAL del server (ej. "Definí la fecha de arranque del proyecto antes
        // de publicar.") en vez del genérico — sino el CSE no sabe qué falta.
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "No se pudo cambiar la publicación del cronograma.");
        return;
      }
      bumpGpsRefresh(); // el pill de cronograma del widget pasa a publicado / borrador
      setPublishReasonOpen(false);
      setPublishReasonText("");
      await load();
      toast.success(publish ? "Cronograma subido al cliente." : "Cronograma ocultado.");
    } catch {
      setError("Error de conexión al publicar el cronograma.");
    } finally {
      setPublishWorking(false);
    }
  };


  // ── Edición de tareas (inline en el Gantt) ────────────────────────────────────
  const updateTask = (phaseKey: string, taskKey: string, patch: Partial<TaskDraft>) => {
    setPhases((ps) =>
      ps.map((p) =>
        p._key === phaseKey
          ? { ...p, tasks: p.tasks.map((t) => (t._key === taskKey ? { ...t, ...patch } : t)) }
          : p,
      ),
    );
    markDirty();
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
    markDirty();
  };
  const removeTask = (phaseKey: string, taskKey: string) => {
    setPhases((ps) =>
      ps.map((p) => (p._key === phaseKey ? { ...p, tasks: p.tasks.filter((t) => t._key !== taskKey) } : p)),
    );
    markDirty();
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

  // Auto-guardado INTERNO (debounced). NO publica al cliente (eso es "Subir"). Razón
  // automática para el audit (TimelineChange). Single-flight (el efecto no lo dispara
  // mientras hay uno en curso). Si el CSE editó DURANTE el PUT (editSeq cambió) NO
  // pisamos su trabajo con la respuesta del server — dejamos dirty para re-guardar.
  const autoSave = async () => {
    if (saving || validateLocal() !== null) return;
    const seq = editSeq.current;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPutBody(phases, anchor),
          // Auto-guardado interno: persiste sin escribir TimelineChange (el audit va en "Subir").
          skipAudit: true,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.details?.[0] ?? d?.error ?? "No se pudo guardar el cronograma.");
        lastFailedSeqRef.current = seq; // no reintentar hasta una edición nueva
        setSaving(false);
        return;
      }
      const data = await res.json();
      lastFailedSeqRef.current = null; // éxito → habilitar el auto-guardado de nuevo
      if (editSeq.current === seq) {
        // Quedó quieto durante el PUT → adoptar el estado canónico (ids nuevos) + limpiar dirty.
        if (data.exists) {
          setPhases(mapServerPhases(data.phases ?? []));
          setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
        }
        setDirty(false);
      } else if (data.exists) {
        // Editó durante el PUT → preservar su contenido pero adoptar los ids nuevos
        // (evita duplicar ítems sin id en el próximo guardado). dirty queda true → re-guarda.
        setPhases((cur) => mergeServerIds(cur, data.phases ?? []));
      }
      // El PUT setea lastEditedByHuman = now → reflejarlo para que aparezca "Subir al cliente".
      setLastEditedAt(new Date().toISOString());
    } catch {
      setError("Error de conexión al guardar.");
      lastFailedSeqRef.current = seq; // idem ante error de red
    }
    setSaving(false);
  };

  // Debounce: auto-guarda ~1.5 s después de la última edición. Se reinicia con cada
  // cambio (phases/anchor). No corre con propuesta IA abierta, mientras guarda, con el
  // cronograma inválido, ni si el último intento falló para este mismo contenido.
  useEffect(() => {
    if (!dirty || proposal || saving) return;
    if (validateLocal() !== null) return;
    if (editSeq.current === lastFailedSeqRef.current) return;
    const t = setTimeout(() => { void autoSave(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, phases, anchor, proposal, saving]);

  // Fijar/cambiar la fecha de arranque desde el Gantt: actualiza el preview (fechas
  // reales) y marca dirty — se PERSISTE con "Guardar cronograma", no al instante.
  const setAnchorFromGantt = (ymd: string) => {
    setAnchor(ymd);
    markDirty();
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
        // F — encadenado: recién creadas las tareas, evaluá el avance en la misma pasada.
        // Best-effort: si el progress falla, las tareas YA quedaron (no hay rollback) y el CSE
        // usa "Chequear avance". Si el agente detecta avance → recarga y aparece el banner.
        if (!auto) {
          setChainingProgress(true);
          try {
            const pres = await fetch(`/api/projects/${projectId}/timeline/progress`, { method: "POST" });
            const pdata = await pres.json().catch(() => ({}));
            if (pres.ok && pdata?.status === "ok") {
              await load(); // trae el pendingProgress → el banner de confirmación aparece
              toast.success("Tareas generadas y avance detectado — confirmá abajo.");
            } else {
              // skipped (sin sesiones, etapa temprana, sin avance) o error best-effort.
              toast.success("Tareas generadas. Sin avance que confirmar por ahora.");
            }
          } catch {
            toast.info("Tareas generadas. Podés revisar el avance con «Chequear avance».");
          }
          setChainingProgress(false);
        }
      }
    } catch {
      if (!auto) setError("Error de conexión al generar el detalle.");
      else toast.info("No se pudo generar el detalle automáticamente. Usá «Regenerar detalle» para reintentar.");
    }
    setGenerating(false);
  };

  // El detalle (tareas) ya NO se auto-genera en silencio: lo crea el CTA explícito
  // "Generar cronograma" (#2). Ver el portal de acciones más abajo.

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
        setAssistInstruction(instruction.trim()); // #4 — será la razón al aplicar la propuesta
        setAssistWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setAssistOpen(false); // cerrar el dialog; la propuesta se ve en el Gantt (preview)
      }
    } catch {
      setError("Error de conexión con el asistente.");
    }
    setAssisting(false);
  };

  // Aplicar la propuesta de la IA: PUT directo (sin modal). La razón del audit es la
  // instrucción que el CSE le dio a la IA (o un genérico). El cliente NO la ve hasta "Subir".
  const applyProposal = async () => {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...proposal,
          reason: assistInstruction.trim() || "Actualización del cronograma (IA)",
          kind: "AI_ASSIST",
          instruction: assistInstruction.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.details?.[0] ?? d?.error ?? "No se pudo aplicar la propuesta.");
      } else {
        setProposal(null);
        setAssistWarnings([]);
        setAssistInstruction("");
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

  // ── D/E — banner de avance: meta de tareas (título + fase) y regla de cierre de fase ──
  const progressTaskMeta = new Map<string, { title: string; phaseId: string; phaseName: string }>();
  for (const p of phases) for (const t of p.tasks) if (t.id && p.id) progressTaskMeta.set(t.id, { title: t.title, phaseId: p.id, phaseName: p.name });
  const phaseToTaskIds = new Map<string, string[]>();
  if (pendingProgress) {
    for (const tk of pendingProgress.tasks) {
      const ph = progressTaskMeta.get(tk.id)?.phaseId;
      if (!ph) continue;
      const arr = phaseToTaskIds.get(ph);
      if (arr) arr.push(tk.id);
      else phaseToTaskIds.set(ph, [tk.id]);
    }
  }
  // Agrupación del banner por fase: las que tienen tareas a confirmar + las propuestas como
  // completas + el "hoy", en el orden del cronograma. proposedDone = las que el agente cierra.
  const proposedDone = new Set((pendingProgress?.phases ?? []).map((p) => p.id));
  const bannerPhaseIds = pendingProgress
    ? phases
        .filter((p) => p.id && (phaseToTaskIds.has(p.id) || proposedDone.has(p.id) || p.id === pendingProgress.currentPhaseId))
        .map((p) => p.id as string)
    : [];
  // Una fase de pendingProgress.phases solo cierra si TODAS sus tareas del borrador quedan
  // resueltas (Hecha o Suspendida). Refuerza el 400 del apply.
  const isPhaseResolvable = (phaseId: string): boolean =>
    (phaseToTaskIds.get(phaseId) ?? []).every((id) => progressTaskSel.has(id) || progressSuspendedSel.has(id));
  const setTaskState = (id: string, state: "done" | "suspended" | "pending") => {
    setProgressTaskSel((s) => { const n = new Set(s); if (state === "done") n.add(id); else n.delete(id); return n; });
    setProgressSuspendedSel((s) => { const n = new Set(s); if (state === "suspended") n.add(id); else n.delete(id); return n; });
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
          // Solo fases con TODAS sus tareas resueltas (la UI lo exige; el server lo revalida).
          phaseIds: [...progressPhaseSel].filter(isPhaseResolvable),
          taskIds: [...progressTaskSel],
          suspendedTaskIds: [...progressSuspendedSel],
          currentPhaseId: pendingProgress.currentPhaseId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "No se pudo aplicar el avance.");
      } else {
        setPendingProgress(null);
        await load();
        // El avance es INTERNO (alimenta el panel de cartera) — el cliente NO ve el
        // estado de cada tarea, así que NO dispara el banner de "subir". Toast de cierre.
        toast.success("Avance aplicado — se refleja en el panel de cartera.");
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
    // Optimista: cambia el status de la tarea y, por coherencia, reconcilia el de su fase
    // (todas resueltas → DONE; deja de estarlo y estaba DONE → IN_PROGRESS). El server hace lo
    // mismo de forma autoritativa; si el PATCH falla, load() corrige.
    setPhases((ps) =>
      ps.map((p) => {
        if (!p.tasks.some((t) => t.id === taskId)) return p;
        const tasks = p.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t));
        let status = p.status;
        const allResolved = tasks.length > 0 && tasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
        if (allResolved && p.status !== "DONE") status = "DONE";
        else if (!allResolved && p.status === "DONE") status = "IN_PROGRESS";
        return { ...p, tasks, status };
      }),
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
      party: t.party,
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

  // ¿Hay cambios guardados sin subir? Hay cronograma y: nunca se subió, O se editó
  // (lastEditedByHuman) después de la última subida. Cualquiera de los dos → el
  // cliente todavía no ve el estado guardado → CTA "Subir al cliente".
  const hasUnpublishedChanges = !!(
    phases.length > 0 &&
    (!publishedAt || (lastEditedAt && new Date(lastEditedAt) > new Date(publishedAt)))
  );
  // Para la barra: si hay ediciones sin guardar pero el cronograma está inválido,
  // mostramos el motivo (el auto-guardado espera a que se completen los campos).
  const validationMsg = phases.length > 0 ? validateLocal() : null;

  return (
    <div className="space-y-4">
      {/* Logo del cliente — paridad con el preview del kickoff (lado Nexus). */}
      {clientLogoUrl && (
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clientLogoUrl} alt="Logo del cliente" className="h-9 w-auto max-w-[180px] object-contain" />
        </div>
      )}

      {/* Acciones del cronograma → se pintan en el HEADER del panel (junto a "Acceso
          activo"), vía portal, para que estén al mismo nivel sin duplicar barras.
          El estado "Publicado" / Ocultar / Publicar vive SOLO en el pop-up de acceso. */}
      {headerSlot && createPortal(
        <>
          {generating && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
              <span className="w-3 h-3 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              {chainingProgress ? "Evaluando avance…" : "Creando tareas…"}
            </span>
          )}
          {/* CTA bi-estado (#2): sin tareas (y nunca publicado) → "Generar cronograma" (crea las
              tareas iniciales); ya con tareas o publicado → "Chequear avance" (D.2). El gate
              !hasPublishedOnce evita regenerar sobre un cronograma vivo (borraría fechas/avance),
              aun si se borraron las tareas post-publicación. */}
          {phases.length > 0 && !proposal && (
            !hasPublishedOnce && !phases.some((p) => p.tasks.length > 0) ? (
              <button
                onClick={() => void generateDetail({ auto: false })}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
                title="Crea las tareas iniciales del cronograma con IA, sobre las fases del handoff"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Generar cronograma
              </button>
            ) : (
              <CronogramaProgressButton projectId={projectId} onDone={load} />
            )
          )}
          {phases.length > 0 && !proposal && (
            <button
              onClick={() => { setAssistScopePhaseId(null); setAssistOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
              title="Pedile a la IA un cambio del cronograma — vos revisás antes de aplicar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Pedir cambio con IA
            </button>
          )}
        </>,
        headerSlot,
      )}

      {/* Barra ÚNICA de guardar/subir — mismo diseño que en el kickoff. El guardado
          es AUTOMÁTICO (interno): "Guardando…" → "Cambios guardados". "Subir al cliente"
          es el único paso que publica el snapshot al cliente (también el primer publish). */}
      {!proposal && phases.length > 0 && (
        <PublishBar
          hideWhenClean
          saving={saving || (dirty && validationMsg === null)}
          hint={dirty && validationMsg !== null ? validationMsg : undefined}
          unpublished={!dirty && hasUnpublishedChanges}
          onPublish={() => {
            setError(null);
            // #3 — Primera publicación: SIN modal de motivo. Reason vacío → el endpoint usa su
            // default genérico ("Publicación al cliente"), que el panel ya muestra como "sin
            // motivo". Republicaciones (ya publicado antes) SÍ piden el motivo del cambio.
            if (!hasPublishedOnce) { void publishTimeline(true, ""); }
            else { setPublishReasonText(""); setPublishReasonOpen(true); }
          }}
          publishing={publishWorking}
          savedMessage="Cambios guardados — el cliente todavía no los ve."
        />
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
                onClick={() => applyProposal()}
                disabled={applying}
                className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
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
        (bannerPhaseIds.length > 0 || !!pendingProgress.reasoning) && (
          <div className="rounded-2xl border border-line bg-surface-muted px-5 py-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-900/30 border border-emerald-700/40 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Avance detectado</p>
                <p className="text-xs text-fg-muted mt-0.5">Revisá lo que propone el agente y confirmá antes de aplicar</p>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={discardProgress}
                  disabled={applyingProgress}
                  className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:bg-surface-hover rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                >
                  Descartar
                </button>
                <button
                  onClick={applyProgress}
                  disabled={applyingProgress}
                  className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  {applyingProgress ? "Aplicando…" : "Aplicar avance"}
                </button>
              </div>
            </div>

            {pendingProgress.reasoning && (
              <div className="flex gap-2.5">
                <svg className="w-4 h-4 text-fg-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                <p className="text-[13px] leading-relaxed text-fg-secondary">{pendingProgress.reasoning}</p>
              </div>
            )}

            {bannerPhaseIds.map((pid) => {
              const phaseName = phases.find((p) => p.id === pid)?.name ?? "(fase)";
              const taskIds = phaseToTaskIds.get(pid) ?? [];
              const isHoy = pendingProgress.currentPhaseId === pid;
              const isProposedDone = proposedDone.has(pid);
              const resolvable = isPhaseResolvable(pid);
              const checked = resolvable && progressPhaseSel.has(pid);
              const pendingCount = taskIds.filter((id) => !progressTaskSel.has(id) && !progressSuspendedSel.has(id)).length;
              return (
                <div key={pid} className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-fg">{phaseName}</span>
                    {isHoy && (
                      <span className="text-2xs font-semibold uppercase tracking-wide text-blue-300 bg-blue-900/30 border border-blue-700/40 rounded px-1.5 py-0.5">Hoy</span>
                    )}
                    {isProposedDone && (resolvable ? (
                      <button
                        type="button"
                        onClick={() => setProgressPhaseSel((s) => toggleSet(s, pid))}
                        className={`inline-flex items-center gap-1 text-2xs font-semibold rounded px-2 py-0.5 border transition-colors ${checked ? "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" : "text-fg-muted border-line hover:bg-surface-hover"}`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        {checked ? "Fase completada" : "Cerrar fase"}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-2xs font-medium text-amber-300">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                        resolvé {pendingCount} {pendingCount === 1 ? "tarea" : "tareas"} para cerrarla
                      </span>
                    ))}
                  </div>
                  {taskIds.map((tid) => {
                    const title = progressTaskMeta.get(tid)?.title ?? "(tarea)";
                    const isDone = progressTaskSel.has(tid);
                    const isSusp = progressSuspendedSel.has(tid);
                    const state: "done" | "suspended" | "pending" = isDone ? "done" : isSusp ? "suspended" : "pending";
                    return (
                      <div key={tid} className="flex flex-wrap items-center gap-2 py-1 pl-0.5">
                        <span className={`flex-1 min-w-0 text-sm ${isSusp ? "line-through text-fg-muted" : "text-fg-secondary"}`}>{title}</span>
                        <div className="inline-flex rounded-lg border border-line overflow-hidden text-2xs font-semibold">
                          {([
                            { k: "done", label: "Hecha", on: "bg-emerald-900/30 text-emerald-300" },
                            { k: "suspended", label: "Suspendida", on: "bg-amber-900/30 text-amber-300" },
                            { k: "pending", label: "Pendiente", on: "bg-surface-hover text-fg" },
                          ] as const).map((opt) => (
                            <button
                              key={opt.k}
                              type="button"
                              onClick={() => setTaskState(tid, opt.k)}
                              className={`px-2.5 py-1 transition-colors ${state === opt.k ? opt.on : "text-fg-muted hover:text-fg"}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <p className="text-xs text-fg-muted pt-3 border-t border-line leading-relaxed">
              Marcá cada tarea como hecha, suspendida o pendiente. Una fase se cierra solo cuando todas sus tareas quedan resueltas. El agente propone; vos confirmás.
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
            Generá el <span className="font-medium text-gray-300">Handoff</span> para ver el cronograma inicial — las fases salen de ahí.
          </p>
        </div>
      ) : proposal && proposalGantt ? (
        <TimelineGantt
          anchor={proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : null}
          phases={proposalGantt}
          readOnly
        />
      ) : (
        <>
          {totalTasks === 0 && !hasPublishedOnce && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-700/50 text-amber-200">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-xs leading-relaxed">
                Este cronograma inicial fue creado con la información del <span className="font-semibold">Handoff</span>.{" "}
                <button
                  type="button"
                  onClick={() => void generateDetail({ auto: false })}
                  disabled={generating}
                  className="font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-70 disabled:no-underline"
                >
                  {generating ? (chainingProgress ? "Evaluando avance…" : "Creando tareas…") : "Genera las tareas"}
                </button>{" "}
                para detallarlo y consensuar el avance con el cliente.
              </p>
            </div>
          )}
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
        </>
      )}

      <TimelineAssistDialog
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        phases={phases.map((p) => ({ id: p.id, name: p.name }))}
        initialScopePhaseId={assistScopePhaseId}
        onSubmit={submitAssist}
        loading={assisting}
      />

      {/* Razón del cambio — SOLO al "Subir al cliente" (no en el auto-guardado). Queda
          registrada con un snapshot de lo publicado (TimelineChange) para D.3 (vendido vs real). */}
      {publishReasonOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { if (!publishWorking) setPublishReasonOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Subir al cliente</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Indicá qué cambió en esta versión. Queda registrado con un snapshot de lo publicado
                para comparar después lo planificado contra lo real.
              </p>
            </div>
            <textarea
              value={publishReasonText}
              onChange={(e) => setPublishReasonText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej: el cliente pidió correr la fase de arquitectura una semana."
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPublishReasonOpen(false)}
                disabled={publishWorking}
                className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => publishTimeline(true, publishReasonText)}
                disabled={publishWorking || publishReasonText.trim().length === 0}
                className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-4 py-1.5 rounded-lg transition-colors"
              >
                {publishWorking ? "Subiendo…" : "Subir al cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
