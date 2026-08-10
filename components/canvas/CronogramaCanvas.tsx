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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  plural,
  computePhaseRanges,
  currentWeekIndex,
  projectedEnd,
  describeEndShift,
  endShiftFragment,
} from "@/lib/timeline/weeks";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { useUndo, useUndoScope } from "@/components/ui/UndoProvider";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import TimelineGantt, { type GanttPhase, type GanttTask, type GanttTaskStatus, type GanttParticularidad, PARTY_META, PARTICULARIDAD_KIND_META, effParty } from "./TimelineGantt";
import ParticularidadEditModal, { type ParticularidadPatch } from "./ParticularidadEditModal";
import SugerenciasParticularidad, { type SugerenciaItem } from "./SugerenciasParticularidad";
import ParticularidadToTaskModal, { type ConvertPayload } from "./ParticularidadToTaskModal";
import TaskDetailDrawer from "./TaskDetailDrawer";
import TimelineAssistDialog from "./TimelineAssistDialog";
import PublishBar from "./PublishBar";
import { useMe } from "@/hooks/useMe";
import CronogramaProgressButton from "@/components/clients/CronogramaProgressButton";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { actionsFromSignals } from "@/lib/timeline/project-actions-input";
import ProjectActionsLine from "./ProjectActionsLine";
import ProposalGlobalStrip from "./ProposalGlobalStrip";
import { computeProposalDeltas, type ProposalDelta, type CurrentPhaseLike } from "@/lib/timeline/proposal-deltas";
import { medirPropuesta, type MagnitudPropuesta } from "@/lib/timeline/magnitud-propuesta";
import { targetFor, ANCHORS } from "@/lib/timeline/project-action-targets";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { PhaseRegenModal, type RegenProposedTask, type RegenCurrentTask, type FinalTask } from "./PhaseRegenModal";
import type { ProjectSummary } from "@/lib/portfolio/summary";
import { CronogramaSkeleton } from "@/components/clients/skeletons";
import { Spinner } from "@/components/ui";
import {
  LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN, LOGO_SCALE_STEP,
  logoHeightCalc, logoScaleStyle, resolveLogoScale,
} from "@/lib/ui/logo-scale";
import { ScaleSlider } from "@/components/ui/ScaleSlider";
import { usePopoverDismiss } from "@/components/ui/usePopoverDismiss";

interface TaskDraft {
  id?: string;
  title: string;
  weekIndex: number;
  notes: string | null;
  status: GanttTaskStatus;
  needsValidation: boolean;
  source?: string;
  statusSource?: string;
  statusChangedByEmail?: string | null;
  statusChangedAt?: string | null;
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null;
  type?: "SESSION" | "TASK" | null;
  startDateOverride?: string | null; // #4 — ISO o null (null = derivar de la semana)
  dueDateOverride?: string | null;
  _key: string;
}

interface Phase {
  id?: string;
  name: string;
  durationWeeks: number;
  /** Inicio explícito (offset 0-based). null = contigua tras la anterior. Habilita paralelo. */
  startWeek?: number | null;
  sessionCount: number | null;
  /** Sesiones de entrega reales (CSE/dev + cliente) calculadas por el server.
   *  Solo-lectura, derivado; NO se envía en el PUT. null = fase futura o sin anchor. */
  actualSessionCount?: number | null;
  notes: string | null;
  activityType: string | null;
  source?: string;
  status?: GanttTaskStatus; // D.2 — avance a nivel fase
  needsValidation?: boolean; // fase estimada por el agente del handoff (badge "estimada")
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
  startWeek?: number | null;
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
  statusSource?: string;
  statusChangedByEmail?: string | null;
  statusChangedAt?: string | null;
  party: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null;
  type: "SESSION" | "TASK" | null;
  startDateOverride?: string | null; // #4
  dueDateOverride?: string | null;
}

interface ServerPhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount: number | null;
  actualSessionCount?: number | null;
  notes: string | null;
  activityType: string | null;
  source: string;
  status: GanttTaskStatus;
  needsValidation: boolean;
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

// Borrador de una particularidad propuesta por el agente (el CSE acepta por-ítem en el banner).
interface PendingParticularidadDraft {
  kind: string;
  party: string;
  title: string;
  detail: string | null;
  weeksImpact: number | null;
  occurredAt: string | null;
  sourceQuote: string | null;
  phaseId: string | null;
}

export default function CronogramaCanvas({ projectId, clientId, headerSlot }: { projectId: string; clientId: string; headerSlot?: HTMLElement | null }) {
  const toast = useToast();
  const { pushUndo, clearScope } = useUndo();
  const undoScope = `cronograma:${projectId}`;
  useUndoScope(undoScope); // purga el historial de undo al desmontar (no aplica a otro proyecto)
  // Destino del click en la notificación: la pestaña del proyecto (donde vive el
  // cronograma), no la home del cliente.
  const cronogramaUrl = `/clients/${clientId}?tab=${encodeURIComponent(projectId)}`;

  const [phases, setPhases] = useState<Phase[]>([]);
  const [anchor, setAnchor] = useState<string>(""); // yyyy-mm-dd o ""
  const [closeOverride, setCloseOverride] = useState<string>(""); // Tanda K — cierre fijado a mano, yyyy-mm-dd o ""
  const [kickoffDate, setKickoffDate] = useState<string>(""); // yyyy-mm-dd de la sesión de kickoff (sugerencia)
  const [loading, setLoading] = useState(true);
  // `loading` = primera carga (pinta el skeleton). `refreshing` = refetch tras una acción
  // (mantiene el Gantt en pantalla). Separarlos evita que confirmar un avance colapse la
  // página al esqueleto y pierda el scroll.
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnceRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [chainingProgress, setChainingProgress] = useState(false); // F — fase "evaluando avance" del encadenado
  const [dirty, setDirty] = useState(false);
  /* Instrucciones del CSE para ESTE documento (X1, 2026-08-08): la entry `__doc` del canvas.
     El flag `briefDirty` copia la lección del bug de «Regenerar» del handoff: el draft se
     re-siembra desde el servidor mientras NADIE haya tipeado, y solo se guarda lo que una
     persona escribió — comparar contra el status era lo que borraba notas. */
  const [docBrief, setDocBrief] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefGuardado, setBriefGuardado] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/doc-brief?slug=timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { brief: string | null } | null) => {
        if (!vivo || !d) return;
        setBriefGuardado(d.brief);
        setBriefDirty((sucio) => {
          if (!sucio) setDocBrief(d.brief ?? "");
          return sucio;
        });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [projectId]);

  /* Paso 0 de toda corrida del detalle (auditoría 2026-08-08): si el CSE tipeó
     instrucciones y apretó Regenerar sin Guardar, el draft sucio se PATCHea antes de
     disparar — el mismo arreglo «visto en RC» de las exclusiones del handoff. Best-effort:
     si el PATCH falla, la corrida sigue (sin la regla nueva, como antes). */
  const flushDocBrief = useCallback(async () => {
    if (!briefDirty || docBrief.trim() === (briefGuardado ?? "")) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/doc-brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "timeline", brief: docBrief.trim() || null }),
      });
      if (r.ok) {
        setBriefGuardado(docBrief.trim() || null);
        setBriefDirty(false);
      }
    } catch { /* best-effort */ }
  }, [projectId, briefDirty, docBrief, briefGuardado]);

  const saveDocBrief = useCallback(async () => {
    setSavingBrief(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/doc-brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "timeline", brief: docBrief.trim() || null }),
      });
      if (r.ok) {
        const d = (await r.json()) as { brief: string | null };
        setBriefGuardado(d.brief);
        setBriefDirty(false);
      } else {
        setError("No se pudieron guardar las instrucciones.");
      }
    } catch {
      setError("Error de conexión al guardar las instrucciones.");
    }
    setSavingBrief(false);
  }, [projectId, docBrief]);
  const [error, setError] = useState<string | null>(null);
  // ── Publicación al cliente (in-canvas) ──
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  // ¿Se publicó al menos una vez? (publishedSnapshot != null). Gobierna: primera publicación
  // sin modal (#3) + bloquear "Generar cronograma" sobre un cronograma ya vivo (#2).
  const [hasPublishedOnce, setHasPublishedOnce] = useState(false);
  // Gate del detalle: las tareas por semana solo cruzan al cliente si esto != null. Antes se
  // seteaba SOLO como efecto oculto de "Subir al cliente" — ahora el CSE lo confirma explícito
  // ("Confirmar detalle") sin verse obligado a publicar (son dos decisiones distintas).
  const [detailConfirmedAt, setDetailConfirmedAt] = useState<string | null>(null);
  const [confirmingDetail, setConfirmingDetail] = useState(false);
  // Particularidades (desviaciones curadas) — el CSE ve todas; se pasan al Gantt para el resumen.
  const [particularidades, setParticularidades] = useState<GanttParticularidad[]>([]);
  // Propuestas del equipo técnico (needsValidation=true). Llegan en una lista APARTE del GET
  // justamente para que no se mezclen con las confirmadas: no suman semanas ni salen al cliente.
  const [sugerencias, setSugerencias] = useState<SugerenciaItem[]>([]);
  // Señales del proyecto para el panel "Qué hacer acá" (vienen con el GET del cronograma).
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  // Lo que el cliente lee AHORA (del snapshot congelado), distinto de lo que leerá al «Subir».
  const [publicadas, setPublicadas] = useState<Array<{ kind: string; party: string; weeksImpact: number | null }>>([]);
  // Cambió una particularidad VISIBLE (visibilidad/contenido/borrado) desde la última publicación
  // → la barra "Subir" avisa que hay algo para re-publicar (lo ve el cliente recién al «Subir»).
  const [particularidadesDirty, setParticularidadesDirty] = useState(false);
  // Particularidad en edición (modal). null = cerrado.
  const [editingParticularidadId, setEditingParticularidadId] = useState<string | null>(null);
  const [creatingParticularidad, setCreatingParticularidad] = useState(false);
  const [convertingParticularidadId, setConvertingParticularidadId] = useState<string | null>(null);
  // Confirmación de "Confirmar detalle" cuando se dispara desde el panel: el CTA ejecuta, pero
  // hacer que las tareas crucen al cliente merece un "¿seguro?" de por medio.
  const [confirmDetailOpen, setConfirmDetailOpen] = useState(false);
  // Regen por fase → modal de curación: la fase en juego, la propuesta del preview, y los flags.
  const [regenPhase, setRegenPhase] = useState<GanttPhase | null>(null);
  const [regenPreview, setRegenPreview] = useState<RegenProposedTask[] | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenApplying, setRegenApplying] = useState(false);
  // Pedido del panel "Qué hacer acá" de abrir un grupo de la lista. El nonce hace que re-clickear
  // el mismo CTA lo vuelva a abrir aunque el CSE lo haya cerrado a mano.
  const [focusGroup, setFocusGroup] = useState<{ key: string; nonce: number } | null>(null);
  /** El cajón de borradores del agente (avance + particularidades propuestas). Cerrado por
   *  defecto: son decisiones que esperan, no información que haya que leer al entrar. */
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [savingParticularidad, setSavingParticularidad] = useState(false);
  // Señal del workspace: al generar el handoff, el cronograma (si está vacío) recarga sus fases.
  const { timelineRefreshSignal, bumpGpsRefresh } = useWorkspace();
  // #1/#3 — RBAC del cronograma. `editTimeline` lo tiene TODO interno (incl. CSE): editar,
  // renombrar, mover, fechas, agregar, estado. `deleteTimeline` (NO el CSE) habilita BORRAR
  // tareas/fases — el CSE en su lugar SUSPENDE. El server lo refuerza (guardTimelineEdit/Delete +
  // el diff del PUT no borra sin deleteTimeline); esto es el gating cosmético de la UI.
  const me = useMe();
  const canEdit = me?.capabilities.includes("editTimeline") ?? false;
  const canDelete = me?.capabilities.includes("deleteTimeline") ?? false;
  // Cambiar el cronograma CON IA una vez generado queda para quien tenga
  // cronograma.regenerate (default CSL/Super Admin). La PRIMERA pasada con IA pide
  // cronograma.generate (default todo interno). Espeja los gates del server
  // (timeline/assist + analyze) — la matriz es editable desde /team.
  const canRegenerateTimeline = me?.permissions?.sections?.cronograma?.regenerate === true;
  const canGenerateTimeline = me?.permissions?.sections?.cronograma?.generate === true;
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const [publishWorking, setPublishWorking] = useState(false);
  // Modal de razón del cambio — SOLO al "Subir al cliente" (no en el auto-guardado).
  const [publishReasonOpen, setPublishReasonOpen] = useState(false);
  const [suggestingReason, setSuggestingReason] = useState(false); // fetch de la razón sugerida
  const [publishReasonText, setPublishReasonText] = useState("");
  // ── Asistente IA ──
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistScopePhaseId, setAssistScopePhaseId] = useState<string | null>(null);
  // Drawer de detalle de tarea: se resuelve la tarea VIVA desde `phases` por _key.
  const [selectedTask, setSelectedTask] = useState<{ phaseKey: string; taskKey: string } | null>(null);
  // Si la tarea seleccionada desaparece (borrada o re-zip de _key tras guardar), cerrar el drawer.
  useEffect(() => {
    if (!selectedTask) return;
    const ph = phases.find((p) => p._key === selectedTask.phaseKey);
    if (!ph?.tasks.some((t) => t._key === selectedTask.taskKey)) setSelectedTask(null);
  }, [selectedTask, phases]);
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
  // ── Particularidades propuestas por el agente — borrador separado (aceptación por-ítem) ──
  const [pendingParticularidades, setPendingParticularidades] = useState<PendingParticularidadDraft[] | null>(null);
  const [particSel, setParticSel] = useState<Set<number>>(new Set()); // índices aceptados
  const [particVis, setParticVis] = useState<Set<number>>(new Set()); // índices marcados visibleExternal
  const [applyingPartic, setApplyingPartic] = useState(false);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [clientLogoScale, setClientLogoScale] = useState<number | null>(null);
  // Lo que se arrastra AHORA (solo pinta). El guardado va al soltar, una vez.
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const keyCounter = useRef(0);
  const nextKey = () => `new-${keyCounter.current++}`;
  // Auto-guardado: cuenta de ediciones locales. Si cambia DURANTE un PUT, no pisamos
  // el estado con la respuesta del server (evita perder lo que el CSE tipeó mientras guardaba).
  const editSeq = useRef(0);
  const markDirty = () => { editSeq.current++; setDirty(true); };
  // Undo: captura el estado pre-edición (phases+anchor del render actual) y registra un comando
  // que lo restaura. El restore llama markDirty (reprograma el autosave) pero NO vuelve a registrar
  // undo → sin loop. Snapshot por referencia: los updates de phases son inmutables (arrays nuevos).
  const pushTimelineUndo = (label: string, coalesceKey?: string) => {
    const snapPhases = phases;
    const snapAnchor = anchor;
    pushUndo({
      scope: undoScope,
      label,
      coalesceKey,
      undo: () => {
        setPhases(snapPhases);
        setAnchor(snapAnchor);
        markDirty();
      },
    });
  };
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
      // Las tareas en blanco son borradores locales que NO se enviaron (buildPutBody las filtra),
      // así que el server devuelve solo las NO-vacías. Zipeamos por posición contra esas y
      // conservamos los borradores tal cual (idless) — así la adopción de ids no se rompe.
      const localNonBlank = p.tasks.filter((t) => t.title.trim() !== "");
      const sameTaskCount = (sp.tasks?.length ?? 0) === localNonBlank.length;
      let si = 0; // índice sobre las tareas del server (que son las NO-vacías, en orden)
      return {
        ...p,
        id: p.id ?? sp.id,
        _key: p.id ? p._key : sp.id,
        tasks: sameTaskCount
          ? p.tasks.map((t) => {
              if (t.title.trim() === "") return t; // borrador local sin enviar → intacto
              const st = sp.tasks[si];
              si += 1;
              return t.id ? t : { ...t, id: st.id, _key: st.id };
            })
          : p.tasks,
      };
    });
  };

  const mapServerPhases = (serverPhases: ServerPhase[]): Phase[] =>
    serverPhases.map((p) => ({
      id: p.id,
      name: p.name,
      durationWeeks: p.durationWeeks,
      startWeek: p.startWeek,
      sessionCount: p.sessionCount,
      actualSessionCount: p.actualSessionCount,
      notes: p.notes,
      activityType: p.activityType,
      source: p.source,
      status: p.status,
      needsValidation: p.needsValidation,
      tasks: (p.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        notes: t.notes,
        status: t.status,
        needsValidation: t.needsValidation,
        source: t.source,
        statusSource: t.statusSource,
        statusChangedByEmail: t.statusChangedByEmail ?? null,
        statusChangedAt: t.statusChangedAt ?? null,
        party: t.party,
        type: t.type,
        startDateOverride: t.startDateOverride ?? null,
        dueDateOverride: t.dueDateOverride ?? null,
        _key: t.id,
      })),
      _key: p.id,
    }));

  const load = useCallback(async () => {
    // El skeleton SOLO en la primera carga. `load()` se re-llama tras cada acción
    // (confirmar avance, guardar, aplicar propuesta, crear particularidad…): poner
    // `loading=true` ahí reemplazaba el Gantt entero por el esqueleto, colapsando la
    // página a ~300px y perdiendo la posición de scroll cada vez. Un refetch de acción
    // mantiene el contenido en pantalla y solo marca `refreshing`.
    if (loadedOnceRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      if (!res.ok) {
        // El GET ahora devuelve JSON estructurado en error (antes: 500 crudo → res.json() reventaba
        // → mensaje mudo). Mostramos el mensaje real del server y no caemos al estado vacío.
        const err = await res.json().catch(() => null);
        throw new Error(err?.message ?? "No se pudo cargar el cronograma.");
      }
      const data = await res.json();
      if (data.exists) {
        setPhases(mapServerPhases(data.phases ?? []));
        setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
        setCloseOverride(data.closeDateOverride ? String(data.closeDateOverride).slice(0, 10) : "");
        setKickoffDate(data.kickoffSessionDate ? String(data.kickoffSessionDate).slice(0, 10) : "");
        setPublishedAt(data.timelinePublishedAt ?? null);
        setHasPublishedOnce(!!data.hasPublishedOnce);
        setDetailConfirmedAt(data.detailConfirmedAt ?? null);
        setParticularidades((data.particularidades as GanttParticularidad[] | undefined) ?? []);
        setSugerencias((data.sugerencias as SugerenciaItem[] | undefined) ?? []);
        setParticularidadesDirty(false);
        setSummary((data.summary as ProjectSummary | null) ?? null);
        setPublicadas((data.publicadas as Array<{ kind: string; party: string; weeksImpact: number | null }>) ?? []);
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
        const ppRaw = data.pendingProgress ? (data.pendingProgress as PendingProgress) : null;
        // Si el borrador no trae NADA hecho (sin fases completas ni tareas inferidas hechas), es
        // "todo pendiente" → no hay nada que confirmar, se omite el banner (guarda por si quedó
        // persistido un borrador viejo; la generación nueva ya no lo crea).
        const ppHasProgress =
          !!ppRaw && ((ppRaw.phases?.length ?? 0) > 0 || (ppRaw.tasks ?? []).some((t) => t.done));
        const pp = ppHasProgress ? ppRaw : null;
        setPendingProgress(pp);
        setProgressPhaseSel(new Set((pp?.phases ?? []).map((p) => p.id)));
        setProgressTaskSel(new Set((pp?.tasks ?? []).filter((t) => t.done).map((t) => t.id)));
        setProgressSuspendedSel(new Set());
        // Borrador de particularidades propuesto por el agente — pre-tildá TODAS (el CSE destilda
        // las que no quiera) y ninguna como visible por defecto (visibleExternal opt-in por ítem).
        const ppartRaw = (data.pendingParticularidades as PendingParticularidadDraft[] | null) ?? null;
        const ppart = ppartRaw && ppartRaw.length > 0 ? ppartRaw : null;
        setPendingParticularidades(ppart);
        setParticSel(new Set((ppart ?? []).map((_, i) => i)));
        setParticVis(new Set());
      } else {
        setPhases([]);
        setAnchor("");
        setKickoffDate("");
        setPendingProgress(null);
        setPendingParticularidades(null);
        setPublishedAt(null);
        setHasPublishedOnce(false);
        setDetailConfirmedAt(null);
        setParticularidades([]);
        setSugerencias([]);
        setParticularidadesDirty(false);
        setSummary(null);
        setPublicadas([]);
        setLastEditedAt(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo cargar el cronograma.");
    }
    setLoading(false);
    setRefreshing(false);
    loadedOnceRef.current = true;
    setDirty(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // "Hoy" recién después de hidratar: en SSR no existe, y calcularlo en el primer render
  // desincroniza servidor y cliente (mismo patrón que TimelineGantt).
  const hydrated = useHydrated();
  const hydratedNow = useMemo(() => (hydrated ? new Date() : null), [hydrated]);

  /* Acá vivía un efecto que en CADA montaje le pegaba a `/timeline/publish-suggestion` solo para
     decidir si mostrar la fila "hay cambios que el cliente no vio". Se fue con esa fila: publicar
     es conversación de la barra amarilla (`PublishBar`, arriba), que ya lo sabe comparando
     `lastEditedByHuman` contra `timelinePublishedAt` sin pedirle nada al servidor.
     No es solo limpieza: ese endpoint corre `readClientTimeline` entero —arma el snapshot externo
     completo— y era el único bloqueante real para resolver las acciones de 13-17 proyectos de una,
     que es lo que necesita la bandeja del CSE. El endpoint sigue existiendo y se llama cuando
     corresponde: al ABRIR el modal de publicar, para sugerir el motivo del cambio. */

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
      .then((d) => {
        setClientLogoUrl(d?.logoUrl ?? null);
        setClientLogoScale(typeof d?.logoScale === "number" ? d.logoScale : null);
      })
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

  // Abrir el modal de re-publicación precargando la razón sugerida (diff vs lo ya publicado).
  // Best-effort: si falla el fetch, abre con el textarea vacío (comportamiento previo).
  const openPublishModal = async () => {
    setPublishReasonText("");
    setPublishReasonOpen(true);
    setSuggestingReason(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/publish-suggestion`);
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        // No pisar lo que el CSE ya haya empezado a tipear mientras cargaba.
        setPublishReasonText((cur) => (cur.trim() === "" && typeof d?.suggestion === "string" ? d.suggestion : cur));
      }
    } catch {
      /* sin sugerencia */
    } finally {
      setSuggestingReason(false);
    }
  };

  // ── Confirmar el DETALLE (tareas) sin publicar ─────────────────────────────────
  // Acto de primera clase (antes escondido dentro de "Subir al cliente"): habilita que
  // las acciones por semana crucen a la vista del cliente (gate detailConfirmedAt), pero
  // NO publica — el CSE valida el detalle y decide publicar por separado. Feedback real
  // (toast en éxito/error), no el `.catch(()=>{})` mudo que tenía el fetch incrustado.
  const confirmDetail = async () => {
    setConfirmingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/confirm-detail`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "No se pudo confirmar el detalle del cronograma.");
        toast.error("No se pudo confirmar el detalle.");
        return;
      }
      const d = await res.json().catch(() => ({}));
      setDetailConfirmedAt(d?.confirmedAt ?? new Date().toISOString());
      toast.success("Detalle confirmado — las tareas por semana ya pueden cruzar al cliente al publicar.");
    } catch {
      setError("Error de conexión al confirmar el detalle.");
      toast.error("Error de conexión al confirmar el detalle.");
    } finally {
      setConfirmingDetail(false);
    }
  };


  // ── Edición de tareas (inline en el Gantt) ────────────────────────────────────
  const updateTask = (phaseKey: string, taskKey: string, patch: Partial<TaskDraft>) => {
    // Coalesce por tarea+campos: tipear un título o ajustar un campo = 1 paso de undo.
    pushTimelineUndo("Cambio en la tarea", `${undoScope}|task|${taskKey}|${Object.keys(patch).sort().join(",")}`);
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
    pushTimelineUndo("Tarea agregada");
    setPhases((ps) =>
      ps.map((p) =>
        p._key === phaseKey
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { title: "", weekIndex, notes: null, status: "PENDING" as const, needsValidation: false, party: "SMARTEAM" as const, type: "TASK" as const, _key: nextKey() },
              ],
            }
          : p,
      ),
    );
    markDirty();
  };
  const removeTask = (phaseKey: string, taskKey: string) => {
    pushTimelineUndo("Tarea eliminada");
    setPhases((ps) =>
      ps.map((p) => (p._key === phaseKey ? { ...p, tasks: p.tasks.filter((t) => t._key !== taskKey) } : p)),
    );
    markDirty();
  };

  // ── Edición DIRECTA de fases (además de la barra de IA) ───────────────────────
  // Persiste por el mismo auto-guardado (PUT): nombre/duración/sesiones, agregar y eliminar.
  const updatePhase = (phaseKey: string, patch: { name?: string; durationWeeks?: number; sessionCount?: number | null; startWeek?: number | null }) => {
    // Coalesce por fase+campos: tipear el nombre o arrastrar el inicio = 1 paso de undo.
    pushTimelineUndo("Cambio en la fase", `${undoScope}|phase|${phaseKey}|${Object.keys(patch).sort().join(",")}`);
    setPhases((ps) => ps.map((p) => (p._key === phaseKey ? { ...p, ...patch } : p)));
    markDirty();
  };
  const addPhase = () => {
    pushTimelineUndo("Fase agregada");
    setPhases((ps) => [
      ...ps,
      { name: "", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null, activityType: null, status: "PENDING" as const, needsValidation: false, tasks: [], _key: nextKey() },
    ]);
    markDirty();
  };
  const removePhase = (phaseKey: string) => {
    pushTimelineUndo("Fase eliminada");
    setPhases((ps) => ps.filter((p) => p._key !== phaseKey));
    markDirty();
  };

  // Drag&drop de tareas: mover a (semana, posición) dentro de su fase. El order por semana lo
  // recalcula buildPutBody desde la posición en el array, así que reordenamos el array de la fase.
  const moveTask = (taskKey: string, toPhaseKey: string, toWeekIndex: number, toOrder: number) => {
    pushTimelineUndo("Tarea movida");
    setPhases((ps) => {
      // 1) sacar la tarea de su fase actual (sea cual sea).
      let moved: TaskDraft | undefined;
      let fromPhaseKey: string | undefined;
      const removed = ps.map((p) => {
        const found = p.tasks.find((t) => t._key === taskKey);
        if (!found) return p;
        moved = found;
        fromPhaseKey = p._key;
        return { ...p, tasks: p.tasks.filter((t) => t._key !== taskKey) };
      });
      if (!moved || fromPhaseKey === undefined) return ps;
      // Mover ENTRE fases: el PUT no permite reasignar la fase de una tarea con id, así que al
      // cruzar de fase soltamos el id → se recrea en la fase destino (pierde estado; aceptable).
      const crossPhase = fromPhaseKey !== toPhaseKey;
      const updated: TaskDraft = { ...moved, weekIndex: toWeekIndex, ...(crossPhase ? { id: undefined } : {}) };
      // 2) insertar en la fase destino, en la posición toOrder dentro de su semana.
      return removed.map((p) => {
        if (p._key !== toPhaseKey) return p;
        const result: TaskDraft[] = [];
        let inserted = false;
        let weekSeen = 0;
        for (const t of p.tasks) {
          if (t.weekIndex === toWeekIndex) {
            if (weekSeen === toOrder) { result.push(updated); inserted = true; }
            weekSeen++;
          }
          result.push(t);
        }
        if (!inserted) result.push(updated);
        return { ...p, tasks: result };
      });
    });
    markDirty();
  };

  // Drag&drop de fases: reordenar el array → buildPutBody manda order = índice.
  const reorderPhases = (activeKey: string, overKey: string) => {
    pushTimelineUndo("Fases reordenadas");
    setPhases((ps) => {
      const from = ps.findIndex((p) => p._key === activeKey);
      const to = ps.findIndex((p) => p._key === overKey);
      if (from < 0 || to < 0 || from === to) return ps;
      const next = [...ps];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    markDirty();
  };

  // ── Guardar (PUT bulk — fases + tareas; anchorOverride para fijar desde el Gantt) ──
  const buildPutBody = (phasesToSave: Phase[], anchorYmd: string, closeOverrideYmd: string) => ({
    anchorStartDate: anchorYmd ? new Date(anchorYmd).toISOString() : null,
    // Tanda K — siempre se declara (nunca undefined) para que el autosave del CSE haga round-trip
    // exacto del override: "" → null (volver al proyectado), fecha → fijar.
    closeDateOverride: closeOverrideYmd ? new Date(closeOverrideYmd).toISOString() : null,
    phases: phasesToSave.map((p, i) => {
      const perWeek = new Map<number, number>();
      // Las tareas con título VACÍO son borradores locales (recién agregadas, sin titular aún):
      // no se persisten ni se envían al server (evita el 400 por título vacío) y NO deben bloquear
      // el guardado del resto — viven solo en el estado local hasta que se les pone título.
      const tasks = p.tasks
        .filter((t) => t.title.trim() !== "")
        .map((t) => {
        const weekIndex = Math.min(Math.max(t.weekIndex, 0), Math.max(p.durationWeeks - 1, 0));
        const order = perWeek.get(weekIndex) ?? 0;
        perWeek.set(weekIndex, order + 1);
        return {
          ...(t.id ? { id: t.id } : {}),
          title: t.title.trim(),
          weekIndex,
          order,
          notes: t.notes?.trim() ? t.notes.trim() : null,
          party: t.party ?? null,
          type: t.type ?? null,
          startDateOverride: t.startDateOverride ?? null,
          dueDateOverride: t.dueDateOverride ?? null,
        };
      });
      return {
        ...(p.id ? { id: p.id } : {}),
        name: p.name.trim(),
        order: i,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek ?? null,
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
      // NB: una tarea con título vacío NO invalida el cronograma — es un borrador local que
      // buildPutBody omite. Si bloqueáramos acá, una tarea en blanco congelaría TODO el
      // auto-guardado (incluido el borrado de otras tareas) — era la causa del bug de borrado.
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
          ...buildPutBody(phases, anchor, closeOverride),
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
        // Si hay borradores en blanco locales (no enviados), preservarlos: mergeServerIds adopta
        // ids sin tirar los blancos; mapServerPhases (reemplazo total) los perdería.
        if (data.exists) {
          const hasBlankDrafts = phases.some((p) => p.tasks.some((t) => !t.title.trim()));
          setPhases((cur) =>
            hasBlankDrafts ? mergeServerIds(cur, data.phases ?? []) : mapServerPhases(data.phases ?? []),
          );
          setAnchor(data.anchorStartDate ? String(data.anchorStartDate).slice(0, 10) : "");
          setCloseOverride(data.closeDateOverride ? String(data.closeDateOverride).slice(0, 10) : "");
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

  // ── Propuesta de SOLO ESTRUCTURA (la que deja regenerar el handoff) vs propuesta del ASSIST ──
  // El handoff emite fases SIN `tasks` en ninguna (contrato "no tocar tareas" del PUT); el assist
  // emite reemplazo completo (tasks siempre definido). La de estructura NO swapea el Gantt: se
  // descompone en deltas por ítem (fase nueva / cambio de fase / fecha de arranque) que el CSE
  // acepta o descarta uno por uno DENTRO del cronograma real.
  const structureOnlyProposal = !!proposal && proposal.phases.every((p) => p.tasks === undefined);
  /* Las fases actuales en la forma que piden los helpers puros. Extraído del memo de deltas
     (Tanda J) para que la MAGNITUD mida exactamente contra lo mismo que los deltas: si cada uno
     armara su lista, el aviso podría hablar de un cronograma distinto del que se aplica. */
  const fasesActualesParaDeltas: CurrentPhaseLike[] = useMemo(
    () =>
      phases
        .filter((p): p is Phase & { id: string } => !!p.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          durationWeeks: p.durationWeeks,
          startWeek: p.startWeek ?? null,
          sessionCount: p.sessionCount ?? null,
          notes: p.notes ?? null,
          activityType: p.activityType ?? null,
        })),
    [phases],
  );
  const proposalDeltas: ProposalDelta[] = useMemo(
    () =>
      structureOnlyProposal && proposal
        ? computeProposalDeltas(fasesActualesParaDeltas, proposal, anchor || null)
        : [],
    [structureOnlyProposal, proposal, fasesActualesParaDeltas, anchor],
  );
  /* Cuán distinta es la propuesta y adónde caería el cierre si se aceptara entera. null cuando
     no hay nada que medir — la franja no se pinta en ese caso. */
  const magnitudPropuesta: MagnitudPropuesta | null = useMemo(
    () =>
      structureOnlyProposal && proposal && proposalDeltas.length > 0
        ? medirPropuesta(fasesActualesParaDeltas, proposal, anchor || null)
        : null,
    [structureOnlyProposal, proposal, proposalDeltas.length, fasesActualesParaDeltas, anchor],
  );

  // Debounce: auto-guarda ~1.5 s después de la última edición. Se reinicia con cada
  // cambio (phases/anchor). No corre con propuesta del ASSIST abierta (el Gantt muestra la
  // preview, no lo editable), mientras guarda, con el cronograma inválido, ni si el último
  // intento falló. Con propuesta de ESTRUCTURA sí corre: el Gantt sigue siendo el real y
  // editable (el PUT de autosave ya no borra la propuesta — ver timeline/route.ts).
  useEffect(() => {
    if (!dirty || (proposal && !structureOnlyProposal) || saving || !canEdit) return; // el CSE no autosalva (no edita)
    if (validateLocal() !== null) return;
    if (editSeq.current === lastFailedSeqRef.current) return;
    const t = setTimeout(() => { void autoSave(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, phases, anchor, proposal, saving]);

  // Fijar/cambiar la fecha de arranque desde el Gantt: actualiza el preview (fechas
  // reales) y marca dirty — se PERSISTE con "Guardar cronograma", no al instante.
  const setAnchorFromGantt = (ymd: string) => {
    /* Mover el arranque corre TODAS las fechas del proyecto, y la que importa afuera es la de
       cierre. El chip del encabezado ya la muestra actualizada, pero el toast dice el DELTA —
       que es lo que uno quiere saber justo después de tocar el calendario (Tanda J).
       Solo para el ancla: la duración se edita tecleando y un toast por tecla es ruido que
       enseña a ignorar los toasts. Para eso está el chip, que es continuo. */
    const aviso = describeEndShift(
      projectedEnd(anchor || null, phases),
      projectedEnd(ymd || null, phases),
    );
    pushTimelineUndo("Fecha de inicio cambiada", `${undoScope}|anchor`);
    setAnchor(ymd);
    markDirty();
    if (aviso) toast.info(aviso);
  };

  // Fijar/soltar el cierre a mano desde el Gantt (Tanda K): "" vuelve a seguir el proyectado.
  // Igual que el arranque, se PERSISTE con el autosave, no al instante — el picker solo marca dirty.
  const setCloseOverrideFromGantt = (ymd: string) => {
    pushTimelineUndo(ymd ? "Cierre fijado a mano" : "Cierre vuelto a automático", `${undoScope}|closeOverride`);
    setCloseOverride(ymd);
    markDirty();
  };


  // ── Generar el detalle del cronograma con IA (tareas por semana) ───────────────
  // Se dispara AUTOMÁTICAMENTE al abrir si hay fases sin tareas (auto=true →
  // silencioso si ya existe). También lo invoca "Regenerar detalle".
  const generateDetail = async (opts?: { auto?: boolean }) => {
    await flushDocBrief();
    const auto = opts?.auto ?? false;
    if (!auto) maybeRequestPermission(); // solo en la generación que el usuario disparó
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
        if (!auto) {
          setError(data?.message ?? data?.error ?? "Error al generar el detalle.");
          void notifyAgentDone({ group: "cronograma", ok: false, url: cronogramaUrl });
        } else toast.info("No se pudo generar el detalle automáticamente. Usá «Regenerar detalle» para reintentar.");
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
        clearScope(undoScope); // el detalle nuevo reemplaza el estado: el historial de undo previo ya no aplica
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
          void notifyAgentDone({ group: "cronograma", ok: true, url: cronogramaUrl });
        }
      }
    } catch {
      if (!auto) setError("Error de conexión al generar el detalle.");
      else toast.info("No se pudo generar el detalle automáticamente. Usá «Regenerar detalle» para reintentar.");
    }
    setGenerating(false);
  };

  // Regen POR FASE → modal de curación (D.1). Paso 1 PREVIEW: el agente de detalle genera la propuesta
  // (con el handoff + el canvas Desarrollo) SIN persistir; abre el modal viejo↔nuevo.
  const startRegenPreview = async (phase: GanttPhase) => {
    await flushDocBrief();
    if (!phase.id) return;
    setRegenPhase(phase);
    setRegenPreview(null);
    setRegenLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: 1, step: 0, stepLabel: "Regenerar fase", sectionLabel: "Regenerar fase",
          agentId: "agent-timeline-detail", projectId, regeneratePhaseId: phase.id, preview: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message ?? data?.error ?? "No se pudo generar la propuesta.");
        setRegenPhase(null);
      } else {
        setRegenPreview(Array.isArray(data?.previewTasks) ? data.previewTasks : []);
      }
    } catch {
      toast.error("Error de conexión al generar la propuesta.");
      setRegenPhase(null);
    }
    setRegenLoading(false);
  };

  // Paso 2 APLICAR: el set curado (columna derecha del modal) reemplaza la fase — status por tarea +
  // parche de baseline (server-side).
  const applyPhaseRegen = async (finalTasks: FinalTask[]) => {
    const phase = regenPhase;
    if (!phase?.id) return;
    setRegenApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/phases/${phase.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: finalTasks, reason: `Regeneración curada de «${phase.name}»` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? data?.message ?? "No se pudo aplicar la fase.");
      } else {
        await load();
        clearScope(undoScope);
        toast.success(`Fase «${phase.name}» actualizada.`);
        setRegenPhase(null);
        setRegenPreview(null);
      }
    } catch {
      toast.error("Error de conexión al aplicar la fase.");
    }
    setRegenApplying(false);
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
        clearScope(undoScope); // la propuesta aplicada reemplaza el estado: limpiamos el historial de undo
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

  // ── Resolver POR ÍTEM la propuesta de ESTRUCTURA (la del handoff) ──
  // Aceptar aplica SOLO ese cambio (fase nueva vacía / ajuste de fase / fecha de arranque);
  // descartar solo lo saca de la propuesta. "Aceptar/Descartar todo" pasa todas las claves.
  const [resolvingProposal, setResolvingProposal] = useState(false);
  const resolveProposalItems = async (accept: string[], discard: string[]) => {
    if (resolvingProposal) return;
    setResolvingProposal(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/proposal/apply-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, discard }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo resolver la sugerencia.");
        return;
      }
      const d = (await res.json()) as { applied: number; discarded: number };
      if (d.applied > 0) toast.success(`${plural(d.applied, "sugerencia aplicada", "sugerencias aplicadas")}.`);
      else if (d.discarded > 0) toast.success(d.discarded === 1 ? "Sugerencia descartada." : "Sugerencias descartadas.");
      // Recargar todo (fases nuevas/cambiadas + propuesta reescrita). El load setea proposal
      // con `prev ?? …`, así que hay que vaciarla ANTES para que tome la fresca del server.
      setProposal(null);
      await load();
    } catch {
      toast.error("Error de conexión al resolver la sugerencia.");
    } finally {
      setResolvingProposal(false);
    }
  };

  // Propuesta de estructura SIN deltas vivos (stale: anterior al guard de no-op, o el CSE ya
  // igualó el cronograma a mano) → no hay nada que decidir: se descarta sola, así no queda el
  // aviso fantasma en "Qué hacer acá".
  useEffect(() => {
    // `dirty` es clave: los deltas se calculan contra el estado LOCAL, así que una edición sin
    // guardar que casualmente coincida con la sugerencia la hacía desaparecer del server — y al
    // deshacer ya no volvía. Con cambios sin guardar no se descarta nada.
    if (structureOnlyProposal && proposalDeltas.length === 0 && !resolvingProposal && !loading && !dirty && !saving) {
      void discardProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureOnlyProposal, proposalDeltas.length, loading, dirty, saving]);

  // ── D/E — banner de avance: meta de tareas (título + fase) y regla de cierre de fase ──
  const progressTaskMeta = new Map<string, { title: string; phaseId: string; phaseName: string; party: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null }>();
  for (const p of phases) for (const t of p.tasks) if (t.id && p.id) progressTaskMeta.set(t.id, { title: t.title, phaseId: p.id, phaseName: p.name, party: t.party ?? null });
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
        .filter((p) => p.id && (phaseToTaskIds.has(p.id) || proposedDone.has(p.id)))
        .map((p) => p.id as string)
    : [];
  // Visibilidad de los DOS banners de propuesta del agente (avance + particularidades). Se
  // muestran lado a lado (2 columnas) cuando ambos están; uno solo ocupa el ancho completo.
  const showProgressBanner = !!pendingProgress && (bannerPhaseIds.length > 0 || !!pendingProgress.reasoning);
  const showParticBanner = canEdit && !!pendingParticularidades && pendingParticularidades.length > 0;
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

  // ── Particularidades (PT-5): aplicar las aceptadas / descartar el borrador ─────
  const applyParticularidades = async () => {
    if (!pendingParticularidades) return;
    if (particSel.size === 0) { toast.info("No hay particularidades tildadas para crear."); return; }
    setApplyingPartic(true);
    setError(null);
    try {
      const accepted = [...particSel].map((index) => ({ index, visibleExternal: particVis.has(index) }));
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "No se pudieron crear las particularidades.");
        toast.error("No se pudieron crear las particularidades.");
      } else {
        const d = await res.json().catch(() => ({}));
        setPendingParticularidades(null);
        await load(); // trae las particularidades creadas → aparecen en el resumen
        // El apply ahora FUSIONA: si el hecho ya estaba registrado lo actualiza en vez de duplicarlo.
        const nuevas = (d?.created ?? 0) as number;
        const fusionadas = (d?.updated ?? 0) as number;
        const partes: string[] = [];
        if (nuevas > 0) partes.push(`${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"}`);
        if (fusionadas > 0) partes.push(`${fusionadas} actualizada${fusionadas === 1 ? "" : "s"} (ya estaba${fusionadas === 1 ? "" : "n"} registrada${fusionadas === 1 ? "" : "s"})`);
        toast.success(partes.length > 0 ? `Particularidades: ${partes.join(" · ")}.` : "Sin cambios.");
      }
    } catch {
      setError("Error de conexión al crear las particularidades.");
      toast.error("Error de conexión al crear las particularidades.");
    }
    setApplyingPartic(false);
  };

  const discardParticularidades = async () => {
    try {
      await fetch(`/api/projects/${projectId}/timeline/particularidades/apply`, { method: "DELETE" });
    } catch {
      /* limpiar local igual */
    }
    setPendingParticularidades(null);
  };

  // Togglear la visibilidad de una particularidad YA creada (optimista + PATCH). La visibilidad
  // recién llega al cliente al «Subir» → marcamos particularidadesDirty para que la barra invite a re-publicar.
  const toggleParticularidadVisible = async (id: string, next: boolean) => {
    const prev = particularidades;
    setParticularidades((ps) => ps.map((p) => (p.id === id ? { ...p, visibleExternal: next } : p)));
    setParticularidadesDirty(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleExternal: next }),
      });
      if (!res.ok) {
        setParticularidades(prev); // revertir
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo cambiar la visibilidad.");
      }
    } catch {
      setParticularidades(prev);
      toast.error("Error de conexión al cambiar la visibilidad.");
    }
  };

  // Editar el CONTENIDO de una particularidad (desde el modal). PATCH con todos los campos; update
  // local del estado. Marca particularidadesDirty si el cambio afecta al cliente (es o era visible).
  // Crear un AVISO a mano (el CSE le escribe al cliente). Espejo de saveParticularidad, pero POST:
  // el endpoint lo marca source=HUMAN y visible por defecto, así que nace listo para subir.
  const createParticularidad = async (patch: ParticularidadPatch) => {
    setSavingParticularidad(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo crear el aviso.");
        return;
      }
      const created = await res.json();
      setParticularidades((ps) => [created, ...ps]);
      if (created.visibleExternal) setParticularidadesDirty(true);
      setCreatingParticularidad(false);
      toast.success("Aviso creado.");
    } catch {
      toast.error("Error de conexión al crear el aviso.");
    } finally {
      setSavingParticularidad(false);
    }
  };

  const saveParticularidad = async (id: string, patch: ParticularidadPatch) => {
    const before = particularidades.find((p) => p.id === id);
    setSavingParticularidad(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo guardar la particularidad.");
        return;
      }
      const updated = await res.json();
      setParticularidades((ps) => ps.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      if (before?.visibleExternal || patch.visibleExternal) setParticularidadesDirty(true);
      setEditingParticularidadId(null);
      toast.success("Particularidad actualizada.");
    } catch {
      toast.error("Error de conexión al guardar la particularidad.");
    } finally {
      setSavingParticularidad(false);
    }
  };

  const deleteParticularidad = async (id: string) => {
    const before = particularidades.find((p) => p.id === id);
    setSavingParticularidad(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo eliminar la particularidad.");
        return;
      }
      setParticularidades((ps) => ps.filter((p) => p.id !== id));
      if (before?.visibleExternal) setParticularidadesDirty(true);
      setEditingParticularidadId(null);
      toast.success("Particularidad eliminada.");
    } catch {
      toast.error("Error de conexión al eliminar la particularidad.");
    } finally {
      setSavingParticularidad(false);
    }
  };

  // ── Convertir un hecho en TRABAJO ──────────────────────────────────────────────
  // El hecho queda como registro de por qué pasó; la tarea es quién lo hace y para cuándo. Nada de
  // esto se aplica solo: el CSE elige dueño, fase y semana en el modal.
  const convertParticularidad = async (id: string, payload: ConvertPayload) => {
    setSavingParticularidad(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error ?? "No se pudo crear la tarea.");
        return;
      }
      setConvertingParticularidadId(null);
      // Trae la tarea nueva al Gantt y el link a la fila (que cambia de grupo).
      await load();
      // Si el hecho dejó de mostrarse al cliente, eso recién llega al «Subir».
      if (d?.hiddenFromClient) setParticularidadesDirty(true);
      const fase = phases.find((p) => p.id === payload.phaseId)?.name ?? "el cronograma";
      toast.success(`Tarea creada en ${fase} · semana ${payload.weekIndex + 1}.`, {
        duration: 12000,
        action: { label: "Deshacer", onClick: () => void undoConvert(id) },
      });
    } catch {
      toast.error("Error de conexión al crear la tarea.");
    } finally {
      setSavingParticularidad(false);
    }
  };

  const undoConvert = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/particularidades/${id}/convert`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo deshacer.");
        return;
      }
      await load();
      toast.info("Conversión deshecha.");
    } catch {
      toast.error("Error de conexión al deshacer.");
    }
  };

  const toggleSet = (s: Set<string>, id: string): Set<string> => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };


  // ── Toggle de estado desde el Gantt (PATCH, optimista) ────────────────────────
  // `fromUndo` evita registrar un nuevo comando de undo cuando el toggle viene del propio undo.
  const toggleStatus = async (taskId: string, next: GanttTaskStatus, fromUndo = false) => {
    // Undo del estado: re-PATCH al estado previo (no pasa por phases+autosave; es su propia vía).
    if (!fromUndo) {
      let prev: GanttTaskStatus | undefined;
      for (const p of phases) {
        const t = p.tasks.find((x) => x.id === taskId);
        if (t) { prev = t.status; break; }
      }
      if (prev !== undefined && prev !== next) {
        const prevStatus = prev;
        pushUndo({
          scope: undoScope,
          label: "Estado de tarea cambiado",
          coalesceKey: `${undoScope}|status|${taskId}`,
          undo: () => { void toggleStatus(taskId, prevStatus, true); },
        });
      }
    }
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

  const hasAiDetail = phases.some((p) => p.tasks.some((t) => t.source === "AGENT" || t.source === "MODIFIED"));
  const ganttPhases: GanttPhase[] = phases.map((p) => ({
    key: p._key,
    id: p.id,
    name: p.name || "(sin nombre)",
    durationWeeks: p.durationWeeks,
    startWeek: p.startWeek ?? null,
    sessionCount: p.sessionCount,
    actualSessionCount: p.actualSessionCount ?? null,
    activityType: p.activityType,
    status: p.status,
    needsValidation: p.needsValidation,
    tasks: p.tasks.map((t) => ({
      key: t._key,
      id: t.id,
      title: t.title,
      weekIndex: Math.min(t.weekIndex, Math.max(p.durationWeeks - 1, 0)),
      status: t.status,
      notes: t.notes,
      needsValidation: t.needsValidation,
      source: t.source,
      statusSource: t.statusSource,
      statusChangedByEmail: t.statusChangedByEmail ?? null,
      statusChangedAt: t.statusChangedAt ?? null,
      party: t.party,
      type: t.type,
      startDateOverride: t.startDateOverride ?? null,
      dueDateOverride: t.dueDateOverride ?? null,
    })),
  }));

  /* ── Panel "Qué hacer acá" ────────────────────────────────────────────────────
     El armado del input se mudó a `lib/timeline/project-actions-input.ts` (puro), porque la
     bandeja del CSE tiene que resolver las acciones de 13-17 proyectos sin montar 17 canvases.
     Acá sigue calculándose LOCAL a propósito: la lista tiene que reaccionar a `ganttPhases`
     apenas el CSE toca una tarea, antes de que vuelva el próximo `load()`. Misma función, dos
     llamadores, cero divergencia posible. */
  const projectActions = useMemo(
    () =>
      actionsFromSignals(
        {
          anchorStartDate: anchor || null,
          detailConfirmedAt,
          hasTasks: hasAiDetail,
          pendingProgress: showProgressBanner,
          pendingParticularidades: showParticBanner ? (pendingParticularidades?.length ?? 0) : 0,
          pendingProposal: !!proposal,
          particularidades,
          sugerenciasDelEquipo: sugerencias.length,
          phases: ganttPhases,
        },
        summary,
        hydratedNow,
      ),
    [
      ganttPhases, anchor, hydratedNow, summary, showProgressBanner, showParticBanner,
      pendingParticularidades, proposal, detailConfirmedAt, hasAiDetail, particularidades, sugerencias,
    ],
  );

  // El destino de cada acción vive en una TABLA PURA (`project-action-targets`), no en un if-chain.
  // Antes había un `return` final que mandaba lo no contemplado al tope del Gantt, y terminaron
  // cayendo ahí 8 de 16 acciones sin que nada avisara. Ahora el destino es explícito por id y hay un
  // test que exige que toda acción emitida tenga uno.
  const handleProjectAction = (id: string) => {
    const target = targetFor(id);
    if (!target) {
      // Solo pasa si alguien agregó una acción al motor sin destino — el test lo caza antes, pero en
      // runtime preferimos no hacer nada a mandarlo a un lugar cualquiera.
      console.warn(`[cronograma] acción sin destino declarado: ${id}`);
      return;
    }
    switch (target.kind) {
      case "drawer":
        // Los borradores del agente ya no son un banner: se abren.
        return setDraftsOpen(true);
      case "run":
        // Confirmar el detalle: el click ES la decisión (con confirmación de por medio). Mandarlo a
        // scrollear a un botón que dice lo mismo es fricción sin propósito.
        return setConfirmDetailOpen(true);
      case "particularidades":
        // El grupo viene de la TABLA, no de un if-chain acá: antes era
        // `id === "compromisos-sin-tarea" ? "compromisos" : "arreglar"`, o sea que cualquier
        // acción nueva caía en "arreglar" en silencio — el mismo fallback que este archivo
        // dice haber matado, escondido una capa más abajo.
        setFocusGroup((f) => ({ key: target.group, nonce: (f?.nonce ?? 0) + 1 }));
        return void document
          .getElementById(ANCHORS.particularidades)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      case "anchor":
        return void document
          .getElementById(target.anchor)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      case "none":
        return; // la fila se renderiza sin botón; no debería llegar acá
    }
  };

  // Cáscara del Gantt a ancho completo (el skeleton viejo tenía `max-w-3xl`, así que la
  // página además saltaba en ancho al resolver).
  if (loading) return <CronogramaSkeleton />;

  /* Acá se contaban `totalTasks`, `pendingValidation` y `estimatedPhases`, y existían SOLO para
     alimentar los dos avisos ámbar permanentes que se borraron. Las marcas que representaban no
     se perdieron: el Gantt las pinta donde importan —el badge "estimada" en la fila de su fase y
     el "por validar" en su tarea— en vez de resumirlas arriba de todo. */

  // ── Drawer de detalle de tarea: resolución de la tarea VIVA + navegación ──────
  const drawerRanges = computePhaseRanges(phases);
  const selPhaseIdx = selectedTask ? phases.findIndex((p) => p._key === selectedTask.phaseKey) : -1;
  const selPhase = selPhaseIdx >= 0 ? phases[selPhaseIdx] : null;
  const selDraft = selPhase && selectedTask ? selPhase.tasks.find((t) => t._key === selectedTask.taskKey) ?? null : null;
  const drawerTask: GanttTask | null = selDraft
    ? {
        key: selDraft._key,
        id: selDraft.id,
        title: selDraft.title,
        weekIndex: selDraft.weekIndex,
        status: (selDraft.status ?? "PENDING") as GanttTaskStatus,
        notes: selDraft.notes,
        needsValidation: selDraft.needsValidation ?? false,
        source: selDraft.source,
        party: selDraft.party,
        type: selDraft.type,
        startDateOverride: selDraft.startDateOverride ?? null,
        dueDateOverride: selDraft.dueDateOverride ?? null,
      }
    : null;
  // Lista plana (orden de render) para navegar ↑/↓ entre tareas sin cerrar el drawer.
  const flatTasks = phases.flatMap((p) => p.tasks.map((t) => ({ phaseKey: p._key, taskKey: t._key })));
  const flatIdx = selectedTask
    ? flatTasks.findIndex((f) => f.phaseKey === selectedTask.phaseKey && f.taskKey === selectedTask.taskKey)
    : -1;
  const navigateTask = (dir: -1 | 1) => {
    if (flatIdx < 0) return;
    const next = flatTasks[flatIdx + dir];
    if (next) setSelectedTask(next);
  };

  // Propuesta → preview del Gantt (read-only) + resumen del diff
  const proposalGantt: GanttPhase[] | null = proposal
    ? proposal.phases.map((p, i) => ({
        key: p.id ?? `prop-${i}`,
        id: p.id,
        name: p.name,
        durationWeeks: p.durationWeeks,
        startWeek: p.startWeek ?? null,
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
    // Tareas actuales por fase — para la semántica "tasks ausente = no tocar" de abajo.
    const currentTaskIdsByPhase = new Map<string, string[]>();
    for (const p of phases) {
      if (p.id) currentTaskIdsByPhase.set(p.id, p.tasks.filter((t) => t.id).map((t) => t.id as string));
    }
    const proposalTaskIds = new Set<string>();
    let added = 0;
    let edited = 0;
    for (const p of proposal.phases) {
      // Contrato del PUT (timeline/route.ts): `tasks === undefined` = NO tocar las tareas de esa
      // fase → se CONSERVAN. Contarlas como borradas era el bug del "−70 tareas" tras regenerar el
      // handoff (cuya propuesta es solo estructura de fases, sin tasks en ninguna).
      if (p.tasks === undefined) {
        for (const id of p.id ? (currentTaskIdsByPhase.get(p.id) ?? []) : []) proposalTaskIds.add(id);
        continue;
      }
      for (const t of p.tasks) {
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
      if (cur && (cur.name !== p.name || cur.durationWeeks !== p.durationWeeks || (cur.startWeek ?? null) !== (p.startWeek ?? null) || (cur.activityType ?? null) !== (p.activityType ?? null))) {
        phasesChanged++;
      }
    }
    const proposalPhaseIds = new Set(proposal.phases.filter((p) => p.id).map((p) => p.id as string));
    const phasesRemoved = [...currentPhaseById.keys()].filter((id) => !proposalPhaseIds.has(id)).length;
    const anchorChanged =
      (proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : "") !== anchor;

    /* La consecuencia que ninguno de los contadores de arriba muestra (Tanda J): con cuántas
       tareas o fases se toque, lo que el cliente pregunta es CUÁNDO TERMINA. La propuesta del
       assist es un reemplazo completo, así que se proyecta directo — sin pasar por deltas. */
    const endShift = endShiftFragment(
      projectedEnd(anchor || null, phases),
      projectedEnd(proposal.anchorStartDate ?? anchor ?? null, proposal.phases),
    );

    return { added, removed, edited, phasesAdded, phasesRemoved, phasesChanged, anchorChanged, endShift };
  })();

  // ¿Hay cambios guardados sin subir? Hay cronograma y: nunca se subió, O se editó
  // (lastEditedByHuman) después de la última subida. Cualquiera de los dos → el
  // cliente todavía no ve el estado guardado → CTA "Subir al cliente".
  const hasUnpublishedChanges = !!(
    phases.length > 0 &&
    (!publishedAt || (lastEditedAt && new Date(lastEditedAt) > new Date(publishedAt)) ||
      // Cambiar la visibilidad de una particularidad NO toca lastEditedByHuman (no es edición
      // estructural), pero sí requiere re-Subir para que el cliente lo vea → cuenta como "sin subir".
      particularidadesDirty)
  );
  // Para la barra: si hay ediciones sin guardar pero el cronograma está inválido,
  // mostramos el motivo (el auto-guardado espera a que se completen los campos).
  const validationMsg = phases.length > 0 ? validateLocal() : null;

  return (
    <div className="space-y-4">
      {/* Logo del cliente — paridad con el preview del kickoff (lado Nexus). Clickeable
          para ajustar el tamaño: acá se edita la BASE del cliente y no un ajuste local,
          porque el cronograma NO es un canvas con bloques donde guardar uno. Por eso el
          popover lo dice con todas las letras. */}
      {clientLogoUrl && (
        <div className="flex items-center">
          <LogoSizePopover
            clientId={clientId}
            scale={clientLogoScale}
            onScale={setClientLogoScale}
            onPreview={setPreviewScale}
            editable={canEdit}
          >
            {/* `h-9` (36px) sale de la clase y pasa al calc: es el mismo valor, multiplicado. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clientLogoUrl}
              alt="Logo del cliente"
              className="w-auto object-contain"
              style={{
                ...logoScaleStyle(resolveLogoScale(previewScale ?? clientLogoScale)),
                height: logoHeightCalc(36),
                // El tope de ancho ESCALA con el logo. Fijo en 180px, una banda 6,2:1 ya lo
                // toca al 100% y a partir de ahí subir el % no hacía nada visible.
                maxWidth: logoHeightCalc(180),
              }}
            />
          </LogoSizePopover>
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
          {/* La propuesta de estructura, en la MISMA fila que las demás acciones.
              ── LA FALLA QUE ARREGLA ─────────────────────────────────────────
              Con una propuesta pendiente, esta fila quedaba VACÍA: el gate `!proposal` escondía
              los tres botones. Pero una propuesta de estructura NO congela el cronograma —el
              Gantt sigue editable y el aviso ámbar de abajo igual ofrece "Genera las tareas"—,
              así que la acción existía pero solo enterrada en un banner. Quedaban cuatro avisos
              apilados antes de ver el Gantt y ningún botón donde uno los busca.
              NO acepta: baja hasta la franja, donde cada cambio se ve con su detalle. */}
          {canEdit && structureOnlyProposal && proposalDeltas.length > 0 && (
            <button
              onClick={() =>
                document
                  .getElementById("cronograma-propuesta")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
              title="La IA propuso cambios de estructura desde el handoff — se revisan uno por uno"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              {/* Con un cambio masivo, "Revisar 11 cambios" subestima lo que hay abajo: no son
                  once ajustes, es otro plan. El texto cambia; la CONDICIÓN del botón, no. */}
              {magnitudPropuesta?.esCronogramaNuevo
                ? "Revisar el cronograma nuevo"
                : `Revisar ${proposalDeltas.length} ${proposalDeltas.length === 1 ? "cambio" : "cambios"}`}
            </button>
          )}
          {/* CTA bi-estado (#2): sin tareas (y nunca publicado) → "Generar cronograma" (crea las
              tareas iniciales); ya con tareas o publicado → "Chequear avance" (D.2). El gate
              !hasPublishedOnce evita regenerar sobre un cronograma vivo (borraría fechas/avance),
              aun si se borraron las tareas post-publicación. */}
          {canEdit && phases.length > 0 && (!proposal || structureOnlyProposal) && (
            !hasPublishedOnce && !hasAiDetail ? (
              // Cronograma VIRGEN: "Generar cronograma" solo si tiene el permiso; si no,
              // no mostrar nada (NO caer al botón de avance — no hay avance que chequear
              // sobre un esqueleto sin tareas y el usuario no puede generarlas).
              canGenerateTimeline ? (
                <button
                  onClick={() => void generateDetail({ auto: false })}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
                  title="Crea las tareas iniciales del cronograma con IA, sobre las fases del handoff"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generar cronograma
                </button>
              ) : null
            ) : (
              <CronogramaProgressButton projectId={projectId} onDone={load} />
            )
          )}
          {canEdit && phases.length > 0 && !proposal && (hasAiDetail ? canRegenerateTimeline : canGenerateTimeline) && (
            <button
              onClick={() => { setAssistScopePhaseId(null); setAssistOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
              title="Pedile a la IA un cambio del cronograma — vos revisás antes de aplicar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Pedir cambio con IA
            </button>
          )}
          {/* PT-0b — "Confirmar detalle" desacoplado de "Subir al cliente": habilita el gate
              detailConfirmedAt (las tareas por semana pueden cruzar al cliente) SIN publicar.
              Visible cuando hay tareas IA (source AGENT/MODIFIED) y el detalle aún no se confirmó.
              "Subir al cliente" lo sigue confirmando como red de seguridad idempotente. */}
          {canEdit && phases.length > 0 && !proposal && hasAiDetail && !detailConfirmedAt && (
            <button
              onClick={() => void confirmDetail()}
              disabled={confirmingDetail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors bg-emerald-900/30 border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-600 disabled:opacity-60"
              title="Marca el detalle (tareas por semana) como validado para que pueda cruzar al cliente — no publica todavía"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {confirmingDetail ? "Confirmando…" : "Confirmar detalle"}
            </button>
          )}
        </>,
        headerSlot,
      )}

      {/* Refetch en curso tras una acción: el Gantt SIGUE en pantalla (no se reemplaza por
          el skeleton), solo se avisa que los datos se están actualizando. */}
      {refreshing && (
        <p className="text-xs text-fg-muted flex items-center gap-1.5" aria-live="polite">
          <Spinner size="xs" color="border-fg-muted" />
          Actualizando…
        </p>
      )}

      {/* Barra ÚNICA de guardar/subir — mismo diseño que en el kickoff. El guardado
          es AUTOMÁTICO (interno): "Guardando…" → "Cambios guardados". "Subir al cliente"
          es el único paso que publica el snapshot al cliente (también el primer publish). */}
      {canEdit && !proposal && phases.length > 0 && (
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
            else { void openPublishModal(); }
          }}
          publishing={publishWorking}
          savedMessage="Cambios guardados — el cliente todavía no los ve."
        />
      )}

      {/* La propuesta de ESTRUCTURA ya no tiene banner propio. Sus cambios siempre se resolvieron
          POR ÍTEM dentro del Gantt (badges azules en las fases afectadas + filas «Fase propuesta»),
          así que el banner de arriba era un índice de algo que estaba 300 px más abajo — y ocupaba
          el mismo lugar que el documento. Lo global —fecha de arranque sugerida, reordenamiento, y
          el aceptar/descartar todo— se mudó a la franja de encabezado del propio Gantt, al lado
          del selector de fecha, que es donde se aplica. */}

      {/* ── Banner de propuesta del ASSIST (reemplazo completo con tareas): preview sin guardar ── */}
      {proposal && !structureOnlyProposal && diffSummary && (
        // Ancla PROPIA: antes el CTA "Ver la propuesta" apuntaba a #cronograma-borradores, que solo
        // existe si hay banners de avance o particularidades. Con solo una propuesta pendiente, el
        // botón no hacía nada.
        <div id="cronograma-propuesta" className="scroll-mt-24 rounded-2xl border border-violet-700/40 bg-violet-900/30 px-4 py-3 space-y-2">
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
                // Lo que ninguno de los contadores anteriores dice: cuándo termina el proyecto.
                diffSummary.endShift,
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

      {/* ── "Qué hacer acá", en UNA LÍNEA. Todo lo que antes ocupaba media pantalla arriba del
             Gantt vive acá adentro: se abre si el CSE quiere, y por defecto no compite con el
             documento que esta pantalla existe para mostrar. ── */}
      {!loading && phases.length > 0 && (
        <ProjectActionsLine actions={projectActions} onAction={handleProjectAction} />
      )}

      {/* ── EL CAJÓN DE BORRADORES DEL AGENTE ────────────────────────────────────────
          Avance detectado + particularidades propuestas. Los dos vivían como banners fijos
          arriba del Gantt; son decisiones que esperan, no información que haya que leer cada
          vez que se entra. Ahora se abren desde la línea de arriba ("Revisar avance" /
          "Revisar particularidades") y desde el enlace profundo de la bandeja.
          Las dos secciones conviven en el mismo cajón porque son la misma pregunta —qué
          detectó el agente desde la última sesión— y separarlas obligaba a abrir dos veces. */}
      <Modal
        open={draftsOpen && (showProgressBanner || showParticBanner)}
        onClose={() => setDraftsOpen(false)}
        title="Lo que detectó el agente"
        description="Nada de esto se aplicó todavía: revisá y confirmá."
        size="xxl"
      >
      {/* Sin `id`: el ancla `cronograma-borradores` se borró de la tabla de destinos junto con el
          banner. Estos bloques ya no se alcanzan por scroll sino abriendo el cajón. */}
      <div className={`grid gap-4 items-start ${showProgressBanner && showParticBanner ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {showProgressBanner && (
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
                    const meta = progressTaskMeta.get(tid);
                    const title = meta?.title ?? "(tarea)";
                    const party = effParty(meta?.party);
                    const isDone = progressTaskSel.has(tid);
                    const isSusp = progressSuspendedSel.has(tid);
                    const state: "done" | "suspended" | "pending" = isDone ? "done" : isSusp ? "suspended" : "pending";
                    return (
                      <div key={tid} className="flex flex-wrap items-center gap-2 py-1 pl-0.5">
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${isSusp ? "line-through text-fg-muted" : "text-fg-secondary"}`}>{title}</span>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${PARTY_META[party].cls}`}
                            title="Responsable de la tarea en el plan compartido"
                          >
                            {PARTY_META[party].label}
                          </span>
                        </div>
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

        {/* ── Banner: PARTICULARIDADES propuestas por el agente (PT-5) ── */}
        {/* Borrador SEPARADO del avance: el CSE tilda cuáles registrar y cuáles ve el cliente
            (visibleExternal por ítem). "Crear" persiste como Particularidad; "Descartar" tira el borrador.
            Misma estructura de header que "Avance detectado" (tile + título + subtítulo + acciones). */}
        {showParticBanner && pendingParticularidades && (
          <div className="rounded-2xl border border-line bg-surface-muted px-5 py-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-900/30 border border-violet-700/40 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Particularidades detectadas</p>
                <p className="text-xs text-fg-muted mt-0.5">Tildá cuáles registrar y cuáles verá el cliente</p>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => void discardParticularidades()}
                  disabled={applyingPartic}
                  className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:bg-surface-hover rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                >
                  Descartar
                </button>
                <button
                  onClick={() => void applyParticularidades()}
                  disabled={applyingPartic || particSel.size === 0}
                  className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  {applyingPartic ? "Creando…" : `Crear ${particSel.size}`}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {pendingParticularidades.map((pt, i) => {
                const kMeta = PARTICULARIDAD_KIND_META[pt.kind] ?? { label: pt.kind, cls: "text-fg-muted bg-surface-hover border-line" };
                const pMeta = PARTY_META[pt.party] ?? PARTY_META.SMARTEAM;
                const accepted = particSel.has(i);
                const visible = particVis.has(i);
                return (
                  <div key={i} className={`rounded-xl border border-line px-3 py-2.5 transition-colors ${accepted ? "bg-surface" : "bg-surface/40 opacity-55"}`}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={() => setParticSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                        className="mt-0.5 h-3.5 w-3.5 accent-violet-500 flex-shrink-0"
                        title="Registrar esta particularidad"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border ${kMeta.cls}`}>{kMeta.label}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border ${pMeta.cls}`}>{pMeta.label}</span>
                          {pt.weeksImpact != null && pt.weeksImpact > 0 && (
                            <span className="text-[11px] font-semibold text-red-300">+{plural(pt.weeksImpact, "semana", "semanas")}</span>
                          )}
                        </div>
                        <p className="text-sm text-fg font-medium leading-snug">{pt.title}</p>
                        {pt.detail && <p className="text-[12.5px] text-fg-secondary leading-relaxed">{pt.detail}</p>}
                        {/* Cita interna (fecha de la sesión + fragmento) — respalda el hecho; nunca cruza al cliente. */}
                        {pt.sourceQuote && (
                          <p className="text-[11px] text-fg-muted italic leading-relaxed">
                            {pt.occurredAt && <span className="not-italic text-fg-muted/70 mr-1">[{pt.occurredAt.slice(0, 10)}]</span>}
                            «{pt.sourceQuote}»
                          </p>
                        )}
                        <label className={`inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer select-none ${accepted ? "text-fg-muted hover:text-fg" : "text-fg-muted/40 pointer-events-none"}`} title="Que el cliente la vea en su cronograma compartido">
                          <input
                            type="checkbox"
                            checked={visible}
                            disabled={!accepted}
                            onChange={() => setParticVis((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                            className="h-3.5 w-3.5 accent-emerald-500"
                          />
                          Visible al cliente
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-fg-muted pt-3 border-t border-line leading-relaxed">
              El agente las infirió de las sesiones. Registrá solo las reales; marcá «Visible al cliente» las que quieras exponer en su cronograma.
            </p>
          </div>
        )}
      </div>
      </Modal>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/50 text-red-300">
          <span className="text-sm font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-semibold text-red-200 hover:text-white px-2 py-1 rounded hover:bg-red-800/40">Cerrar</button>
        </div>
      )}

      {/* Acá vivían dos avisos ámbar permanentes: "N fases estimadas" y "se generó con handoff
          limitado". Los dos se fueron, y no se reemplazan por nada.
          Fallan el criterio de admisión que el propio motor de acciones declara: (a) no tienen una
          acción concreta —dicen "revisá", que no es un gesto—, (b) no empeoran si nadie los
          atiende, y (c) el Gantt YA los muestra donde importa: la fase estimada lleva su badge en
          su fila y la tarea sin validar el suyo. Eran un índice permanente de marcas que están dos
          centímetros más abajo, ocupando el lugar del documento. Un aviso crónico deja de leerse a
          la semana; lo que consigue es que tampoco se lean los que sí importan. */}

      {/* ── EL cronograma. Propuesta del ASSIST (con tareas) → preview read-only swapeada.
             Propuesta de ESTRUCTURA (handoff) → NO se swapea: el Gantt real sigue editable y
             los deltas se dibujan adentro (badges + filas fantasma). ── */}
      {/* ── INSTRUCCIONES DEL CSE PARA ESTE DOCUMENTO (X1) ─────────────────────
          Texto libre que el agente de detalle recibe como regla dura al generar/regenerar
          las tareas («las fases de QA van al final», «sin capacitaciones»). Vive en la entry
          `__doc` del canvas — no en una columna — y se pinta acá porque una instrucción que
          existe y no se ve termina re-escrita a mano en cada regeneración. */}
      {canEdit && (
        <div className="rounded-xl border border-line bg-surface px-4 py-2.5">
          <button
            onClick={() => setShowBrief((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-fg hover:text-brand transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showBrief ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Instrucciones para la IA de este documento
            {briefDirty && docBrief.trim() !== (briefGuardado ?? "") ? (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                sin guardar
              </span>
            ) : briefGuardado ? (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                activas
              </span>
            ) : null}
          </button>
          {showBrief && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-fg-muted leading-relaxed">
                El agente las cumple al detallar o regenerar el cronograma (ej. &quot;las tareas de QA
                van en la última semana de cada fase&quot;, &quot;no incluyas capacitaciones&quot;).
              </p>
              <textarea
                value={docBrief}
                onChange={(e) => { setDocBrief(e.target.value); setBriefDirty(true); }}
                rows={3}
                maxLength={5000}
                placeholder='Ej.: "El pase a producción siempre es la última tarea de la fase de Entrega."'
                className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveDocBrief}
                  disabled={savingBrief || !briefDirty || docBrief.trim() === (briefGuardado ?? "")}
                  className="text-xs font-semibold text-primary-fg bg-brand hover:opacity-90 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-opacity"
                >
                  {savingBrief ? "Guardando…" : "Guardar instrucciones"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phases.length === 0 ? (
        /* ── EL POZO SIN SALIDA, TAPADO ─────────────────────────────────────────
           Acá había la misma frase y NINGÚN botón. El botón "Generar cronograma" que está
           arriba exige `phases.length > 0` —genera TAREAS dentro de fases que ya existen, no
           las fases— así que un proyecto sin handoff quedaba mirando una instrucción sin ningún
           gesto disponible: había que adivinar que el handoff vive en OTRA pestaña.
           No es un caso de borde: era el estado permanente de los 2 hermanos menores (cuyo
           handoff se redirigía al mayor, y por lo tanto sus fases aterrizaban allá) y es el
           estado de cualquier Implementación a la que todavía no se le generó el handoff. */
        <div className="rounded-2xl border border-dashed border-gray-700 px-5 py-8 text-center text-gray-400 space-y-4">
          <p className="text-sm">
            Generá el <span className="font-medium text-gray-300">Handoff</span> para ver el cronograma inicial — las fases salen de ahí.
          </p>
          <a
            href={cronogramaUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-primary-fg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Ir al Handoff del proyecto
          </a>
        </div>
      ) : proposal && !structureOnlyProposal && proposalGantt ? (
        <TimelineGantt
          anchor={proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : null}
          phases={proposalGantt}
          readOnly
        />
      ) : (
        // `space-y-4` propio: el wrapper existe para que el panel "Qué hacer acá" pueda saltar acá
        // (scrollIntoView), y replica el espaciado que estos hijos tenían sueltos en el contenedor.
        <div id="cronograma-gantt" className="space-y-4 scroll-mt-24">
          {canEdit && !hasAiDetail && !hasPublishedOnce && canGenerateTimeline && (
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
            readOnly={!canEdit}
            canDelete={canDelete}
            onToggleStatus={toggleStatus}
            onUpdateTask={(phaseKey, taskKey, patch) => updateTask(phaseKey, taskKey, patch)}
            onAddTask={addTask}
            onUpdatePhase={updatePhase}
            onAddPhase={addPhase}
            onRemovePhase={removePhase}
            onMoveTask={moveTask}
            onReorderPhases={reorderPhases}
            onSetAnchor={setAnchorFromGantt}
            closeOverride={closeOverride}
            onSetCloseOverride={setCloseOverrideFromGantt}
            onAssistPhase={
              (hasAiDetail ? canRegenerateTimeline : canGenerateTimeline)
                ? (phase) => { setAssistScopePhaseId(phase.id ?? null); setAssistOpen(true); }
                : undefined
            }
            onRegeneratePhase={
              // Rehacer una fase solo tiene sentido cuando YA hay detalle IA, y queda para quien puede
              // regenerar (cronograma.regenerate). El server además exige sin-publicar / sin-avance.
              hasAiDetail && canRegenerateTimeline
                ? (phase) => void startRegenPreview(phase)
                : undefined
            }
            onOpenTask={(pk, tk) => setSelectedTask({ phaseKey: pk, taskKey: tk })}
            kickoffDate={kickoffDate || null}
            particularidades={particularidades}
            publicadas={publicadas}
            onToggleParticularidadVisible={canEdit ? toggleParticularidadVisible : undefined}
            onEditParticularidad={canEdit ? setEditingParticularidadId : undefined}
            onAddParticularidad={canEdit ? () => setCreatingParticularidad(true) : undefined}
            proposalDeltas={structureOnlyProposal && proposalDeltas.length > 0 ? proposalDeltas : undefined}
            onResolveProposalDelta={
              canEdit
                ? (key, accept) => void resolveProposalItems(accept ? [key] : [], accept ? [] : [key])
                : undefined
            }
            sugerenciasSlot={
              // El componente se auto-oculta si no hay ninguna. Solo para quien puede editar el
              // cronograma: aprobar una sugerencia ES escribir.
              canEdit ? (
                <SugerenciasParticularidad projectId={projectId} sugerencias={sugerencias} onResolved={load} />
              ) : undefined
            }
            proposalGlobalSlot={
              structureOnlyProposal && proposalDeltas.length > 0 && magnitudPropuesta && canEdit ? (
                <ProposalGlobalStrip
                  deltas={proposalDeltas}
                  magnitud={magnitudPropuesta}
                  working={resolvingProposal}
                  onResolve={(accept, discard) => void resolveProposalItems(accept, discard)}
                />
              ) : undefined
            }
            onConvertParticularidad={canEdit ? setConvertingParticularidadId : undefined}
            onOpenConvertedTask={(taskId) => {
              // El id de la tarea no dice en qué fase vive; el drawer se abre por (phaseKey, taskKey).
              for (const p of phases) {
                const t = p.tasks.find((tk) => tk.id === taskId);
                if (t) return setSelectedTask({ phaseKey: p._key, taskKey: t._key });
              }
              toast.info("Esa tarea ya no está en el cronograma.");
            }}
            focusGroup={focusGroup}
          />
        </div>
      )}

      <TaskDetailDrawer
        open={!!drawerTask}
        task={drawerTask}
        phaseKey={selectedTask?.phaseKey ?? null}
        phaseName={selPhase?.name ?? ""}
        phaseDurationWeeks={selPhase?.durationWeeks ?? 1}
        absolutePhaseStart={selPhaseIdx >= 0 ? drawerRanges[selPhaseIdx].start : 0}
        anchor={anchor || null}
        onClose={() => setSelectedTask(null)}
        onToggleStatus={toggleStatus}
        onUpdateTask={(pk, tk, patch) => updateTask(pk, tk, patch)}
        onRemoveTask={removeTask}
        canDelete={canDelete}
        onNavigate={navigateTask}
        hasPrev={flatIdx > 0}
        hasNext={flatIdx >= 0 && flatIdx < flatTasks.length - 1}
      />

      {/* Editar una particularidad ya creada (contenido + visibilidad + fase + borrar) */}
      {(() => {
        const editing = editingParticularidadId ? particularidades.find((p) => p.id === editingParticularidadId) : null;
        if (!editing) return null;
        return (
          <ParticularidadEditModal
            particularidad={editing}
            phases={phases}
            saving={savingParticularidad}
            onSave={(patch) => void saveParticularidad(editing.id, patch)}
            onDelete={() => void deleteParticularidad(editing.id)}
            onClose={() => setEditingParticularidadId(null)}
          />
        );
      })()}

      {/* Crear un AVISO a mano: mismo formulario, sin Eliminar, arranca en "Aviso" y visible */}
      {creatingParticularidad && (
        <ParticularidadEditModal
          particularidad={null}
          phases={phases}
          saving={savingParticularidad}
          onSave={(patch) => void createParticularidad(patch)}
          onClose={() => setCreatingParticularidad(false)}
        />
      )}

      {/* "Confirmar detalle" disparado desde el panel: el CTA ejecuta en vez de mandarte a buscar
          el botón, pero hacer que las tareas por semana crucen al cliente merece un "¿seguro?". */}
      <ConfirmDialog
        open={confirmDetailOpen}
        title="Confirmar el detalle de tareas"
        description="Las tareas por semana van a cruzar al cronograma que ve el cliente. Podés seguir editándolas después."
        confirmLabel="Confirmar detalle"
        loading={confirmingDetail}
        onConfirm={async () => {
          await confirmDetail();
          setConfirmDetailOpen(false);
        }}
        onCancel={() => setConfirmDetailOpen(false)}
      />

      {/* Regen POR FASE → modal de curación viejo↔nuevo. Paso 1: loading del preview. */}
      {regenPhase && regenLoading && (
        <Modal open onClose={() => {}} size="sm" closeOnBackdrop={false} closeOnEscape={false}>
          <div className="flex items-center gap-3 py-1">
            <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-fg">Generando la propuesta para «{regenPhase.name}»…</p>
          </div>
        </Modal>
      )}
      {/* Paso 2: el modal de dos columnas (actuales vs propuesta) para definir cómo queda la fase. */}
      {regenPhase && regenPreview && (() => {
        const src = phases.find((p) => p.id === regenPhase.id);
        const current: RegenCurrentTask[] = (src?.tasks ?? [])
          .filter((t) => t.id)
          .map((t) => ({
            id: t.id as string, title: t.title, weekIndex: t.weekIndex,
            party: t.party ?? null, type: t.type ?? null, status: t.status,
            source: t.source ?? null, notes: t.notes ?? null,
          }));
        return (
          <PhaseRegenModal
            open
            phaseName={regenPhase.name}
            durationWeeks={regenPhase.durationWeeks}
            current={current}
            proposed={regenPreview}
            applying={regenApplying}
            onCancel={() => { setRegenPhase(null); setRegenPreview(null); }}
            onApply={applyPhaseRegen}
          />
        );
      })()}

      {/* Convertir un hecho en trabajo: dueño, fase y semana. Nada se aplica solo. */}
      {(() => {
        const conv = convertingParticularidadId
          ? particularidades.find((p) => p.id === convertingParticularidadId)
          : null;
        if (!conv) return null;
        return (
          <ParticularidadToTaskModal
            particularidad={conv}
            phases={ganttPhases}
            anchor={anchor || null}
            currentWeek={hydratedNow ? currentWeekIndex(anchor || null, hydratedNow) : null}
            saving={savingParticularidad}
            onConvert={(payload) => void convertParticularidad(conv.id, payload)}
            onClose={() => setConvertingParticularidadId(null)}
          />
        );
      })()}


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
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {suggestingReason ? "Analizando los cambios…" : "Sugerencia automática según los cambios — editá si querés."}
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


/**
 * Ajuste del tamaño del logo desde el cronograma.
 *
 * Acá se edita la BASE del cliente (`Client.logoScale`), no un ajuste local: el cronograma
 * no es un canvas con bloques donde guardar uno propio. El popover lo dice explícitamente
 * — cambiarlo desde acá mueve también la portada del kickoff, la propuesta y el PDF, y eso
 * tiene que estar a la vista ANTES de tocar la barra, no descubrirse después.
 */
function LogoSizePopover({
  clientId, scale, onScale, onPreview, editable, children,
}: {
  clientId: string;
  scale: number | null;
  onScale: (pct: number | null) => void;
  onPreview: (pct: number | null) => void;
  editable: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, useCallback(() => setOpen(false), []), wrapRef);

  if (!editable) return <>{children}</>;

  const guardar = (pct: number | null) => {
    onPreview(null);
    onScale(pct);
    void fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoScale: pct }),
    }).catch(() => {});
  };

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Ajustar el tamaño del logo"
        className="inline-flex cursor-pointer rounded-md p-0.5 hover:bg-surface-hover"
      >
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg"
        >
          <ScaleSlider
            value={scale}
            base={LOGO_SCALE_DEFAULT}
            min={LOGO_SCALE_MIN}
            max={LOGO_SCALE_MAX}
            step={LOGO_SCALE_STEP}
            label="Tamaño del logo"
            resetLabel="Volver al normal"
            onPreview={onPreview}
            onCommit={guardar}
          />
          <p className="mt-2 text-[11px] text-fg-muted">
            Es el tamaño del cliente: afecta también el kickoff, la propuesta y el PDF.
          </p>
        </div>
      )}
    </div>
  );
}
