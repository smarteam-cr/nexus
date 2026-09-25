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
 * cliente): POST/DELETE /timeline/confirm-detail. Regeneración: el modal de
 * curación (por fase o "Regenerar todo el cronograma") — nunca un borrado previo:
 * el apply preserva las tareas con progreso, incluso si el payload las omite.
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
import ChatDelAsistente, { ID_DEL_CAJON } from "@/components/asistente/ChatDelAsistente";
import { grupoDeParticularidad } from "@/lib/timeline/particularidad-to-task";
import { useToast } from "@/components/ui/Toast";
import { useUndo, useUndoScope } from "@/components/ui/UndoProvider";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import { useAgentRun } from "@/hooks/useAgentRun";
import CronogramaContextSection from "./CronogramaContextSection";
import TimelineGantt, { type GanttPhase, type GanttTask, type GanttTaskStatus, type GanttParticularidad, PARTY_META, PARTICULARIDAD_KIND_META, effParty } from "./TimelineGantt";
import ParticularidadEditModal, { type ParticularidadPatch } from "./ParticularidadEditModal";
import SugerenciasParticularidad, { type SugerenciaItem } from "./SugerenciasParticularidad";
import ParticularidadToTaskModal, { type ConvertPayload } from "./ParticularidadToTaskModal";
import TaskDetailDrawer from "./TaskDetailDrawer";
import TimelineAssistDialog from "./TimelineAssistDialog";
import {
  diffAssist,
  proyectarAceptados,
  type FaseActual as FaseDelAssist,
  type ItemDeAssist,
} from "@/lib/timeline/assist-items";
import { agruparItems, resumenDeConsecuencias } from "@/lib/timeline/agrupar-items";
import { aplicarOperaciones, type Operacion } from "@/lib/timeline/operaciones";
import { AcceptButton, RejectButton } from "@/components/ui/AcceptReject";
import { cn } from "@/lib/cn";
import PublishBar from "./PublishBar";
import { useMe } from "@/hooks/useMe";
import CronogramaProgressButton from "@/components/clients/CronogramaProgressButton";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { actionsFromSignals } from "@/lib/timeline/project-actions-input";
import ProjectActionsLine from "./ProjectActionsLine";
import RevisionDeLaPropuesta from "./RevisionDeLaPropuesta";
import { useBorradorDelCronograma } from "./useBorradorDelCronograma";
import LineaDeLasTareas, { type TareasEnPantalla } from "./LineaDeLasTareas";
import {
  AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA,
  AVISO_SUBIR_CON_PROPUESTA,
  CHAT_CON_EL_VACIO_FALLIDO,
  desenlaceDelSeguimiento,
  esBorradorGuardado,
  esBorradorV1,
  esperaEnCurso,
  estadoDelVacio,
  juntarObservaciones,
  leerBorrador,
  MENSAJE_PROPUESTA_ABIERTA,
  observacionesDeLaFranja,
  observacionesParaElPaso2,
  textoDelChipDeEspera,
  traeCambiosDeFases,
  versionDelBorrador,
  type EstadoDeLasTareas,
  type TareasDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";
import { origenDePropuesta } from "@/lib/timeline/proposal-deltas";
import {
  AVISO_PROPUESTA_PENDIENTE,
  CAMBIOS_DE_FASES_SIN_DECIDIR,
  pasoTrasEstructura,
  pasoTrasResolver,
  type RespuestaDeEstructura,
} from "@/lib/timeline/propuesta-de-estructura";
import ObservacionesDelPaso1 from "./ObservacionesDelPaso1";
import { targetFor, ANCHORS } from "@/lib/timeline/project-action-targets";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { PhaseRegenModal, type RegenProposedTask, type RegenCurrentTask, type FinalTask } from "./PhaseRegenModal";
import { indexarTareasPorTitulo, avisoDeRepetida } from "@/lib/timeline/tarea-repetida";
import {
  decidirRefrescoTrasHandoff,
  debeReemplazarPropuesta,
} from "@/lib/timeline/refresco-tras-handoff";
/* E2a (2026-09-25): `AllPhasesRegenModal` ya no se monta. «Regenerar todo» deja UNA propuesta con
   fases y tareas que se revisa en la barra de arriba del Gantt (el archivo se borra en E2b). */
import type { ProjectSummary } from "@/lib/portfolio/summary";
import { CronogramaSkeleton } from "@/components/clients/skeletons";
import { Spinner } from "@/components/ui";
import {
  LOGO_SCALE_DEFAULT, LOGO_SCALE_MAX, LOGO_SCALE_MIN, LOGO_SCALE_STEP,
  logoHeightCalc, logoScaleStyle, resolveLogoScale,
} from "@/lib/ui/logo-scale";
import { ScaleSlider } from "@/components/ui/ScaleSlider";
import { usePopoverDismiss } from "@/components/ui/usePopoverDismiss";
import { diasSinConfirmar } from "@/lib/timeline/avance-sin-confirmar";
import { TOPE_INSTRUCCIONES_DEL_DOC } from "@/lib/business-cases/section-briefs";

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
  /** Fases que comparten semanas con ésta (derivado del server) — el contador de sesiones
   *  cuenta las mismas reuniones en todas ellas. Solo-lectura, no viaja en el PUT. */
  solapaCon?: string[];
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
  /* Desde que el prompt del modificador vive en la tabla `Agent` (2026-08-18) emite los dos:
     antes toda tarea que creaba nacía sin dueño y sin tipo. Sin declararlos acá, el diff por
     ítem no los vería y el CSE los seguiría poniendo a mano. */
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null;
  type?: "SESSION" | "TASK" | null;
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
  /** Por qué la IA propone cambiar ESTA fase (solo la propuesta de las reuniones; interno). */
  motivo?: string | null;
}
interface Proposal {
  anchorStartDate: string | null;
  phases: ProposalPhase[];
  /** «contexto» = salió de las reuniones y notas elegidas (paso 1 de «Regenerar todo»). Sin él, del handoff. */
  origen?: "contexto";
  /** Lo que la IA notó y no se aplica solo (interno). */
  observaciones?: string[];
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
  solapaCon?: string[];
  notes: string | null;
  activityType: string | null;
  source: string;
  status: GanttTaskStatus;
  needsValidation: boolean;
  tasks: ServerTask[];
}

// D.2 — borrador de avance que propone el agente (el CSE confirma → status real).
interface PendingProgress {
  /** D-12: cuándo se generó el borrador (ISO). Ausente en los anteriores al 2026-09-04. */
  generatedAt?: string | null;
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

/* ── LAS TAREAS DE LA PROPUESTA (E2a del borrador, 2026-09-25) ───────────────────────────────
   «Regenerar todo» deja UN `borrador-v1` con fases y tareas; las tareas las arma una corrida aparte.
   Su estado («armando», «faltan», «fallo», «listas») NO se guarda: lo calcula el servidor en el GET
   del cronograma, de la corrida. Acá viaja junto con el token y la corrida del MISMO GET: así el
   estado nunca se lee contra otra propuesta, y se sabe qué corrida seguir. */
interface TareasDelBorradorEnPantalla extends TareasEnPantalla {
  /** El token (`pendingProposalRunId`) de la propuesta a la que corresponde el estado. */
  token: string | null;
  /** La corrida que arma (o armó) las tareas. */
  corrida: string | null;
}

const ESTADOS_DE_TAREAS: readonly EstadoDeLasTareas[] = ["listas", "faltan", "armando", "fallo"];
const VIVO_VACIO: Vivo = { ancla: null, fases: [] };

/** Las tareas que espera el `borrador-v1` guardado (su corrida y si ya llegaron), o null. */
function tareasDelGuardado(json: unknown): TareasDelBorrador | null {
  return esBorradorV1(json) ? (leerBorrador(json, VIVO_VACIO)?.tareas ?? null) : null;
}

/** Lo que el GET del cronograma dice de las tareas de la propuesta guardada, o null si no espera. */
function tareasDelGet(data: {
  tareasDelBorrador?: unknown;
  pendingProposal?: unknown;
  pendingProposalRunId?: unknown;
}): TareasDelBorradorEnPantalla | null {
  const t = data.tareasDelBorrador as { estado?: unknown; fase?: unknown; motivo?: unknown } | null | undefined;
  if (!t || !ESTADOS_DE_TAREAS.includes(t.estado as EstadoDeLasTareas)) return null;
  return {
    estado: t.estado as EstadoDeLasTareas,
    fase: typeof t.fase === "string" ? t.fase : null,
    motivo: typeof t.motivo === "string" ? t.motivo : null,
    token: typeof data.pendingProposalRunId === "string" ? data.pendingProposalRunId : null,
    corrida: tareasDelGuardado(data.pendingProposal)?.corrida ?? null,
  };
}

/** Un día YYYY-MM-DD de una fecha fijada a mano (ISO), o null. */
const diaFijado = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

/** Las corridas de las tareas ya anunciadas en esta pestaña (vive lo que vive el módulo). */
const CORRIDAS_ANUNCIADAS = new Set<string>();

/* E2b (2026-09-25): se fue `esPropuestaViejaDeLasReuniones` con la cadena vieja de dos pasos. Una
   propuesta de las reuniones del formato de antes se aplica o se descarta como cualquier otra. */

export default function CronogramaCanvas({
  projectId,
  clientId,
  headerSlot,
  onOcupado,
}: {
  projectId: string;
  clientId: string;
  headerSlot?: HTMLElement | null;
  /** Avisa al panel cuando el cronograma espera a la IA o aplica algo: el panel no deja cambiar de
   *  pieza en ese rato (desmontar el cronograma tiraría la propuesta que se está armando). */
  onOcupado?: (ocupado: boolean) => void;
}) {
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
  const [approvingPlan, setApprovingPlan] = useState(false);
  // Particularidades (desviaciones curadas) — el CSE ve todas; se pasan al Gantt para el resumen.
  const [particularidades, setParticularidades] = useState<GanttParticularidad[]>([]);
  // Propuestas del equipo técnico (needsValidation=true). Llegan en una lista APARTE del GET
  // justamente para que no se mezclen con las confirmadas: no suman semanas ni salen al cliente.
  const [sugerencias, setSugerencias] = useState<SugerenciaItem[]>([]);
  // Señales del proyecto para el panel "Qué hacer acá" (vienen con el GET del cronograma).
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  // Lo que el cliente lee AHORA (del snapshot congelado), distinto de lo que leerá al «Subir».
  /* ⚠ El estado y el título viajan porque la señal de «falta subir» se compara por CONTENIDO y
     no por suma de semanas: cerrar una desviación no mueve ni una semana, así que con la suma el
     cambio más nuevo del sistema era justo el invisible. Ver `lib/timeline/pendiente-de-subir.ts`. */
  const [publicadas, setPublicadas] = useState<
    Array<{ kind: string; party: string; title: string; weeksImpact: number | null; estado?: string | null }>
  >([]);
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
  /* E2a (2026-09-25): se fueron `allRegenPreview`, `allRegenModo`, `allRegenRunId`, `allRegenLoading`
     y `allRegenApplying`. El resultado de «Regenerar todo» ya no vive en la memoria de la pantalla
     (un acordeón aparte, aplicado con apply-all): queda en el servidor, en la MISMA propuesta que las
     fases, y se revisa en la barra de arriba del Gantt. */
  /* ── «REGENERAR TODO» Y «GENERAR CRONOGRAMA» (E2a del borrador, 2026-09-25) ──────────────────
     Con reuniones, notas o instrucciones elegidas, el paso 1 (POST /timeline/estructura) propone
     cambios de fases y tiempos y los guarda como UNA propuesta (`borrador-v1`); el paso 2 (/analyze)
     arma las tareas ENSEGUIDA, sobre esa estructura propuesta, y las suma a la misma propuesta. El
     CSE revisa todo junto arriba del Gantt.
     · `armando` — ESTA pantalla está pidiendo algo: el paso 1 corriendo (`paso: 1`) o el pedido del
       paso 2 en vuelo (`paso: 2`). ⛔ Ya NO bloquea el Gantt ni el cambio de pieza: el resultado queda
       en el servidor, así que la espera se dice con un chip en el encabezado y una línea arriba del
       Gantt. Después del pedido, la corrida la sigue el borrador (`tareasDelBorrador`), no esto.
     · `ofrecerTareas` — la línea suelta OFRECE armar las tareas, nunca se dispara sola: después de
       aplicar una propuesta cuyas tareas no llegaron, o de descartar el borrador vacío cuya corrida
       falló (`pasoTrasResolver`). E2b (2026-09-25) borró la cadena vieja de dos pasos
       (`pasoTareasRef`, `encadenado`, `fijarPasoTareas`) y su franja `PasoDeTareasPendiente`.
     · `observacionesPaso1` — lo que notó el paso 1 cuando no dejó propuesta (la dice la franja
       «La IA también notó» mientras no haya una propuesta en pantalla). */
  const [armando, setArmando] = useState<{ paso: 1 | 2; modo: "primera" | "regen" } | null>(null);
  /* «Paso 1 de 2 · Revisando fases y tiempos…» se dice SOLO si el CSE eligió material que la
     revisión va a leer (revisión del paso A2, segunda vuelta). Lo informa el «Contexto del
     cronograma» (`onMaterial`, con `hayMaterialParaElPaso1`). Antes lo decidía un reloj de 1,2 s, y
     sin material la ruta igual lee el cronograma, los permisos y lo elegido: en un prod lento el
     cartel salía aunque nadie eligiera nada. Sin material la línea dice algo neutro
     (`textoDeLaLineaDeTareas`, «paso-1»). */
  const [materialElegido, setMaterialElegido] = useState(false);
  const [ofrecerTareas, setOfrecerTareas] = useState(false);
  /* Lo que se resolvió antes de ofrecer las tareas traía cambios de fases. Sin ellos (el borrador vacío
     cuya corrida falló) la oferta no dice que se aplicaron fases (revisión de E2a). */
  const [ofertaConFases, setOfertaConFases] = useState(true);
  const [observacionesPaso1, setObservacionesPaso1] = useState<string[]>([]);
  /* El token del borrador vacío cuya franja «La IA también notó» cerró el CSE: lo que guardó ese
     borrador ya no se muestra (cerrar no lo borra del servidor). */
  const [franjaCerradaPara, setFranjaCerradaPara] = useState<string | null>(null);
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
  // cronograma.regenerate (default CSE, CSL y Super Admin). La PRIMERA pasada con IA pide
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
  /* El asistente que CONVERSA antes de generar. Vive acá y no en el panel del proyecto porque su
     «Aplicar» escribe sobre el cronograma que este componente tiene en memoria: un acuerdo con
     operaciones entra por `aplicarOperacionesAcordadas` (PUT directo, sin modelo ni vista previa);
     `submitAssist` solo atiende los acuerdos viejos, guardados como instrucción de texto. Desde el
     2026-09-23 el chat lee también las reuniones y notas elegidas en «Contexto del cronograma». */
  const [chatAbierto, setChatAbierto] = useState(false);
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
  /* E2a: el estado de las tareas de la propuesta guardada, del GET (lo leen `load`,
     `traerPropuestaPendiente` y `refrescarPropuesta`). null = no espera tareas. */
  const [tareasDelBorrador, setTareasDelBorrador] = useState<TareasDelBorradorEnPantalla | null>(null);
  const [assistWarnings, setAssistWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  /* Aplicando la propuesta de fases (POST /timeline/borrador/aplicar). Bloquea como `applying`: el
     Gantt no puede cambiar mientras el servidor compara lo vivo con lo que viste. */
  const [aplicandoBorrador, setAplicandoBorrador] = useState(false);
  /* Descartando la propuesta (DELETE /timeline/proposal). Sin esto, mientras corría el DELETE los dos
     botones seguían vivos: un doble clic mandaba dos DELETE (el segundo, 409 «otra propuesta») y un
     «Aplicar» caía en PROPUESTA_CAMBIO. El ref frena la re-entrada; el estado apaga los botones. */
  const [descartando, setDescartando] = useState(false);
  const descartandoRef = useRef(false);
  // #4 — razón del cambio (TimelineChange/audit). Con el auto-guardado ya NO se pide
  // tipeada: las ediciones manuales usan una razón automática y la IA usa su instrucción.
  const [assistInstruction, setAssistInstruction] = useState("");
  /* ── RESOLUCIÓN POR ÍTEM DE LA PROPUESTA DEL MODIFICADOR ────────────────────────────────
     Se guarda lo DESCARTADO, no lo aceptado: con el conjunto vacío «Aplicar» hace exactamente
     lo que hacía antes de esta tanda —el reemplazo completo— y el CSE tiene que sacar algo a
     propósito para que cambie. Guardar lo aceptado invertiría ese default sin que nadie lo pida
     y convertiría cada propuesta en un formulario obligatorio. */
  const [assistDescartados, setAssistDescartados] = useState<Set<string>>(new Set());
  const [assistRevision, setAssistRevision] = useState(false);
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
  /**
   * ⭐ CUÁNDO EL CRONOGRAMA ESTÁ OCUPADO — UNA SOLA FUENTE, Y ES LO QUE FALTABA.
   *
   * La primera versión del velo solo miraba `applying`, así que durante la GENERACIÓN de tareas
   * —que es la espera larga, la de verdad— la pantalla quedaba viva y editable. Elías lo probó y
   * lo dijo así: *«di clic en el cronograma mientras cargaba y como que se desbloqueó»*. No se
   * desbloqueó: nunca había estado bloqueado.
   *
   * Cada estado trae su rótulo porque las esperas no duran lo mismo: aplicar son ~1 ms más el
   * viaje; generar las tareas es un agente y tarda. Un cartel genérico haría que las dos se lean
   * igual, y enseña a ignorar el que sí avisa una espera real.
   */
  const ocupado: { activo: boolean; rotulo: string; detalle: string } = assisting
    ? {
        /* ⛔ LA ESPERA MÁS LARGA ERA LA ÚNICA QUE NO BLOQUEABA, y va primera por eso.
           `assisting` es el modificador viejo —el que reescribe el cronograma entero— y tarda
           MINUTOS, no milisegundos. Sin él acá, el Gantt quedaba editable durante toda la corrida
           y el autosave corre igual (`proposal` todavía es null), así que lo que el CSE tipeara
           en el medio lo pisaba después una propuesta calculada contra la foto ANTERIOR. */
        activo: true,
        rotulo: "Reescribiendo el cronograma con IA",
        detalle: "Suele tardar entre dos y cuatro minutos.",
      }
    : /* ⛔ «Regenerar todo» y «Generar cronograma» YA NO van acá (E2a, 2026-09-25). Bloqueaban porque
         su resultado vivía solo en la memoria de la pantalla (cambiar de pieza lo tiraba, y lo que el
         CSE tipeara en el medio lo pisaba el acordeón). Ahora queda en el servidor, en la propuesta:
         lo editado después de la propuesta CHOCA y queda fuera (el núcleo del borrador), y la espera
         la dicen el chip del encabezado y la línea de arriba del Gantt (`armando`). */
      regenLoading && regenPhase
        ? /* «Regenerar» de UNA fase: su espera también va en la franja, no en una ventana encima
             (2026-09-24). Antes era un modal propio; bloqueaba igual, pero tapaba el cronograma. */
          {
            activo: true,
            rotulo: `Generando la propuesta para «${regenPhase.name}»`,
            detalle: "El agente está revisando esa fase.",
          }
        : chainingProgress
          ? { activo: true, rotulo: "Re-evaluando el avance", detalle: "Con el cronograma nuevo." }
          : applying
            ? {
                activo: true,
                rotulo: "Aplicando el cambio",
                detalle: "El cronograma se está actualizando.",
              }
            : aplicandoBorrador
            ? {
                activo: true,
                rotulo: "Aplicando la propuesta",
                detalle: "El cronograma se está actualizando.",
              }
            : applyingProgress
              ? {
                  activo: true,
                  rotulo: "Aplicando el avance",
                  detalle: "Marcando lo que se confirmó.",
                }
              : applyingPartic
                ? {
                    activo: true,
                    rotulo: "Aplicando las desviaciones",
                    detalle: "Un momento.",
                  }
              : { activo: false, rotulo: "", detalle: "" };

  /**
   * ⛔ EL HEADER TAMBIÉN, y es LA fuga que hacía parecer que no bloqueaba.
   *
   * Los botones del cronograma («Generar cronograma», «Pedir cambio con IA», «Regenerar todo»…)
   * se inyectan en el header del panel POR PORTAL, así que viven en otro nodo del DOM: ni el velo
   * los tapa ni el `inert` del contenido los alcanza. Durante la generación seguían clickeables —
   * que es exactamente lo que Elías vio cuando dijo que «como que se desbloqueó».
   *
   * Se marca inerte el SLOT entero y no botón por botón a propósito: el que se agregue mañana
   * queda cubierto sin que nadie se acuerde. El chat sigue usable igual — su panel se portaliza a
   * `body`, no acá.
   */
  useEffect(() => {
    if (!headerSlot) return;
    headerSlot.inert = ocupado.activo;
    return () => {
      headerSlot.inert = false;
    };
  }, [headerSlot, ocupado.activo]);

  /**
   * ⛔ Y NO SE SALE DEL CRONOGRAMA A MITAD DE UNA ESPERA (2026-09-24). Hasta que el aviso pasó a
   * vivir en el cronograma (Elías: «que no esté en un modal o pop-up»), las esperas de «Regenerar
   * todo» y de «Regenerar» una fase eran una ventana que tapaba la página entera. Sin ella, cambiar
   * de pieza o cerrar la pestaña desmonta el cronograma y la propuesta que se estaba armando —ya
   * pagada— se pierde: la vista previa no se guarda en ningún lado. El panel desactiva el selector
   * de piezas (`onOcupado`) y el navegador pregunta antes de cerrar o recargar.
   */
  useEffect(() => {
    onOcupado?.(ocupado.activo);
    if (!ocupado.activo) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => {
      window.removeEventListener("beforeunload", alSalir);
      onOcupado?.(false);
    };
  }, [ocupado.activo, onOcupado]);

  /**
   * El foco entra al cartel de bloqueo y vuelve de donde vino.
   *
   * Sin esto, apretar un botón que enciende el bloqueo lo vuelve inerte con el foco adentro: el
   * navegador lo desenfoca y el foco cae a `body`. Quien navega con teclado termina al principio
   * del documento, sin saber que algo está corriendo.
   */
  const carteldeBloqueoRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ocupado.activo) return;
    const previo = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => carteldeBloqueoRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      previo?.focus?.();
    };
  }, [ocupado.activo]);

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
              /* ⚠ `source` y `status` VIAJAN CON EL ID, y no es cosmético: el servidor acaba
                 de crear esta fila —`source: HUMAN`— y sin adoptarlos el estado local se queda
                 con los campos vacíos. El chat evalúa `isKept` sobre ese estado local, así que
                 una tarea protegida se le vería borrable: vuelve el borrado silencioso que
                 `tarea.borrar` acaba de cerrar, por la puerta de al lado. */
              return t.id
                ? t
                : {
                    ...t,
                    id: st.id,
                    _key: st.id,
                    source: st.source ?? t.source,
                    status: st.status ?? t.status,
                  };
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
      solapaCon: p.solapaCon,
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
        setPublicadas(
          (data.publicadas as Array<{
            kind: string; party: string; title: string; weeksImpact: number | null; estado?: string | null;
          }>) ?? [],
        );
        setLastEditedAt(data.lastEditedByHuman ?? null);
        // Propuesta de re-generación del agente (re-run con cronograma ya existente):
        // se muestra como vista previa aplicable, reusando el mismo banner que el assist.
        // No pisa una propuesta de assist en curso (prev tiene prioridad).
        setProposal((prev) => {
          if (prev) return prev;
          proposalMeta.current = { deAssist: false, runId: data.pendingProposalRunId ?? null };
          return data.pendingProposal ? (data.pendingProposal as Proposal) : null;
        });
        /* El estado de las tareas de la GUARDADA, con su token: si en pantalla queda otra (la de arriba
           no se reemplaza), la pantalla no lo usa (`tareasEnPantalla` compara el token). */
        setTareasDelBorrador(tareasDelGet(data));
        /* E2b (2026-09-25): `load` ya no ofrece las tareas. Lo hacía la cadena vieja de dos pasos
           cuando su propuesta desaparecía sin pasar por esta pantalla; se fue con ella. Ofrecer lo
           deciden solo aplicar y descartar (`pasoTrasResolver`), con lo que se resolvió enfrente. */
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
        setTareasDelBorrador(null);
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

  /* De DÓNDE salió la propuesta que está en pantalla. Viaja en un ref y no en estado porque solo
     se lee dentro de callbacks async: no pinta nada, y como estado obligaría a meterlo en las deps
     de `load` —que tiene `[projectId]`— para no leerlo viejo.
     Hace falta porque `proposal` es UN estado compartido por dos orígenes muy distintos: la del
     assist vive solo en memoria (pisarla la destruye) y la del handoff está persistida. */
  const proposalMeta = useRef<{ deAssist: boolean; runId: string | null }>({
    deAssist: false,
    runId: null,
  });

  /**
   * Trae SOLO la propuesta del servidor, sin tocar nada más del cronograma.
   *
   * ⛔ Deliberadamente NO es `load()`. Cuando el handoff deja una propuesta sobre un cronograma que
   * ya tiene fases, el servidor no tocó las fases: recargar entero pisaría `phases`, apagaría
   * `dirty` (y con él el autosave pendiente), resetearía `particularidadesDirty` y las selecciones
   * del banner de avance — sobre un cronograma que el CSE puede estar editando en ese momento.
   * Es un refresco OPORTUNISTA: si falla, se calla. El CSE no lo pidió y el cartel del widget
   * sigue avisando que hay algo para revisar.
   */
  const refrescarPropuesta = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      if (!res.ok) return;
      const data = await res.json();
      const nueva = data.pendingProposal ? (data.pendingProposal as Proposal) : null;
      const runIdNuevo = (data.pendingProposalRunId as string | null) ?? null;
      setProposal((prev) => {
        const reemplaza = debeReemplazarPropuesta({
          hayPropuesta: !!prev,
          esDeAssist: proposalMeta.current.deAssist,
          runIdEnPantalla: proposalMeta.current.runId,
          runIdNuevo,
        });
        if (!reemplaza) return prev;
        proposalMeta.current = { deAssist: false, runId: runIdNuevo };
        return nueva;
      });
      setTareasDelBorrador(tareasDelGet(data));
    } catch {
      /* refresco oportunista: el cartel del widget ya avisa que hay algo sin revisar */
    }
  }, [projectId]);

  /**
   * Trae la propuesta GUARDADA y la pone en pantalla, reemplazando la que haya: la llaman quienes
   * saben que la del servidor cambió (el 409 del paso 1, o el de aplicar la propuesta cuando la que
   * se estaba revisando ya no es la guardada). Devuelve la propuesta (null = no hay ninguna) y el
   * estado de sus tareas; `ok: false` si el GET falló, que NO es lo mismo que «no hay propuesta»
   * (revisión de E2a: el seguimiento de la corrida avisaba «no propone cambios» por un 5xx, y la
   * pantalla quedaba «armando» sin volver a mirar).
   * `soloLeer`: lee la guardada SIN ponerla en pantalla. Lo usa el seguimiento con la vista previa del
   * modificador abierta: pisarla tiraría el resultado de la IA, y sin leer nada el aviso de las tareas
   * se perdía (cierre de la revisión de E2a).
   */
  const traerPropuestaPendiente = async (opts?: { soloLeer?: boolean }): Promise<
    { ok: true; propuesta: Proposal | null; tareas: TareasDelBorradorEnPantalla | null } | { ok: false }
  > => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      if (!res.ok) return { ok: false };
      const data = await res.json();
      const nueva = data.pendingProposal ? (data.pendingProposal as Proposal) : null;
      if (!opts?.soloLeer) {
        proposalMeta.current = { deAssist: false, runId: (data.pendingProposalRunId as string | null) ?? null };
        setProposal(nueva);
        setTareasDelBorrador(tareasDelGet(data));
        bumpGpsRefresh();
      }
      return { ok: true, propuesta: nueva, tareas: tareasDelGet(data) };
    } catch {
      return { ok: false };
    }
  };

  /**
   * El PUT con motivo respondió 409 PROPUESTA_ABIERTA: hay una propuesta de fases GUARDADA que esta
   * pantalla no tiene enfrente (entró mientras la IA trabajaba —«Pedir cambio con IA» tarda
   * minutos— o desde otra pantalla). El texto del servidor dice «arriba del Gantt», y sin esto no
   * había ninguna barra: un callejón sin salida. Devuelve el mensaje para el CSE.
   *  · Con la vista previa del modificador en pantalla NO se trae: pisarla tiraría el resultado de
   *    la IA sin preguntar. Se dice qué hacer, y descartarla trae la guardada (`discardProposal`).
   *  · Si no, se trae la guardada: su barra aparece arriba del Gantt, como dice el mensaje.
   */
  const anteLaPropuestaGuardada = async (): Promise<string> => {
    if (proposalMeta.current.deAssist) return AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA;
    await traerPropuestaPendiente();
    return MENSAJE_PROPUESTA_ABIERTA;
  };

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

  /* Generar el handoff toca el cronograma, y el handoff bumpea `timelineRefreshSignal`.
     ⛔ Este efecto SOLO decide; el criterio vive en `decidirRefrescoTrasHandoff` porque los tests
     de este repo corren sin DOM y adentro del componente no se puede probar.

     La versión anterior era `if (phases.length === 0 && !loading) void load();` — pensada para el
     caso «el handoff CREA las fases», y correcta en no pisar un cronograma con ediciones. Pero
     dejaba mudo justo el caso opuesto: cuando ya hay fases, el servidor NO las toca, solo escribe
     `pendingProposal`. O sea que el caso que produce una propuesta era el caso que no hacía nada,
     y el CSE veía el cartel «hay una propuesta sin revisar» con el canvas vacío de sugerencias
     hasta recargar a mano.
     Con fases, ahora se trae SOLO la propuesta: las fases en pantalla siguen siendo correctas y
     ese camino no escribe nada editable (ver el docblock del módulo). */
  const lastTimelineSignal = useRef(timelineRefreshSignal);
  useEffect(() => {
    if (timelineRefreshSignal === lastTimelineSignal.current) return;
    const decision = decidirRefrescoTrasHandoff({ hayFases: phases.length > 0, cargando: loading });
    /* ⚠ La señal se consume solo si se actuó. Antes el ref avanzaba ANTES de evaluar la condición,
       así que una señal descartada se perdía para siempre; con `loading` en las deps, el caso
       «esperar» se reintenta solo cuando la carga en vuelo termina. */
    if (decision === "esperar") return;
    lastTimelineSignal.current = timelineRefreshSignal;
    if (decision === "recargar-todo") void load();
    else void refrescarPropuesta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineRefreshSignal, phases.length, loading]);

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
  /**
   * «Aprobar el plan»: congela la FOTO contra la que se mide el alcance, SIN mostrarle nada al
   * cliente. Hasta que existió este botón la foto solo se tomaba al publicar, y por eso 14 de 132
   * proyectos activos la tenían — el alcance excedido era inmedible en 9 de cada 10.
   *
   * ⚠ A diferencia de publicar, acá un fallo del congelado es un ERROR de verdad: si no congeló,
   * no aprobó. El endpoint responde 502 y esto lo muestra tal cual en vez de celebrar.
   */
  const approvePlan = async () => {
    setApprovingPlan(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/approve`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "No se pudo aprobar el plan.");
        toast.error(d?.error ?? "No se pudo aprobar el plan.");
        return;
      }
      /* `created:false` = el plan es idéntico al ya congelado. No es un error ni una versión
         nueva: decirlo distinto evita que alguien crea que quedó una foto que no se tomó. */
      toast.success(
        d?.created
          ? `Plan aprobado — quedó congelado como versión ${d.version}.`
          : "Este plan ya estaba aprobado: no cambió nada desde la última foto.",
      );
    } catch {
      setError("Error de conexión al aprobar el plan.");
      toast.error("Error de conexión al aprobar el plan.");
    } finally {
      setApprovingPlan(false);
    }
  };

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
  /* ⛔ UN SOLO GUARDADO EN VUELO, Y SE PUEDE ESPERAR (revisión adversarial, 2026-09-24). El paso 1
     de «Regenerar todo» lee las fases de la BASE: si arrancaba con un autoguardado en vuelo (el
     `saving` de su closure no lo veía), leía la foto de ANTES y su propuesta traía de vuelta lo que
     el CSE acababa de cambiar. La promesa se fija ANTES del primer await: un segundo llamado (el
     timer, o el paso 1) espera la MISMA en vez de mandar otro PUT con la misma foto y sin los ids
     que el primero acaba de crear. */
  const guardadoEnVueloRef = useRef<Promise<void> | null>(null);
  const autoSave = (): Promise<void> => {
    if (guardadoEnVueloRef.current) return guardadoEnVueloRef.current;
    if (validateLocal() !== null) return Promise.resolve();
    const enVuelo = guardarAhora().finally(() => {
      guardadoEnVueloRef.current = null;
    });
    guardadoEnVueloRef.current = enVuelo;
    return enVuelo;
  };
  const guardarAhora = async () => {
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

  // ── LA PROPUESTA DE FASES GUARDADA (el borrador) vs la propuesta del MODIFICADOR ──────────────
  // El handoff y el paso 1 de «Regenerar todo» guardan una propuesta SIN `tasks` (o, desde el
  // formato nuevo, un `borrador-v1`): se revisa en la barra de arriba del Gantt, con un solo botón
  // que alterna «Ver como estaba antes» ↔ «Ver la propuesta», y el cronograma actual sigue
  // editable. La del modificador («Pedir cambio con IA») trae tareas, vive solo en memoria y sigue
  // con su banner y su vista previa de siempre.
  const hayBorrador = !!proposal && esBorradorGuardado(proposal);
  /* El cronograma de la pantalla en la forma del núcleo del borrador: solo lo GUARDADO (una fase
     o una tarea sin id todavía no existe para la base). Memoizado: de él cuelgan la lista, los
     choques y la vista de la propuesta.
     E2a: con sus TAREAS, con lo mismo que viaja en el cable. Las fechas fijadas a mano entran en la
     foto de la tarea: una tarea que se va y que alguien fijó después de la propuesta choca, no se
     borra (lib/timeline/borrador.ts, CHOQUE_TAREA_EDITADA). */
  const vivo: Vivo = useMemo(
    () => ({
      ancla: anchor || null,
      fases: phases
        .filter((p): p is Phase & { id: string } => !!p.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          durationWeeks: p.durationWeeks,
          startWeek: p.startWeek ?? null,
          sessionCount: p.sessionCount ?? null,
          notes: p.notes ?? null,
          activityType: p.activityType ?? null,
          tareas: p.tasks
            .filter((t): t is TaskDraft & { id: string } => !!t.id)
            .map((t) => ({
              id: t.id,
              title: t.title,
              weekIndex: t.weekIndex,
              notes: t.notes ?? null,
              party: t.party ?? null,
              type: t.type ?? null,
              status: t.status,
              source: t.source ?? "AGENT",
              inicioFijado: diaFijado(t.startDateOverride),
              finFijado: diaFijado(t.dueDateOverride),
              needsValidation: t.needsValidation,
            })),
        })),
    }),
    [phases, anchor],
  );
  /* El estado de las tareas solo vale para la propuesta que está EN PANTALLA (mismo token): `load`
     no reemplaza la de la pantalla, y el GET pudo traer el de otra. */
  const tareasEnPantalla: TareasDelBorradorEnPantalla | null =
    hayBorrador && tareasDelBorrador && tareasDelBorrador.token === proposalMeta.current.runId ? tareasDelBorrador : null;
  /* E2a P6: mientras ESTA pantalla pide las tareas de la propuesta en pantalla (el pedido del paso 2
     en vuelo), sus tareas ya se están pidiendo: se ven y se tratan como «armando» aunque el servidor
     todavía diga «faltan» o «fallo». Sin esto, en ese segundo la barra ofrecía «Armar las tareas»
     (una segunda corrida) y dejaba aplicar solo las fases de una propuesta cuyas tareas ya venían. */
  const estadoDeLasTareasEnPantalla: EstadoDeLasTareas | null =
    tareasEnPantalla && armando !== null && (tareasEnPantalla.estado === "faltan" || tareasEnPantalla.estado === "fallo")
      ? "armando"
      : (tareasEnPantalla?.estado ?? null);
  /* Lo que muestra la franja «La IA también notó»: lo del paso 1 de esta pantalla JUNTO con lo que
     guardó el borrador vacío en pantalla. Cierre de la revisión de E2a: vivía solo en `useState`, y
     al recargar con el vacío «armando» no se veía en ningún lado. */
  const observacionesDeLaFranjaEnPantalla = observacionesDeLaFranja({
    delPaso1: observacionesPaso1,
    guardado: hayBorrador ? proposal : null,
    cerradaLaDelGuardado: franjaCerradaPara !== null && franjaCerradaPara === proposalMeta.current.runId,
  });
  /* La foto, lo desmarcado, la vista y el lugar del scroll viven en el hook; lo que decide, en
     lib/timeline/borrador.ts. La identidad de la propuesta es su token (la corrida) + su contenido:
     con ella el hook RECUERDA la foto entre montajes (cambiar de canvas, «Chequear avance», recargar),
     y una propuesta distinta con el mismo contenido no hereda la foto de la anterior.
     ⚠ El token se lee de `proposalMeta` en el render a propósito: TODO `setProposal` que pone una
     propuesta escribe `proposalMeta` antes (o en su mismo updater), así que el render que la muestra
     ya ve su token. La guarda de revision-de-la-propuesta.test.ts cuida esa invariante. */
  const revision = useBorradorDelCronograma({
    projectId,
    propuesta: hayBorrador ? proposal : null,
    token: hayBorrador ? proposalMeta.current.runId : null,
    vivo,
    tareas: estadoDeLasTareasEnPantalla,
  });
  /* Solo quien edita ve la vista de la propuesta: la barra que la explica (y la alterna) es suya. Quien
     solo mira ve el cronograma actual, que es el que rige hasta que alguien aplique. */
  const verPropuesta = canEdit && hayBorrador && !!revision.proyeccion && revision.vista === "propuesta";
  /* Lo ÚLTIMO de la revisión, para leerlo desde el aplicar (async): la closure del clic tiene la
     del render en que se apretó, y esperar el guardado puede mover lo vivo. */
  const revisionRef = useRef(revision);
  useEffect(() => {
    revisionRef.current = revision;
  });
  /* Las fases actuales CON sus tareas — el diff del modificador es a nivel tarea. */
  const fasesActualesDelAssist: FaseDelAssist[] = useMemo(
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
          tasks: p.tasks
            .filter((t): t is TaskDraft & { id: string } => !!t.id)
            .map((t) => ({
              id: t.id,
              title: t.title,
              weekIndex: t.weekIndex,
              notes: t.notes ?? null,
              party: t.party ?? null,
              type: t.type ?? null,
              status: t.status,
              source: t.source,
            })),
        })),
    [phases],
  );
  const assistItems: ItemDeAssist[] = useMemo(
    () =>
      proposal && !hayBorrador
        ? diffAssist(fasesActualesDelAssist, proposal, anchor || null)
        : [],
    [proposal, hayBorrador, fasesActualesDelAssist, anchor],
  );
  /* ⭐ Agrupada por FASE y partida en decisiones/consecuencias. La lista plana de veinte barras
     iguales enterraba lo que hay que revisar (una fase que se va con sus 7 tareas) debajo de
     dieciocho corrimientos de semana, que son la aritmética de esa decisión y no una elección.
     Reportado por Elías el 2026-08-20 mirando la fusión de dos fases de Wherex. */
  const gruposDeAssist = useMemo(() => agruparItems(assistItems), [assistItems]);

  const assistDescartadosVivos = useMemo(
    () => assistItems.filter((i) => assistDescartados.has(i.key)).length,
    [assistItems, assistDescartados],
  );

  // Debounce: auto-guarda ~1.5 s después de la última edición. Se reinicia con cada
  // cambio (phases/anchor). No corre con propuesta del ASSIST abierta (el Gantt muestra la
  // preview, no lo editable), mientras guarda, con el cronograma inválido, ni si el último
  // intento falló. Con una propuesta de fases guardada SÍ corre: en «Ver como estaba antes» el
  // cronograma actual sigue editable (el PUT de autosave nunca borra la propuesta, y lo que choque
  // con ella lo excluye la revisión — ver lib/timeline/borrador.ts).
  useEffect(() => {
    if (!dirty || (proposal && !hayBorrador) || saving || !canEdit) return; // el CSE no autosalva (no edita)
    if (validateLocal() !== null) return;
    if (editSeq.current === lastFailedSeqRef.current) return;
    const t = setTimeout(() => { void autoSave(); }, 1500);
    return () => clearTimeout(t);
    /* ⛔ `closeOverride` VA EN LAS DEPS, y su ausencia perdía el dato en silencio.
       El `setTimeout` congela la closure del render en que se armó, y `autoSave` lee de ahí. Si
       `dirty` YA era true (por ejemplo, se tecleó la duración de una fase) y dentro de los 1,5 s
       se fija el cierre en el picker, el efecto no vuelve a correr: el timer viejo dispara con
       `closeDateOverride: null`, y como la respuesta entra por la rama de adopción, el picker se
       VACÍA en pantalla y `dirty` queda en false — nada lo reintenta.
       `anchor` está listado desde siempre por exactamente la misma razón.

       ⚠ Y la directiva de abajo va PEGADA a las deps: si se le mete un comentario en el medio
       deja de proteger la línea siguiente, la regla vuelve a quejarse y la directiva queda
       marcada como inútil. Pasó justo al escribir este comentario. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, phases, anchor, closeOverride, proposal, saving]);

  /* Lo ÚLTIMO de la pantalla, para esperar el guardado desde un callback async: el `dirty` y el
     `autoSave` de su closure son los del render en que se apretó el botón (y ese `autoSave`
     mandaría la foto de entonces, sin los ids que el guardado en vuelo acaba de crear). */
  const ultimoParaGuardarRef = useRef<{ dirty: boolean; autoSave: () => Promise<void>; invalido: string | null }>({
    dirty: false,
    autoSave: () => Promise.resolve(),
    invalido: null,
  });
  useEffect(() => {
    ultimoParaGuardarRef.current = { dirty, autoSave, invalido: validateLocal() };
  });
  /**
   * ⭐ ESPERA A QUE LO EDITADO QUEDE EN LA BASE antes de que el paso 1 la lea (revisión adversarial,
   * 2026-09-24): el guardado en vuelo, y si después sigue quedando algo sin mandar, uno más con el
   * estado de ESTE momento. null = guardado; si no, por qué no se pudo (el paso 1 no arranca: leería
   * una foto que no es la que el CSE tiene enfrente).
   */
  const esperarQueSeGuarde = async (): Promise<string | null> => {
    const unRespiro = () => new Promise<void>((r) => window.setTimeout(r, 60));
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const enVuelo = guardadoEnVueloRef.current;
      if (enVuelo) {
        await enVuelo;
        await unRespiro(); // que la pantalla adopte lo que devolvió el guardado
        continue;
      }
      const ultimo = ultimoParaGuardarRef.current;
      if (!ultimo.dirty) return null;
      if (ultimo.invalido) return ultimo.invalido;
      if (editSeq.current === lastFailedSeqRef.current) break;
      await ultimo.autoSave();
      await unRespiro();
    }
    return ultimoParaGuardarRef.current.dirty
      ? "No se pudo guardar lo último que cambiaste en el cronograma: revísalo y vuelve a intentar."
      : null;
  };

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


  /* ── Proponer el detalle del cronograma (tareas por semana) ─────────────────────
     ⛔ Las DOS puertas —la primera generación y «Regenerar todo el cronograma»— piden lo mismo:
     una PROPUESTA que el CSE cura antes de que se escriba una sola fila. Hasta el 2026-08-16 la
     primera escribía DIRECTO: era la única del cronograma que entraba sin que nadie la mirara, y
     justo la que más tareas crea. Ahora las dos terminan en la misma propuesta, y el servidor ya
     no tiene una rama que persista sin curar.

     ⭐ UNA SOLA PROPUESTA, SIN ESPERAR AL CSE ENTRE LOS PASOS (E2a del borrador, 2026-09-25).
     Paso 1: POST /timeline/estructura revisa si las reuniones, notas e instrucciones elegidas cambian
     FASES o TIEMPOS; si propone algo, lo guarda como `borrador-v1` y devuelve su token. Paso 2:
     POST /analyze con `borrador: { token, version }` (detached) arma las tareas sobre la estructura
     PROPUESTA y las suma a ESA propuesta; sin token (sin material, sin cambios, o si el paso 1
     falló) crea la suya. La pantalla no espera la corrida: trae la propuesta «armando» y desde ahí la
     sigue el borrador (su línea y `useAgentRun`). Hasta E2a el paso 2 esperaba a que el CSE
     decidiera las fases, y su resultado vivía solo en memoria (un acordeón aparte).
     ⛔ La continuación (`saltarEstructura`: «Armar las tareas», «Volver a intentar», la línea que
     las ofrece) SIEMPRE salta el paso 1: si no, re-propondría fases en bucle. Y una falla del paso 1
     nunca traba al CSE: sigue con las tareas. */
  const pedirPropuestaDeDetalle = async (
    modo: "primera" | "regen",
    opts?: { saltarEstructura?: boolean },
  ) => {
    await flushDocBrief();
    setOfrecerTareas(false);
    /* La propuesta a la que el paso 2 le suma sus tareas: su token y la versión que se VE (si el
       servidor la reescribió en el medio, no marca nada y responde 409). null = ninguna: el paso 2
       crea la suya, y solo si no hay otra guardada. */
    let token: string | null = null;
    let version: number | null = null;
    /* Lo que notó el paso 1 sin proponer: viaja en el pedido con token null y nace dentro del borrador
       vacío (así la barra lo muestra y sobrevive a recargar o a descartar). Revisión de E2a. */
    let observacionesDelPaso1: string[] = [];
    if (opts?.saltarEstructura) {
      /* «Armar las tareas» / «Volver a intentar»: sobre la propuesta de la pantalla, cuyas tareas
         faltan o fallaron. Sin un `borrador-v1` en pantalla (la línea que las ofrece después de
         aplicar o descartar), sobre ninguna. */
      if (!proposalMeta.current.deAssist && esBorradorV1(proposal)) {
        token = proposalMeta.current.runId;
        version = versionDelBorrador(proposal);
      }
      /* Sin propuesta en pantalla (después de descartar el vacío que falló, o de aplicar una sin sus
         tareas): lo que muestra la franja viaja y nace dentro del borrador nuevo. Cierre de la revisión
         de E2a: la oferta de armarlas lo dejaba afuera, y al recargar se perdía. */
      if (token === null) observacionesDelPaso1 = observacionesParaElPaso2(observacionesDeLaFranjaEnPantalla);
    } else {
      /* ⛔ UN BORRADOR POR PROYECTO: con una propuesta sin decidir (del handoff, o de otro «Regenerar
         todo»), primero esa. Pedir otra daría 409, y las tareas se armarían sobre fases que el CSE
         todavía no aceptó ni descartó. E2b: el aviso es siempre el mismo, y nada sigue solo al
         decidirla (se fue la cadena vieja). */
      if (hayBorrador) {
        document.getElementById("cronograma-propuesta")?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast.info(AVISO_PROPUESTA_PENDIENTE);
        return;
      }
      /* El paso 1 lee la BASE: primero tiene que estar ahí lo que el CSE editó, también lo que un
         autoguardado EN VUELO todavía está mandando (antes solo se miraba `dirty && !saving`, y
         con un PUT en curso la ruta leía la foto de antes: la propuesta revertía lo recién
         cambiado). Si no se puede guardar, el paso 1 no arranca. */
      const sinGuardar = await esperarQueSeGuarde();
      if (sinGuardar) {
        toast.error(sinGuardar);
        return;
      }
      setObservacionesPaso1([]);
      setArmando({ paso: 1, modo });
      let respuesta: RespuestaDeEstructura;
      let estructura: { proposal?: unknown; runId?: unknown; observaciones?: unknown } = {};
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline/estructura`, { method: "POST" });
        const d = await res.json().catch(() => ({}));
        estructura = d ?? {};
        respuesta = {
          status: res.status,
          estado: d?.estado,
          message: d?.message,
          acordadoSinEntrar: d?.acordadoSinEntrar,
          runId: d?.runId,
          error: d?.error,
        };
      } catch {
        respuesta = { red: true };
      }
      const paso = pasoTrasEstructura(respuesta);
      if (paso.paso === "detener") {
        // Sin permiso, o el paso 1 ya corre para este proyecto (otra pestaña u otra persona).
        setArmando(null);
        toast.error(paso.mensaje);
        return;
      }
      if (paso.paso === "decidir") {
        /* 409: YA hay una propuesta sin decidir (del handoff, o de una revisión que se pidió en otra
           pestaña o la pidió otra persona). ⛔ NO se arma el detalle —la corrida más cara del
           cronograma— sobre fases que nadie decidió (revisión adversarial, 2026-09-24): se trae esa
           propuesta a la pantalla y se dice que primero se decide. E2b: nada sigue solo al decidirla. */
        await traerPropuestaPendiente();
        setArmando(null);
        toast.info(AVISO_PROPUESTA_PENDIENTE);
        window.setTimeout(
          () => document.getElementById("cronograma-propuesta")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          150,
        );
        return;
      }
      if (paso.token) {
        /* La propuesta de fases ya está GUARDADA (recargar no la pierde): se muestra enseguida, con
           sus tareas «faltan», y el paso 2 se las suma sin esperar al CSE. Versión 0: la que acaba de
           escribir el paso 1. */
        token = paso.token;
        version = 0;
        proposalMeta.current = { deAssist: false, runId: paso.token };
        setProposal(estructura.proposal as Proposal);
        setTareasDelBorrador({ estado: "faltan", fase: null, motivo: null, token: paso.token, corrida: null });
        bumpGpsRefresh();
        window.setTimeout(
          () => document.getElementById("cronograma-propuesta")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          150,
        );
      } else {
        observacionesDelPaso1 = observacionesParaElPaso2(estructura.observaciones);
        setObservacionesPaso1(observacionesDelPaso1);
      }
      if (paso.aviso) toast.info(paso.aviso);
    }
    /* ── PASO 2: las tareas, DETACHED y sobre la propuesta. La respuesta vuelve apenas la corrida
       arranca y el borrador queda «armando»: desde ahí lo sigue el borrador (la línea de arriba del
       Gantt y `useAgentRun`), no esta función. */
    setArmando({ paso: 2, modo });
    if (modo === "primera") maybeRequestPermission();
    setError(null);
    try {
      const label = modo === "primera" ? "Detalle de cronograma" : "Regenerar cronograma completo";
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: 1, step: 0, stepLabel: label, sectionLabel: label,
          agentId: "agent-timeline-detail", projectId,
          async: true,
          borrador: { token, version, observaciones: token === null ? observacionesDelPaso1 : undefined },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // La propuesta quedó «armando», con su corrida: se trae, y el seguimiento la toma.
        if (!proposalMeta.current.deAssist) await traerPropuestaPendiente();
      } else if (res.status === 409) {
        /* La propuesta cambió en el medio (se aplicó, se descartó, entró otra, o ya se están armando
           sus tareas): no se lanzó ninguna corrida. Se trae la que está y se dice por qué. */
        if (!proposalMeta.current.deAssist) await traerPropuestaPendiente();
        toast.info(data?.message ?? data?.error ?? AVISO_PROPUESTA_PENDIENTE);
      } else {
        const msg = data?.message ?? data?.error ?? "No se pudo armar la propuesta de tareas.";
        /* Sin aviso del sistema acá (E2a): la corrida la anuncia el centro de corridas, y el aviso
           del cronograma sale solo del seguimiento de la corrida de las tareas (un solo aviso). */
        if (modo === "primera") setError(msg);
        else toast.error(msg);
      }
    } catch {
      const msg = "Error de conexión al armar la propuesta de tareas.";
      if (modo === "primera") setError(msg);
      else toast.error(msg);
    } finally {
      setArmando(null);
    }
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


  /* E2a (2026-09-25): se fue `applyAllRegen` (el aplicar del acordeón de «Regenerar todo», por
     /timeline/detail/apply-all). Las tareas de la propuesta se aplican con sus fases en
     `aplicarBorrador` (POST /timeline/borrador/aplicar), que también encadena la reevaluación del
     avance cuando tocó tareas. apply-all queda para pestañas viejas hasta E2b. */

  // El detalle (tareas) ya NO se auto-genera en silencio: lo crea el CTA explícito
  // "Generar cronograma" (#2). Ver el portal de acciones más abajo.

  // ── Asistente IA: instrucción → propuesta → aplicar/descartar ─────────────────
  /* Devuelve el MOTIVO del fallo, o null si anduvo. ⚠ Antes no devolvía nada, así que el
     chat cerraba su panel aunque el aplicar hubiera fallado y el error aparecía suelto al pie
     del documento — reportado por Elías en la primera prueba real. */
  const submitAssist = async (
    instruction: string,
    scopePhaseId: string | null,
  ): Promise<{ fallo: string | null; avisos: string[] }> => {
    if (instruction.trim().length < 4 || assisting)
      return { fallo: "El pedido es muy corto o ya hay uno en curso.", avisos: [] };
    /* ⛔ Tampoco mientras la IA arma otra propuesta: correrían dos agentes a la vez y el segundo
       pisaría en pantalla al primero (ver `aplicarOperacionesAcordadas`). */
    if (ocupado.activo) {
      return { fallo: esperaEnCurso(ocupado.rotulo), avisos: [] };
    }
    /* ⛔ Ni mientras ESTA pantalla pide la propuesta de «Regenerar todo» (E2a): esa espera ya no
       bloquea el cronograma, pero la propuesta que llega se calculó sobre la versión de antes. */
    if (armando !== null) {
      return { fallo: esperaEnCurso("armando la propuesta del cronograma"), avisos: [] };
    }
    /* ⛔ CON CAMBIOS DE FASES SIN DECIDIR, EL MODIFICADOR TAMPOCO (revisión adversarial,
       2026-09-24). La guarda vivía solo en el carril rápido del chat. Este camino —«IA» de una fase
       y el acuerdo viejo del chat— reemplazaba en memoria la propuesta de las reuniones por la suya:
       aplicarla (PUT con motivo) o descartarla (DELETE) borraba la guardada, con sus sugerencias sin
       decidir, y la cadena de «Regenerar todo» ofrecía el paso 2 sobre fases que nadie decidió.
       Desde E1 del borrador la pregunta es «¿hay un borrador guardado?» (`hayBorrador`). */
    if (hayBorrador) {
      setError(CAMBIOS_DE_FASES_SIN_DECIDIR);
      return { fallo: CAMBIOS_DE_FASES_SIN_DECIDIR, avisos: [] };
    }
    setAssisting(true);
    let avisosDelAssist: string[] = [];
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, scopePhaseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const motivo =
          data?.details?.[0] ??
            data?.message ??
            (data?.error === "assist_invalid_proposal"
              ? "La IA devolvió una propuesta inválida — prueba reformular la instrucción."
              : data?.error ?? "Error al pedir la actualización.");
        setError(motivo);
        setAssisting(false);
        return { fallo: motivo, avisos: [] };
      } else {
        // Vive SOLO en memoria: `debeReemplazarPropuesta` nunca la pisa con una del servidor.
        // El `runId` viaja hasta el "Aplicar" para que el PUT pueda cerrarle el desenlace: sin
        // eso solo se sabe cuántas propuestas se generaron, no cuántas se usaron.
        proposalMeta.current = { deAssist: true, runId: data.assistRunId ?? null };
        // Propuesta nueva = revisión limpia: los descartes de la anterior no aplican a ésta.
        setAssistDescartados(new Set());
        setAssistRevision(false);
        setProposal(data.proposal as Proposal);
        setAssistInstruction(instruction.trim()); // #4 — será la razón al aplicar la propuesta
        avisosDelAssist = Array.isArray(data.warnings) ? data.warnings : [];
        setAssistWarnings(avisosDelAssist);
        setAssistOpen(false); // cerrar el dialog; la propuesta se ve en el Gantt (preview)
      }
    } catch {
      const motivo = "Error de conexión con el asistente.";
      setError(motivo);
      setAssisting(false);
      return { fallo: motivo, avisos: [] };
    }
    setAssisting(false);
    /* ⚠ Los avisos del editor (rescates, semanas acomodadas) suben al chat: son la diferencia
       entre «se aplicó» y «se aplicó, pero con una parte hizo otra cosa». */
    return { fallo: null, avisos: avisosDelAssist };
  };

  // Aplicar la propuesta de la IA: PUT directo (sin modal). La razón del audit es la
  // instrucción que el CSE le dio a la IA (o un genérico). El cliente NO la ve hasta "Subir".
  /**
   * ⭐ EL CAMINO RÁPIDO: las operaciones acordadas en el chat se ejecutan acá, sin volver a
   * llamar a ningún modelo.
   *
   * Medido el 2026-08-20: pedirle al modelo que reescribiera el cronograma entero tardaba
   * **217 segundos**; el ejecutor tarda **1 ms**. Y no es solo velocidad — reescribir todo para
   * cambiar una duración soltó el `startWeek` de seis fases y corrió el cierre 70 días. Una
   * operación toca lo que nombra.
   *
   * ⛔ NO ES UN SEGUNDO CAMINO DE ESCRITURA: produce el payload y lo manda al MISMO PUT, con su
   * rescate de progreso, su reparación de semanas y su auditoría.
   */
  const aplicarOperacionesAcordadas = async (
    ops: Operacion[],
    resumen: string,
  ): Promise<{ fallo: string | null; avisos: string[] }> => {
    /* ⛔ CON CAMBIOS DE FASES SIN DECIDIR, EL CHAT NO APLICA (2026-09-23). Este camino guarda con
       un PUT con motivo, y ese PUT borraba `pendingProposal`: las sugerencias del handoff o de las
       reuniones se perdían a mitad de la revisión y la cadena de «Regenerar todo» quedaba esperando
       un paso 2 que nunca llegaba. Desde E1 el servidor además responde 409 (timeline/route.ts),
       pero la pantalla frena antes y dice por qué; el acuerdo sigue ahí para aplicarlo después.
       Con el borrador VACÍO que espera sus tareas no hay nada que decidir todavía: se dice que la IA
       las está armando (revisión de E2a: mandaba a decidir una propuesta que no estaba). Y si su
       corrida ya falló o quedó colgada, que hay que descartarlo: «espera» no tenía salida (cierre de
       la revisión). */
    if (hayBorrador) {
      const vacio = estadoDelVacio(proposal, estadoDeLasTareasEnPantalla);
      return {
        fallo:
          vacio === "armando"
            ? esperaEnCurso("la IA está armando las tareas")
            : vacio === "fallo"
              ? CHAT_CON_EL_VACIO_FALLIDO
              : CAMBIOS_DE_FASES_SIN_DECIDIR,
        avisos: [],
      };
    }
    /* ⛔ NI MIENTRAS LA IA CALCULA (2026-09-24). El chat queda usable durante una espera —su cajón
       está encima del velo, a propósito—, pero escribir en ese rato es el riesgo exacto por el que
       el cronograma se bloquea: la propuesta que llega después se calculó sobre la versión anterior,
       y como la foto se toma al recibirla, lo que escribió el chat no aparecería como choque y
       «Aplicar todo» lo revertiría. Antes lo frenaba una ventana que tapaba la página; ya no está. */
    if (ocupado.activo) {
      return { fallo: esperaEnCurso(ocupado.rotulo), avisos: [] };
    }
    /* ⛔ Ni mientras ESTA pantalla pide la propuesta de «Regenerar todo» (E2a): la espera ya no
       bloquea (queda en el servidor), pero la propuesta que llega se calculó sobre la versión de
       antes y lo que escribiera el chat quedaría debajo de ella. */
    if (armando !== null) {
      return { fallo: esperaEnCurso("armando la propuesta del cronograma"), avisos: [] };
    }
    const { payload, avisos, rechazadas } = aplicarOperaciones(
      fasesActualesDelAssist,
      anchor || null,
      ops,
    );
    /* ⛔ Una operación rechazada NO se ignora: el CSE ya leyó y aprobó esa línea, así que
       aplicar el resto en silencio sería aplicar algo distinto de lo que confirmó. */
    if (rechazadas.length > 0) {
      /* ⚠ Con lotes de doce operaciones, «no se pudo aplicar: esa tarea no existe» no dice
         CUÁL de las doce. El índice sale gratis: `rechazar` empuja la MISMA referencia que se
         está iterando, así que `indexOf` da la posición exacta — y esa posición es el número de
         la línea que la persona acaba de leer en la cajita azul. */
      const motivo = rechazadas
        .map((r) => `#${ops.indexOf(r.operacion) + 1}: ${r.motivo}`)
        .join(" · ");
      setError(`No se pudo aplicar: ${motivo}`);
      return { fallo: motivo, avisos };
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          reason: resumen || "Cambio acordado en el asistente",
          kind: "AI_ASSIST",
          instruction: resumen || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const motivo =
          res.status === 409 && data?.code === "PROPUESTA_ABIERTA"
            ? await anteLaPropuestaGuardada()
            : (data?.details?.[0] ?? data?.error ?? "el cronograma rechazó el cambio");
        setError(motivo);
        return { fallo: motivo, avisos };
      }
      /* Los avisos del PUT (tareas reubicadas) se suman a los del ejecutor: los dos son «el
         sistema hizo algo además de lo pedido». */
      const delPut: string[] = Array.isArray(data?.avisos) ? data.avisos : [];
      await load();
      return { fallo: null, avisos: [...avisos, ...delPut] };
    } catch {
      const motivo = "Error de conexión al aplicar el cambio.";
      setError(motivo);
      return { fallo: motivo, avisos };
    } finally {
      setApplying(false);
    }
  };

  const applyProposal = async () => {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      /* ⚠ Sin ningún descarte se manda la propuesta TAL CUAL, no la proyección. Las dos dan lo
         mismo (hay test de que aceptar todo == el reemplazo entero), pero el camino de siempre
         no puede depender de que ese test siga siendo cierto: si la proyección tuviera un bug,
         se lo comería el 100% de los usos en vez del que de verdad descartó algo. */
      const cuerpo =
        assistDescartadosVivos > 0
          ? proyectarAceptados(
              fasesActualesDelAssist,
              proposal,
              new Set(assistItems.map((i) => i.key).filter((k) => !assistDescartados.has(k))),
              anchor || null,
            )
          : proposal;
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cuerpo,
          reason:
            (assistInstruction.trim() || "Actualización del cronograma (IA)") +
            (assistDescartadosVivos > 0
              ? ` — se aplicaron ${assistItems.length - assistDescartadosVivos} de ${assistItems.length} cambios propuestos`
              : ""),
          kind: "AI_ASSIST",
          instruction: assistInstruction.trim() || null,
          // Cierra el desenlace de la corrida que produjo esta propuesta (ver el PUT).
          assistRunId: proposalMeta.current.runId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          res.status === 409 && d?.code === "PROPUESTA_ABIERTA"
            ? await anteLaPropuestaGuardada()
            : (d?.details?.[0] ?? d?.error ?? "No se pudo aplicar la propuesta."),
        );
      } else {
        proposalMeta.current = { deAssist: false, runId: null };
        setProposal(null);
        setAssistWarnings([]);
        setAssistInstruction("");
        setAssistDescartados(new Set());
        setAssistRevision(false);
        await load();
        // El cartel del widget se apaga solo: si no, queda ámbar sobre algo ya resuelto.
        bumpGpsRefresh();
        clearScope(undoScope); // la propuesta aplicada reemplaza el estado: limpiamos el historial de undo
      }
    } catch {
      setError("Error de conexión al aplicar.");
    }
    setApplying(false);
  };

  const discardProposal = async (reason?: string) => {
    /* Se leen ANTES de limpiar: de dónde salió (lo que notó la IA de las reuniones se junta en la
       franja) y lo que decide si se ofrecen las tareas. */
    const origenDescartado = origenDePropuesta(proposal);
    // Lo que el CSE ya cerró en la franja (la de este borrador vacío) no vuelve a aparecer al descartarlo.
    const observacionesDescartadas =
      franjaCerradaPara !== null && franjaCerradaPara === proposalMeta.current.runId ? [] : (proposal?.observaciones ?? []);
    // E2a: el estado de las tareas de la que se descarta (null = no esperaba tareas), ANTES de limpiar.
    const tareasDescartadas = tareasEnPantalla?.estado ?? null;
    /* Revisión de E2a: la corrida que armaba sus tareas (su seguimiento sigue vivo: al terminar no
       avisa nada de una propuesta que el CSE descartó a propósito) y si traía cambios de fases (con
       ellos, descartar no ofrece las tareas: el CSE rechazó esas fases). E2b: y si era «Regenerar» de
       una fase (nunca se ofrece: «Volver a intentar» lanzaría una corrida de todas las fases). */
    const corridaDescartada = tareasEnPantalla?.corrida ?? null;
    const conFasesLaDescartada = traeCambiosDeFases(proposal);
    const soloFaseLaDescartada = !!revision.borrador?.soloFase;
    // Si la propuesta vino del agente (re-run), está persistida en pendingProposal →
    // limpiarla en el server para que no reaparezca al recargar. El estado local se limpia pase
    // lo que pase.
    /* ⛔ La del modificador vive SOLO en memoria: descartarla no toca el servidor (revisión
       adversarial, 2026-09-24). El DELETE «no-op inofensivo» no lo era: borraba la propuesta que
       SÍ estaba guardada —por ejemplo, las sugerencias de fases de las reuniones a medio decidir—.
       Y la guardada se borra solo si es la misma que esta pantalla tiene enfrente (`runId`: la ruta
       responde 409 si es otra). */
    let guardadaEsOtra = false;
    let yaNoEstaGuardada = false;
    const eraDelModificador = proposalMeta.current.deAssist;
    if (!eraDelModificador) {
      // Un doble clic (o el descarte automático encima del manual): el primer DELETE sigue en curso.
      if (descartandoRef.current) return;
      descartandoRef.current = true;
      setDescartando(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline/proposal`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          // Tanda M — `reason` es opcional: solo el auto-descarte silencioso lo manda, para
          // dejar un log server-side con la corrida que se evaporó (ver la ruta).
          body: JSON.stringify({ runId: proposalMeta.current.runId, ...(reason ? { reason } : {}) }),
        });
        guardadaEsOtra = res.status === 409;
        /* Solo se olvida la foto si el servidor ya no tiene ESTA propuesta (borrada, o ya era
           otra). Si el DELETE falló, la propuesta sigue guardada: olvidar la foto haría que al
           recargar una edición a mano que chocaba pase a «aplica» (revisión de E1). */
        yaNoEstaGuardada = res.ok || res.status === 409;
      } catch {
        /* limpiar local igual */
      } finally {
        descartandoRef.current = false;
        setDescartando(false);
      }
      // La que se tenía enfrente ya no está (o ya no era la guardada): su foto recordada no sirve.
      if (yaNoEstaGuardada) revisionRef.current.olvidar();
      // Descartada a mano mientras se armaban sus tareas: su corrida termina sin aviso.
      if (yaNoEstaGuardada && !reason && corridaDescartada) CORRIDAS_ANUNCIADAS.add(corridaDescartada);
    }
    proposalMeta.current = { deAssist: false, runId: null };
    setProposal(null);
    if (!eraDelModificador) setTareasDelBorrador(null);
    setAssistWarnings([]);
    setAssistDescartados(new Set());
    setAssistRevision(false);
    /* ⚠ Sin esto el cartel ámbar del widget queda encendido sobre una propuesta que ya no existe.
       Con el bug de refresco casi no se veía (la propuesta ni llegaba a cargarse); ahora que
       aparece siempre, un cartel fantasma se leería como que el arreglo no sirvió. */
    bumpGpsRefresh();
    if (eraDelModificador) {
      /* Descartar la vista previa del modificador deja ver la propuesta GUARDADA, si hay: pudo entrar
         mientras la IA trabajaba (el 409 PROPUESTA_ABIERTA lo dice), y sin esto no aparecía hasta
         recargar. */
      void refrescarPropuesta();
      return;
    }
    if (guardadaEsOtra) {
      /* La guardada ya no es la que se descartó (otra la reemplazó): no se borró nada, se trae la que
         está y no se ofrece nada por la descartada. */
      void traerPropuestaPendiente();
      return;
    }
    if (origenDescartado === "contexto") {
      /* Se JUNTAN, no se reemplazan: el borrador vacío del paso 2 pudo nacer sin observaciones, y
         reemplazar borraba lo que notó el paso 1 (revisión de E2a). */
      setObservacionesPaso1((previas) => juntarObservaciones(previas, observacionesDescartadas));
    }
    /* E2b (2026-09-25): descartar NUNCA pide las tareas solo (se fue la cadena vieja, que las pedía al
       descartar la propuesta de las reuniones). Solo se OFRECEN tras descartar el borrador vacío cuya
       corrida falló; nunca con cambios de fases (el CSE los rechazó) ni con «Regenerar» de una fase. */
    const siguiente = pasoTrasResolver({
      como: "descartar",
      tareas: tareasDescartadas,
      conCambiosDeFases: conFasesLaDescartada,
      soloFase: soloFaseLaDescartada,
    });
    if (siguiente === "ofrecer") {
      setOfertaConFases(conFasesLaDescartada);
      setOfrecerTareas(true);
    }
  };

  // ── APLICAR LA PROPUESTA DE FASES (la del handoff, o la de las reuniones) ─────────────────────
  // Una sola vez y entera: lo marcado se escribe; lo desmarcado y lo que choca con una edición
  // posterior se descartan con ella. El servidor decide (POST /timeline/borrador/aplicar): recalcula
  // el plan en su transacción y, si no es la lista que ves, no escribe nada.
  const aplicarBorrador = async () => {
    // Con un descarte en curso, aplicar caería en el 409 de «la propuesta cambió».
    if (aplicandoBorrador || descartandoRef.current || !revisionRef.current.resumen) return;
    setAplicandoBorrador(true);
    /* Qué notó la IA y lo que decide si se ofrecen las tareas: se leen ANTES de limpiar la propuesta
       (después ya no está). E2b: si traía fases y si era «Regenerar» de una fase. */
    const observacionesDeLaPropuesta = revisionRef.current.resumen.observaciones;
    const conFasesLaResuelta = traeCambiosDeFases(proposal);
    const soloFaseLaResuelta = !!revisionRef.current.borrador?.soloFase;
    // E2a: el estado de sus tareas (null = no esperaba tareas), ANTES de limpiar la propuesta.
    const tareasResueltas = tareasEnPantalla?.estado ?? null;
    let siguiente: "nada" | "ofrecer" = "nada";
    try {
      /* Lo que editaste a mano tiene que estar en la base ANTES: el servidor compara contra ella. Si
         no se puede guardar, no se aplica (compararía contra otra cosa que la que ves). */
      const sinGuardar = await esperarQueSeGuarde();
      if (sinGuardar) {
        toast.error(sinGuardar);
        return;
      }
      /* Lo ÚLTIMO de la revisión (el guardado de recién pudo mover lo vivo): la lista, la huella y
         la foto que viajan son las de este momento. Y el historial de deshacer se limpia antes: un
         «deshacer» a mitad del aplicar mandaría el cronograma de antes por encima del aplicado. */
      await new Promise<void>((r) => window.setTimeout(r, 60));
      const { resumen, sin, foto } = revisionRef.current;
      if (!resumen) return;
      clearScope(undoScope);
      const res = await fetch(`/api/projects/${projectId}/timeline/borrador/aplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* `token`: la propuesta que tienes ENFRENTE. Si la guardada es otra (el handoff la reemplazó,
           o se resolvió en otra pestaña), la ruta no aplica nada y responde 409.
           `version` (E2a): la del `borrador-v1` que ves (null en el formato viejo). Si el servidor lo
           reescribió en el medio (llegaron las tareas), responde 409 PROPUESTA_CAMBIO con la nueva,
           que se trae abajo: sin ella, un «Aplicar» caía una y otra vez en PLAN_CAMBIO (el `load` no
           reemplaza la propuesta de la pantalla). */
        body: JSON.stringify({ token: proposalMeta.current.runId, sin: [...sin], huella: resumen.huella, foto, version: revisionRef.current.version }),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.message ?? "La propuesta o el cronograma cambiaron mientras la revisabas: revisa la lista actualizada.");
        if (d?.error === "PLAN_CAMBIO") {
          /* La misma propuesta, otro cronograma (otra pestaña u otra persona): se recarga lo vivo y
             la lista se recalcula contra la misma foto (lo nuevo aparece como choque). */
          await load();
        } else {
          await traerPropuestaPendiente();
        }
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.message ?? d?.error ?? "No se pudo aplicar la propuesta.");
        return;
      }
      const d = (await res.json()) as {
        aplicadas: number;
        total: number;
        pendientes?: number;
        avisos?: string[];
        /** E2a: las tareas creadas + las quitadas. Con alguna, el avance se vuelve a evaluar. */
        tareasTocadas?: number;
      };
      toast.success(
        d.aplicadas === d.total
          ? `Propuesta aplicada: ${plural(d.aplicadas, "cambio", "cambios")}.`
          : `Se aplicaron ${d.aplicadas} de ${d.total} cambios; el resto quedó fuera.`,
      );
      /* Las tareas que se corrieron porque su fase se acortó: el CSE tiene que enterarse de que se
         mudaron a la última semana. */
      for (const aviso of Array.isArray(d.avisos) ? d.avisos : []) toast.info(aviso, { duration: 12000 });
      // La propuesta ya no existe: se vacía ANTES de recargar (el load la toma con `prev ?? …`), y
      // lo que se recordaba de ella (la foto, lo desmarcado) se olvida.
      revisionRef.current.olvidar();
      proposalMeta.current = { deAssist: false, runId: null };
      setProposal(null);
      setTareasDelBorrador(null);
      await load();
      bumpGpsRefresh();
      /* E2a: si se crearon o quitaron tareas, el avance se vuelve a evaluar con el cronograma nuevo
         (lo mismo que hacía el camino viejo de «Regenerar todo» al aplicar). Best-effort: si falla,
         el cronograma ya quedó aplicado. Las fases nuevas solas no lo piden. */
      if (typeof d.tareasTocadas === "number" && d.tareasTocadas > 0) {
        setChainingProgress(true);
        try {
          const pres = await fetch(`/api/projects/${projectId}/timeline/progress`, { method: "POST" });
          const pdata = await pres.json().catch(() => ({}));
          if (pres.ok && pdata?.status === "ok") {
            await load();
            toast.success("Avance re-evaluado con el cronograma nuevo — confirma abajo.");
          }
        } catch { /* best-effort, mismo criterio que el camino viejo */ }
        setChainingProgress(false);
      }
      siguiente = pasoTrasResolver({
        como: "aplicar",
        tareas: tareasResueltas,
        conCambiosDeFases: conFasesLaResuelta,
        soloFase: soloFaseLaResuelta,
      });
    } catch {
      toast.error("Error de conexión al aplicar la propuesta.");
    } finally {
      setAplicandoBorrador(false);
    }
    /* Las tareas no llegaron: se OFRECEN en la línea de arriba del Gantt, nunca se piden solas. E2b
       (2026-09-25): se fue la cadena vieja, que al aplicar la propuesta de las reuniones pedía sola el
       paso 2 (una corrida pagada que nadie apretó). */
    if (siguiente === "ofrecer") {
      setObservacionesPaso1((previas) => juntarObservaciones(previas, observacionesDeLaPropuesta));
      setOfertaConFases(conFasesLaResuelta);
      setOfrecerTareas(true);
    }
  };

  // Propuesta de fases donde TODO ya está así (stale: anterior al guard de no-op, o el CSE ya
  // igualó el cronograma a mano) → no hay nada que decidir: se descarta sola, así no queda el
  // aviso fantasma en "Qué hacer acá". ⚠ Un choque NO la descarta: el ⚠ se tiene que ver.
  useEffect(() => {
    // `dirty` es clave: la lista se calcula contra el estado LOCAL, así que una edición sin
    // guardar que casualmente coincida con la propuesta la hacía desaparecer del server — y al
    // deshacer ya no volvía. Con cambios sin guardar no se descarta nada.
    /* E2a: ni mientras esta pantalla pide la propuesta (`armando`): la que acaba de llegar del paso 1
       espera sus tareas, y la regla del núcleo (`debeDescartarseSolo`) hace el resto. */
    if (hayBorrador && revision.nadaQueDecidir && !aplicandoBorrador && !loading && !dirty && !saving && armando === null) {
      void discardProposal("auto-zero-deltas");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayBorrador, revision.nadaQueDecidir, loading, dirty, saving, armando]);

  /* ── EL SEGUIMIENTO DE LA CORRIDA QUE ARMA LAS TAREAS (E2a del borrador, 2026-09-25) ────────────
     Con la propuesta EN PANTALLA «armando», se sigue su corrida con `useAgentRun`: consulta cada 3 s
     y trae la fase que reporta, que pinta la línea de la barra. Al terminar se trae la propuesta
     guardada (con sus tareas, o ninguna si no propuso nada) y se avisa UNA sola vez: `track` marca la
     corrida como anunciada en el centro de corridas, así que el aviso es este. Recargar o volver a
     entrar a mitad de camino no lanza otra corrida: el GET trae «armando» y se sigue la misma.
     ⛔ El aviso del sistema del cronograma (`notifyAgentDone`) sale SOLO de acá: dos avisos por la
     misma corrida enseñan a ignorarlos.
     Revisión de E2a: qué se dice lo decide `desenlaceDelSeguimiento` (borrador.ts, con sus tests):
     nada si la propuesta guardada ya no es la de esta corrida (se descartó o entró otra), la causa en
     palabras del CSE y nunca el código de la corrida, y un solo aviso cuando una corrida colgada pasa a
     «fallo». Si el GET falla no se sabe nada: se vuelve a mirar, sin avisar ni darla por avisada.
     Los avisos, solo con `canEdit`: la barra, la línea y la vista de la propuesta son de quien edita.
     Quien solo mira también la sigue, pero en silencio: al terminar se relee el cronograma y su chip
     «Armando las tareas…» se apaga (cierre de la revisión de E2a: quedaba fijo hasta recargar). */
  const { phase: faseDelArmado, track } = useAgentRun(clientId);
  const siguiendoRef = useRef<string | null>(null);
  const [vueltaDelSeguimiento, setVueltaDelSeguimiento] = useState(0);
  const corridaQueArma = tareasEnPantalla?.estado === "armando" ? tareasEnPantalla.corrida : null;
  const puedeEditarRef = useRef(canEdit);
  useEffect(() => {
    puedeEditarRef.current = canEdit;
  });
  useEffect(() => {
    if (!corridaQueArma || siguiendoRef.current === corridaQueArma) return;
    const corrida = corridaQueArma;
    siguiendoRef.current = corrida;
    void (async () => {
      const r = await track(corrida);
      siguiendoRef.current = null;
      /* La vista previa del modificador vive solo en memoria: nunca se pisa (la guardada llega al
         descartarla). Con ella en pantalla, la guardada se LEE sin ponerla: antes no se leía nada, el
         desenlace callaba y daba la corrida por avisada (cierre de la revisión de E2a). */
      const conVistaPrevia = proposalMeta.current.deAssist;
      const leida = conVistaPrevia ? await traerPropuestaPendiente({ soloLeer: true }) : await traerPropuestaPendiente();
      const desenlace = desenlaceDelSeguimiento({
        corrida,
        estado: r.status,
        lectura: leida.ok ? { hayPropuesta: leida.propuesta !== null, tareas: leida.tareas } : null,
        aviso: r.timelineSyncError,
        conVistaPrevia,
      });
      if (desenlace.que === "seguir") {
        // Sigue «armando» (~6 min sin terminar) o el GET falló: se relee y se vuelve a seguir.
        setVueltaDelSeguimiento((n) => n + 1);
        return;
      }
      /* Quien solo mira: ya se releyó el cronograma (el chip dice lo de ahora). Los avisos son de quien
         edita, con el permiso de AHORA: `useMe` puede llegar después de que empezó el seguimiento. */
      if (!puedeEditarRef.current) return;
      /* Si el cronograma se desmontó y se volvió a montar a mitad de camino (cambiar de pieza), el
         seguimiento viejo y el nuevo terminan juntos: se avisa una sola vez por corrida. */
      if (CORRIDAS_ANUNCIADAS.has(corrida)) return;
      CORRIDAS_ANUNCIADAS.add(corrida);
      if (desenlace.que === "callar") return;
      if (desenlace.tono === "exito") toast.success(desenlace.texto);
      else if (desenlace.tono === "error") toast.error(desenlace.texto);
      else toast.info(desenlace.texto);
      void notifyAgentDone({ group: "cronograma", ok: desenlace.ok, url: cronogramaUrl });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridaQueArma, vueltaDelSeguimiento]);
  /* Lo que ve la barra de las tareas: el estado del servidor (o «armando» mientras esta pantalla las
     pide), con la fase EN VIVO mientras se sigue. */
  const tareasDeLaBarra: TareasEnPantalla | null =
    tareasEnPantalla && estadoDeLasTareasEnPantalla
      ? {
          estado: estadoDeLasTareasEnPantalla,
          fase: faseDelArmado ?? tareasEnPantalla.fase,
          motivo: tareasEnPantalla.motivo,
        }
      : null;
  /* ¿El cronograma ya tiene detalle de la IA? Decide qué pide «Regenerar todo» / «Generar cronograma»
     y con qué permiso. E2b: se declara antes de la línea suelta, que lo usa para ofrecer las tareas. */
  const hasAiDetail = phases.some((p) => p.tasks.some((t) => t.source === "AGENT" || t.source === "MODIFIED"));
  /* ── LA LÍNEA SUELTA (E2a P6): la misma línea de las tareas, arriba del Gantt, cuando no hay barra
     que la lleve: mientras corre el paso 1 (todavía no hay propuesta), mientras sale el pedido del
     paso 2 sin propuesta en pantalla, o con una propuesta SIN cambios todavía (la que el paso 2 crea
     vacía y llena al terminar). Con la barra montada, la línea va adentro de ella.
     E2b (2026-09-25): también «ofrecer» — sin propuesta y sin nada en curso, después de aplicar una
     propuesta cuyas tareas no llegaron o de descartar el vacío que falló (`ofrecerTareas`), y solo con
     el permiso que el servidor va a exigir. Reemplaza a la franja de la cadena vieja. */
  const lineaSuelta: { estado: EstadoDeLasTareas | "paso-1" | "ofrecer"; fase: string | null; motivo: string | null } | null =
    armando?.paso === 1
      ? { estado: "paso-1", fase: null, motivo: null }
      : hayBorrador && revision.resumen
        ? null
        : tareasDeLaBarra
          ? tareasDeLaBarra
          : armando?.paso === 2
            ? { estado: "armando", fase: null, motivo: null }
            : !hayBorrador && armando === null && ofrecerTareas && (hasAiDetail ? canRegenerateTimeline : canGenerateTimeline)
              ? { estado: "ofrecer", fase: null, motivo: null }
              : null;
  /* «Armar las tareas» / «Volver a intentar» (en la barra y en la línea suelta): el paso 2 sobre la
     propuesta en pantalla, SALTANDO el paso 1. Solo con el permiso que el servidor va a exigir: la
     primera pasada pide `generate`; después, `regenerate`. Sin él la línea informa sin botón (revisión
     de E2a: se ofrecía y el servidor respondía 403, mientras que la oferta equivalente y «Regenerar
     todo» ya se ocultaban). */
  const armarLasTareas =
    (revision.borrador?.pedido === "primera" ? canGenerateTimeline : canRegenerateTimeline)
      ? () =>
          void pedirPropuestaDeDetalle(revision.borrador?.pedido === "primera" ? "primera" : "regen", {
            saltarEstructura: true,
          })
      : undefined;

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

  /**
   * Dar por RESUELTA una desviación, o reabrirla.
   *
   * ⛔ Cerrar no resta semanas ni oculta nada: el plan ya se corrió y la bitácora sigue siendo la
   * bitácora. Lo que se apaga es la acción — deja de pedir que alguien la persiga.
   *
   * ⚠ Igual marca `particularidadesDirty`. Lo que el cliente lee es un SNAPSHOT congelado, así que
   * cerrar no cambia nada de su lado hasta que alguien vuelva a subir; sin esta marca, la barra no
   * invitaría a re-publicar y el cliente seguiría leyendo el estado viejo por tiempo indefinido,
   * sin que nada avise.
   */
  const cerrarParticularidad = async (id: string, accion: "cerrar" | "reabrir", nota: string) => {
    const prev = particularidades;
    const ahora = new Date().toISOString();
    setParticularidades((ps) =>
      ps.map((p) =>
        p.id === id
          ? {
              ...p,
              estado: accion === "cerrar" ? "CERRADA" : "ABIERTA",
              ...(accion === "cerrar"
                ? { resueltaEn: ahora, resueltaNota: nota || null }
                : {}),
            }
          : p,
      ),
    );
    setParticularidadesDirty(true);
    /* ⛔ Sin esto, resolver una desviación la hacía DESAPARECER a los ojos del CSE: la fila se
       mueve al grupo "Lo que ya pasó", que arranca SIEMPRE colapsado (es la bitácora, nunca pide
       nada) — y si era la primera fila resuelta del cronograma, ese grupo ni siquiera existía en
       pantalla todavía (0 ítems = 0 render). El CSE clickeaba "Dar por resuelta" y la fila se
       esfumaba de la sección donde la venía mirando, reapareciendo colapsada en otra parte de la
       página. Reusa el mismo mecanismo que ya abre grupos desde el panel "Qué hacer acá", y el
       MISMO criterio de clasificación que usa esa pantalla (`grupoDeParticularidad`) — sin
       duplicados propios: "cerrar" da CERRADA, que la función ya resuelve siempre a "historia";
       "reabrir" da ABIERTA sin chequeo de gemelas —caso raro, y equivocarse ahí solo abre un
       grupo de más, no de menos—. */
    const item = prev.find((p) => p.id === id);
    const grupoDestino = item
      ? grupoDeParticularidad({ ...item, estado: accion === "cerrar" ? "CERRADA" : "ABIERTA" }, new Set())
      : "historia";
    setFocusGroup((f) => ({ key: grupoDestino, nonce: (f?.nonce ?? 0) + 1 }));
    try {
      const res = await fetch(
        `/api/projects/${projectId}/timeline/particularidades/${id}/cerrar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion, nota }),
        },
      );
      if (!res.ok) {
        setParticularidades(prev); // revertir: pintar optimista solo es honesto si el fallo deshace
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "No se pudo cambiar el estado de la desviación.");
      } else {
        toast.success(accion === "cerrar" ? "Desviación resuelta." : "Desviación reabierta.");
      }
    } catch {
      setParticularidades(prev);
      toast.error("Error de conexión al cambiar el estado.");
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

  const ganttPhases: GanttPhase[] = phases.map((p) => ({
    key: p._key,
    id: p.id,
    name: p.name || "(sin nombre)",
    durationWeeks: p.durationWeeks,
    startWeek: p.startWeek ?? null,
    sessionCount: p.sessionCount,
    actualSessionCount: p.actualSessionCount ?? null,
    solapaCon: p.solapaCon ?? [],
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

  /* ── LA VISTA «VER LA PROPUESTA» ─────────────────────────────────────────────
     Las fases como quedarían (`proyectar`, lib/timeline/borrador.ts) con sus tareas: las que
     sobreviven (con su avance de siempre, por id) y, desde E2a, las nuevas marcadas. La `key` de una
     fase existente es la MISMA que en el cronograma actual —así las fases abiertas siguen abiertas al
     alternar— y una fase nueva usa su clave (`nueva:<i>` o `n:…`). Lo mismo con las tareas: una que
     ya existe reusa su fila (misma `key`); una nueva usa la clave de su cambio (`t:…`). Las semanas ya
     vienen acotadas a la duración final (el acotado vive en `proyectar`, igual que en el servidor). */
  const ganttPorId = new Map(ganttPhases.filter((g) => g.id).map((g) => [g.id as string, g]));
  const fasesDeLaPropuesta: GanttPhase[] = (revision.proyeccion?.fases ?? []).map((f) => {
    const actual = f.id ? ganttPorId.get(f.id) : undefined;
    const filaPorId = new Map((actual?.tasks ?? []).filter((t) => t.id).map((t) => [t.id as string, t]));
    const tasks: GanttTask[] = f.tareas.map((t) => {
      const fila = t.id ? filaPorId.get(t.id) : undefined;
      if (fila) return { ...fila, weekIndex: t.weekIndex };
      return {
        key: t.clave,
        title: t.title,
        weekIndex: t.weekIndex,
        status: "PENDING",
        notes: t.notes,
        needsValidation: t.needsValidation,
        source: "AGENT",
        party: t.party,
        type: t.type,
      };
    });
    // Una tarea recién escrita que el autoguardado todavía no mandó (sin id) también se ve.
    for (const t of actual?.tasks ?? []) {
      if (!t.id) tasks.push({ ...t, weekIndex: Math.min(t.weekIndex, Math.max(f.durationWeeks - 1, 0)) });
    }
    return {
      key: actual?.key ?? f.clave,
      id: f.id ?? undefined,
      name: f.name || "(sin nombre)",
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      actualSessionCount: actual?.actualSessionCount ?? null,
      solapaCon: actual?.solapaCon ?? [],
      activityType: f.activityType,
      status: actual?.status ?? "PENDING",
      needsValidation: actual?.needsValidation,
      tasks,
    };
  });
  const marcasDeLaPropuesta = new Map(
    (revision.proyeccion?.fases ?? []).flatMap((f, i) =>
      f.marca ? [[fasesDeLaPropuesta[i].key, f.marca] as const] : [],
    ),
  );
  /* En «Ver la propuesta» el Gantt es de solo lectura también en lo que no es estructura
     (particularidades, sugerencias del equipo): lo que se mira ahí todavía no existe. */
  const puedeEditarElGantt = canEdit && !verPropuesta;

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
          pendingProgressDias: showProgressBanner ? diasSinConfirmar(pendingProgress, null, new Date()) : null,
          pendingParticularidades: showParticBanner ? (pendingParticularidades?.length ?? 0) : 0,
          pendingProposal: !!proposal,
          /* El borrador vacío que espera sus tareas: «La IA está armando las tareas», sin «Revisar»; o,
             con su corrida muerta, que hay que descartarlo (cierre de la revisión de E2a). */
          armandoTareas: estadoDelVacio(proposal, estadoDeLasTareasEnPantalla) === "armando",
          tareasFallaron: estadoDelVacio(proposal, estadoDeLasTareasEnPantalla) === "fallo",
          particularidades,
          sugerenciasDelEquipo: sugerencias.length,
          phases: ganttPhases,
        },
        summary,
        hydratedNow,
      ),
    [
      ganttPhases, anchor, hydratedNow, summary, showProgressBanner, showParticBanner,
      pendingParticularidades, proposal, estadoDeLasTareasEnPantalla, detailConfirmedAt, hasAiDetail,
      particularidades, sugerencias,
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
     alimentar los dos avisos ámbar permanentes que se borraron. ⚠ La tarea «por validar» NO tiene
     marca en el Gantt (desde c29efc3b, se reemplazó por la procedencia IA/CSE): el CSE la ve en la
     curación antes de aplicar, y la marca queda en la base (firmeza del baseline). Ver el
     encabezado de TimelineGantt.tsx. */

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

  /* ── EL PREVIEW MOSTRABA TODO COMO PENDIENTE, Y ERA MENTIRA ─────────────────────────────────
     ⛔ Hasta el 2026-08-20 esta proyección ponía `status: "PENDING"` en TODAS las tareas. En un
     cronograma con 13 tareas hechas, la vista previa las pintaba atrasadas — mientras el cartel
     de arriba promete, con todas las letras, que «los estados de las tareas existentes se
     conservan al aplicar».

     El texto decía una cosa y la imagen la contraria, que es la peor forma de este defecto: el
     CSE mira el preview y cree que aplicar le borra el progreso. Reportado por Elías así:
     «el congelado no representa la realidad».

     El estado NO viaja en la propuesta y está bien que no viaje —el PUT no toca `status`, por eso
     se conservan— así que se repone desde lo que HAY, por id. Las tareas nuevas (sin id) sí nacen
     pendientes, que es la verdad. */
  const estadoActualPorTaskId = new Map<string, TaskDraft["status"]>();
  for (const p of phases) for (const t of p.tasks) if (t.id) estadoActualPorTaskId.set(t.id, t.status);

  // Propuesta DEL MODIFICADOR → preview del Gantt (read-only) + resumen del diff. ⛔ Nunca la de
  // fases guardada: esa se proyecta con el núcleo del borrador, y en el formato nuevo ni siquiera
  // trae `phases` (leerla acá reventaba la pantalla).
  const propuestaDelAssist = proposal && !hayBorrador ? proposal : null;
  const proposalGantt: GanttPhase[] | null = propuestaDelAssist
    ? propuestaDelAssist.phases.map((p, i) => ({
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
          /* Ver el bloque de arriba: sin esto el preview borra visualmente el progreso. */
          status: (t.id ? (estadoActualPorTaskId.get(t.id) ?? "PENDING") : "PENDING") as TaskDraft["status"],
          notes: t.notes ?? null,
          needsValidation: false,
        })),
      }))
    : null;

  const diffSummary = (() => {
    const proposal = propuestaDelAssist;
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
    <div className="relative">
      {/* ⭐ EL CRONOGRAMA SE BLOQUEA MIENTRAS SE APLICA UN CAMBIO.

          Con las operaciones aplicar tarda ~1 ms más el viaje al servidor, así que la ventana es
          corta — pero corta no es cero, y en esa ventana el Gantt sigue siendo editable y muestra
          datos que están por cambiar. Alguien que arrastre una tarea justo ahí escribe sobre lo
          que se está escribiendo.

          ⚠ Va por ENCIMA del contenido (z-30) pero por DEBAJO del cajón del asistente (z-45): el
          chat tiene que seguir visible y usable mientras el cronograma se acomoda — es donde está
          el aviso de qué pasó. */}
      {ocupado.activo && (
        <div
          className="absolute inset-0 z-[44] cursor-wait"
          /* ⛔ SIN `aria-live` ACÁ: `aria-busy` significa literalmente «no anuncies todavía, sigo
             actualizando», así que suprimía la región viva que tenía al lado. Y como el nodo se
             DESMONTA al terminar —nunca pasa a `aria-busy=false`— el anuncio retenido no se
             disparaba nunca. El anuncio vive abajo, en una región montada siempre. */
          aria-busy="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ⛔ TINTA BLANCA SOBRE TODO (pedido de Elías, 2026-08-21). `bg-surface/85` es el
              blanco DEL TEMA —nunca un gris crudo, que rompe el modo oscuro— y el blur remata
              que lo de abajo no se puede leer ni tocar. */}
          <div className="absolute inset-0 rounded-2xl bg-surface/85 backdrop-blur-[2px]" />
          {/* ⭐ EL AVISO VA ARRIBA DEL CRONOGRAMA, NO FLOTANDO (Elías, 2026-09-24: «que no esté en
              un modal o pop-up»). Es una franja en el borde de arriba del cronograma, así que se lee
              como parte de él: «esto está pasando acá».
              ⚠ Va `sticky`: el cronograma mide varias pantallas y un aviso fijo en su borde de
              arriba quedaría fuera de la vista apenas la persona scrollea — un bloqueo cuyo aviso
              no se ve se lee como la pantalla colgada. La barrita que corre va ADENTRO del aviso,
              en su borde de abajo: afuera la tapaba el propio aviso. */}
          {/* ⚠ EL CARTEL TOMA EL FOCO, y no es un detalle: los botones que ENCIENDEN el bloqueo
              viven dentro del subárbol que se vuelve inerte. Cuando el elemento enfocado pasa a
              inerte, el navegador lo desenfoca y el foco cae a `body` — o sea que apretar
              «Aplicar avance» con el teclado te devuelve al principio del documento. Poniéndolo
              acá, el foco queda EN el aviso y se lee en contexto. */}
          <div
            ref={carteldeBloqueoRef}
            tabIndex={-1}
            className="sticky top-2 m-2 flex items-center gap-3 overflow-hidden rounded-xl border border-info-line bg-info-surface px-4 py-3 shadow-sm focus:outline-none"
          >
            <span className="w-5 h-5 flex-shrink-0 border-2 border-brand/25 border-t-brand rounded-full animate-spin" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{ocupado.rotulo}…</p>
              <p className="text-xs text-fg-muted">{ocupado.detalle}</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-0.5">
              {/* El padre fija la altura en `h-0.5`: es una barra de 2 px que recorre el ancho,
                  no un rectángulo relleno esperando contenido. */}
              <div className="skeleton-shimmer h-full w-full" /> {/* slab-ok */}
            </div>
          </div>
        </div>
      )}
      {/* ⛔ `inert` ES LO QUE BLOQUEA DE VERDAD, y el velo solo lo hace parecer. Sin esto el
          contenido de abajo sigue siendo enfocable con Tab, editable desde el teclado, y
          clickeable por cualquier hijo con un z mayor que el del velo. `inert` saca el subárbol
          entero del foco y de los eventos: es el único «bloqueado» que no depende de adivinar
          z-index uno por uno. (React 19 lo pasa como atributo booleano.) */}
      {/* ⚠ MONTADA SIEMPRE, aunque esté vacía: una región viva tiene que estar en el DOM ANTES
          del cambio para que el lector de pantalla la observe. Insertarla ya con el texto adentro
          no anuncia nada. Va FUERA del subárbol inerte, o dejaría de leerse justo cuando importa. */}
      <p role="status" aria-live="polite" className="sr-only">
        {ocupado.activo ? `${ocupado.rotulo}. ${ocupado.detalle}` : ""}
      </p>
      <div className="space-y-4" inert={ocupado.activo}>
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
          {/* Conversar el cambio ANTES de generarlo. Solo con cronograma armado: un asistente
              sobre un documento vacío no tiene qué modificar. */}
          {canEdit && phases.length > 0 && (
            <button
              onClick={() => setChatAbierto((v) => !v)}
              /* Sin esto, un lector de pantalla anuncia «Asistente, botón» idéntico abierto y
                 cerrado: la única señal del estado era el color. */
              aria-expanded={chatAbierto}
              aria-controls={ID_DEL_CAJON}
              className={
                chatAbierto
                  ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-secondary-fg transition-colors"
                  : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-fg-muted border border-line hover:text-fg hover:bg-surface-hover transition-colors"
              }
              title="Conversa el cambio con el asistente: te dice qué se puede y qué fecha mueve antes de generarlo"
            >
              💬 Asistente
            </button>
          )}
          {/* E2a: la espera de «Regenerar todo» / «Generar cronograma» se dice acá (y en la línea de
              arriba del Gantt), sin bloquear nada: el resultado queda en el servidor. También cuando
              la corrida de las tareas sigue sola (recargaste, o la pidió otra pestaña). Sin región
              viva propia: la que anuncia es la línea (`LineaDeLasTareas`), una sola vez. */}
          {(armando !== null || tareasDelBorrador?.estado === "armando") && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-info-ink">
              <span className="w-3 h-3 border-2 border-info-line border-t-info-ink rounded-full animate-spin" />
              {/* El mismo criterio que la línea: «Revisando fases y tiempos…» solo con material elegido. */}
              {textoDelChipDeEspera(armando?.paso === 1, materialElegido)}
            </span>
          )}
          {/* La propuesta de estructura, en la MISMA fila que las demás acciones.
              ── LA FALLA QUE ARREGLA ─────────────────────────────────────────
              Con una propuesta pendiente, esta fila quedaba VACÍA: el gate `!proposal` escondía
              los tres botones. Pero una propuesta de estructura NO congela el cronograma —el
              Gantt sigue editable y el aviso ámbar de abajo igual ofrece "Genera las tareas"—,
              así que la acción existía pero solo enterrada en un banner. Quedaban cuatro avisos
              apilados antes de ver el Gantt y ningún botón donde uno los busca.
              NO aplica: baja hasta la barra de revisión, donde cada cambio se ve con su detalle. */}
          {canEdit && hayBorrador && revision.resumen && revision.resumen.total > 0 && (
            <button
              onClick={() =>
                document
                  .getElementById("cronograma-propuesta")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
              title="La IA propuso cambios del cronograma: se revisan arriba del Gantt, antes de aplicarlos"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              {/* Con un cambio masivo, "Revisar 11 cambios" subestima lo que hay abajo: no son
                  once ajustes, es otro plan. El texto cambia; la CONDICIÓN del botón, no.
                  E2a: con tareas, «Revisar 57 cambios» mezclaría fases y tareas: se revisa «la propuesta». */}
              {revision.resumen.grupos.length > 0
                ? "Revisar la propuesta"
                : revision.resumen.magnitud.esCronogramaNuevo
                  ? "Revisar el cronograma nuevo"
                  : `Revisar ${revision.resumen.total} ${revision.resumen.total === 1 ? "cambio" : "cambios"}`}
            </button>
          )}
          {/* CTA bi-estado (#2): sin tareas (y nunca publicado) → "Generar cronograma" (crea las
              tareas iniciales); ya con tareas o publicado → "Chequear avance" (D.2). El gate
              !hasPublishedOnce evita regenerar sobre un cronograma vivo (borraría fechas/avance),
              aun si se borraron las tareas post-publicación. */}
          {canEdit && phases.length > 0 && (!proposal || hayBorrador) && (
            !hasPublishedOnce && !hasAiDetail ? (
              // Cronograma VIRGEN: "Generar cronograma" solo si tiene el permiso; si no,
              // no mostrar nada (NO caer al botón de avance — no hay avance que chequear
              // sobre un esqueleto sin tareas y el usuario no puede generarlas).
              canGenerateTimeline ? (
                <button
                  onClick={() => void pedirPropuestaDeDetalle("primera")}
                  disabled={armando !== null || tareasDelBorrador?.estado === "armando"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
                  title="Crea las tareas iniciales del cronograma con IA, sobre las fases del handoff. Si elegiste reuniones o notas, o escribiste instrucciones adicionales, primero revisa fases y tiempos con eso (tú decides cada cambio)"
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
              title="Pídele a la IA un cambio del cronograma — tú revisas antes de aplicar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Pedir cambio con IA
            </button>
          )}
          {/* Tanda N — "Regenerar todo el cronograma": mismo gate que "Regenerar" por fase
              (hasAiDetail && canRegenerateTimeline). Preview de TODAS las fases → curación
              fase por fase en acordeón → aplicar todo en una transacción. */}
          {canEdit && phases.length > 0 && !proposal && hasAiDetail && canRegenerateTimeline && (
            <button
              onClick={() => void pedirPropuestaDeDetalle("regen")}
              disabled={armando !== null || tareasDelBorrador?.estado === "armando"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-60"
              title="Si elegiste reuniones o notas, o escribiste instrucciones adicionales, primero revisa fases y tiempos con eso; después arma las tareas de todas las fases. Todo llega en UNA propuesta que revisas arriba del Gantt antes de aplicarla"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {/* Texto fijo (E2a): la espera la dicen el chip de al lado y la línea de arriba del Gantt. */}
              Regenerar todo el cronograma
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
          {/* «Aprobar el plan» — congela la foto contra la que se mide el alcance, sin publicar
              nada. Va JUNTO a «Confirmar detalle» porque es el otro gesto explícito y terminal
              del canvas, y tiene el mismo dueño (el CSE).
              ⚠ Se pide ancla para mostrarlo: sin fecha de arranque el endpoint responde 400, y un
              botón que solo sirve para dar error enseña a ignorar los botones. */}
          {canEdit && phases.length > 0 && !proposal && anchor && (
            <button
              onClick={() => void approvePlan()}
              disabled={approvingPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-fg-secondary hover:text-fg hover:border-fg-muted transition-colors disabled:opacity-60"
              title="Congela este plan como la promesa contra la que se mide el alcance. No le muestra nada al cliente."
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {approvingPlan ? "Aprobando…" : "Aprobar el plan"}
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
          es el único paso que publica el snapshot al cliente (también el primer publish).
          ⭐ Con una propuesta de fases abierta queda LIBRE, con aviso (respuesta 4 de Elías,
          2026-09-24): antes se escondía, y el CSE no podía subir un avance porque había una
          sugerencia sin decidir. Solo la vista previa del modificador la sigue escondiendo. */}
      {canEdit && (!proposal || hayBorrador) && phases.length > 0 && (
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
          savedMessage={
            hayBorrador
              ? `Cambios guardados — el cliente todavía no los ve. ${AVISO_SUBIR_CON_PROPUESTA}`
              : "Cambios guardados — el cliente todavía no los ve."
          }
        />
      )}

      {/* La propuesta de fases guardada se revisa en SU barra, arriba del Gantt (más abajo,
          `RevisionDeLaPropuesta`): el mismo Gantt alterna «Ver como estaba antes» ↔ «Ver la
          propuesta». Ya no hay recuadros ni filas fantasma dentro del cronograma editable. */}

      {/* ── Banner de propuesta del ASSIST (reemplazo completo con tareas): preview sin guardar ── */}
      {proposal && !hayBorrador && diffSummary && (
        // Ancla PROPIA: antes el CTA "Ver la propuesta" apuntaba a #cronograma-borradores, que solo
        // existe si hay banners de avance o particularidades. Con solo una propuesta pendiente, el
        // botón no hacía nada.
        <div id="cronograma-propuesta" className="scroll-mt-24 rounded-2xl border border-brand/40 bg-surface shadow-sm overflow-hidden">
          {/* ⚠ EL AVISO DE CONGELADO, Y VA PRIMERO. Mientras hay propuesta el Gantt es de solo
              lectura: nadie puede tocar una tarea hasta resolverla. Eso está bien —lo pidió
              Elías— pero hasta hoy no se decía en ningún lado, así que el CSE probaba editar y
              no entendía por qué no respondía. Un estado modal que no se anuncia se lee como una
              pantalla rota. */}
          <div className="flex items-start gap-2 px-4 py-2.5 bg-warn-surface border-b border-warn-line">
            <span className="text-sm leading-none mt-0.5" aria-hidden>⚠</span>
            <p className="text-xs font-semibold text-warn-ink">
              El cronograma está congelado mientras revisas esta propuesta.
              <span className="font-normal"> Acepta o descarta los cambios para volver a editarlo.</span>
            </p>
          </div>
          <div className="px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand">
              Propuesta de la IA — vista previa, sin guardar
            </span>
            <span className="text-[11px] text-fg-muted">
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
                {applying
                  ? "Aplicando…"
                  : assistDescartadosVivos > 0
                    ? `Aplicar ${assistItems.length - assistDescartadosVivos} de ${assistItems.length}`
                    : "Aplicar cambios"}
              </button>
              <button
                onClick={() => void discardProposal()}
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
          {/* ── LA REVISIÓN POR ÍTEM ──────────────────────────────────────────────────
                 Antes de esta tanda la propuesta era todo-o-nada: el CSE pedía «atrasá Setup una
                 semana», el modelo de paso reescribía tres títulos, y la única salida era
                 tragarse las cuatro cosas o descartar las cuatro. Acá cada cambio se saca solo,
                 y «Aplicar» escribe únicamente lo que quedó. El default sigue siendo TODO. */}
          {assistItems.length > 0 && (
            <div className="pt-2 border-t border-line">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setAssistRevision((v) => !v)}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark underline underline-offset-2"
                >
                  {assistRevision
                    ? "Ocultar el detalle"
                    : `Revisar uno por uno (${assistItems.length})`}
                </button>
                {assistDescartadosVivos > 0 && (
                  <span className="text-[11px] text-amber-300">
                    {assistDescartadosVivos === 1
                      ? "1 cambio descartado — no se va a escribir"
                      : `${assistDescartadosVivos} cambios descartados — no se van a escribir`}
                  </span>
                )}
                {assistDescartadosVivos > 0 && (
                  <button
                    onClick={() => setAssistDescartados(new Set())}
                    className="text-[11px] text-fg-muted hover:text-fg underline underline-offset-2"
                  >
                    Volver a incluir todo
                  </button>
                )}
              </div>
              {assistRevision && (
                <div className="mt-2 space-y-2 max-h-96 overflow-y-auto pr-1">
                  {gruposDeAssist.map((g) => {
                    const todasFuera = g.claves.every((k) => assistDescartados.has(k));
                    const resumen = resumenDeConsecuencias(g);
                    return (
                      <div
                        key={g.fase}
                        className={cn(
                          "rounded-xl border px-3 py-2",
                          todasFuera ? "border-line bg-surface-muted opacity-60" : "border-brand/25 bg-surface-muted",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex items-center gap-1 pt-0.5">
                            <AcceptButton
                              size="xs"
                              aria-label={`Incluir todo en ${g.fase}`}
                              title="Incluir todos los cambios de esta fase"
                              disabled={!todasFuera || applying}
                              onClick={() =>
                                setAssistDescartados((prev) => {
                                  const n = new Set(prev);
                                  g.claves.forEach((k) => n.delete(k));
                                  return n;
                                })
                              }
                            />
                            <RejectButton
                              size="xs"
                              aria-label={`Descartar todo en ${g.fase}`}
                              title="Dejar afuera todos los cambios de esta fase"
                              disabled={todasFuera || applying}
                              onClick={() =>
                                setAssistDescartados((prev) => {
                                  const n = new Set(prev);
                                  g.claves.forEach((k) => n.add(k));
                                  return n;
                                })
                              }
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-fg">
                              {g.pesado && <span className="text-amber-400 mr-1">⚠</span>}
                              {g.fase}
                            </p>
                            {/* Las DECISIONES, abiertas: es lo que hay que leer. */}
                            <ul className="mt-1 space-y-0.5">
                              {g.decisiones.map((it) => {
                                const fuera = assistDescartados.has(it.key);
                                return (
                                  <li key={it.key} className="flex items-start gap-1.5">
                                    <button
                                      onClick={() =>
                                        setAssistDescartados((prev) => {
                                          const n = new Set(prev);
                                          if (fuera) n.delete(it.key);
                                          else n.add(it.key);
                                          return n;
                                        })
                                      }
                                      disabled={applying}
                                      title={fuera ? "Volver a incluir" : "Dejar este cambio afuera"}
                                      className="mt-[3px] text-[10px] text-fg-muted hover:text-fg shrink-0"
                                    >
                                      {fuera ? "☐" : "☑"}
                                    </button>
                                    <p
                                      className={cn(
                                        "text-[11px] break-words",
                                        fuera ? "text-fg-muted line-through" : "text-fg-secondary",
                                      )}
                                    >
                                      {it.titulo}
                                      {it.detalle && (
                                        <span className="text-fg-muted"> · {it.detalle}</span>
                                      )}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                            {/* Las CONSECUENCIAS, plegadas: aritmética de lo de arriba, no decisiones. */}
                            {resumen && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[11px] text-brand hover:text-brand-dark select-none">
                                  {resumen}
                                </summary>
                                <ul className="mt-1 space-y-0.5 pl-3 border-l border-line">
                                  {g.consecuencias.map((it) => (
                                    <li
                                      key={it.key}
                                      className={cn(
                                        "text-[10px] break-words",
                                        assistDescartados.has(it.key)
                                          ? "text-fg-muted line-through"
                                          : "text-fg-muted",
                                      )}
                                    >
                                      {it.pesado && <span className="text-amber-400 mr-1">⚠</span>}
                                      {it.titulo} · {it.detalle}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] text-fg-muted">
            Los estados de las tareas existentes se conservan al aplicar. Revisa el Gantt de abajo: es la propuesta.
          </p>
          </div>
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
        description="Nada de esto se aplicó todavía: revisa y confirma."
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
                <p className="text-xs text-fg-muted mt-0.5">Revisa lo que propone el agente y confirma antes de aplicar</p>
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
                        resuelve {pendingCount} {pendingCount === 1 ? "tarea" : "tareas"} para cerrarla
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
              Marca cada tarea como hecha, suspendida o pendiente. Una fase se cierra solo cuando todas sus tareas quedan resueltas. El agente propone; tú confirmas.
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
                <p className="text-xs text-fg-muted mt-0.5">Marca cuáles registrar y cuáles verá el cliente</p>
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
              El agente las infirió de las sesiones. Registra solo las reales; marca «Visible al cliente» las que quieras exponer en su cronograma.
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
          atiende, y (c) la fase estimada ya se lee en su fila (en el indicador de la fase). ⚠ La
          tarea sin validar NO tiene marca en el Gantt desde c29efc3b: se ve en la curación, antes
          de aplicar (ver el encabezado de TimelineGantt.tsx). Eran un índice permanente de marcas,
          ocupando el lugar del documento. Un aviso crónico deja de leerse a
          la semana; lo que consigue es que tampoco se lean los que sí importan. */}

      {/* ── EL cronograma. Propuesta del ASSIST (con tareas) → preview read-only swapeada.
             Propuesta de FASES guardada (handoff o reuniones) → su barra fija arriba del Gantt y
             el MISMO Gantt alterna «Ver la propuesta» (solo lectura, con marcas) ↔ «Ver como
             estaba antes» (el cronograma actual, editable). ── */}
      {/* ── INSTRUCCIONES DEL CSE PARA ESTE DOCUMENTO (X1) ─────────────────────
          Texto libre que el agente de detalle recibe como regla dura al generar/regenerar
          las tareas («las fases de QA van al final», «sin capacitaciones»). Vive en la entry
          `__doc` del canvas — no en una columna — y se pinta acá porque una instrucción que
          existe y no se ve termina re-escrita a mano en cada regeneración. */}
      {/* ── CONTEXTO DEL CRONOGRAMA (2026-09-23) ──────────────────────────────
          Las reuniones que alimentan al cronograma (la X y el «Agregar» del CSE) y sus notas a
          mano, con la caja de instrucciones de abajo como tercera pieza. Reemplaza a la caja suelta
          en el mismo lugar: arriba del documento no crece nada. */}
      {canEdit && (
        <CronogramaContextSection
          projectId={projectId}
          canEdit={canEdit}
          generado={hasAiDetail}
          instruccionesActivas={!!briefGuardado}
          onMaterial={setMaterialElegido}
        >
        <div className="rounded-xl border border-line bg-surface px-4 py-2.5">
          <button
            onClick={() => setShowBrief((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-fg hover:text-brand transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showBrief ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Instrucciones adicionales
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
                maxLength={TOPE_INSTRUCCIONES_DEL_DOC}
                placeholder='Ej.: "El pase a producción siempre es la última tarea de la fase de Entrega."'
                className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
              />
              {/* El contador y el aviso del tope (2026-09-23): lo que pasa del tope no entra —el
                  navegador lo corta al pegar y la ruta lo corta al guardar—, y sin esto nadie se
                  enteraba. El número es la MISMA constante que usa la ruta. */}
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-[10px] ${docBrief.length >= TOPE_INSTRUCCIONES_DEL_DOC ? "text-warn-ink" : "text-fg-muted"}`}
                  aria-live="polite"
                >
                  {docBrief.length.toLocaleString("es-CR")} / {TOPE_INSTRUCCIONES_DEL_DOC.toLocaleString("es-CR")}
                  {docBrief.length >= TOPE_INSTRUCCIONES_DEL_DOC && " · Llegaste al tope: lo que pegues de más no entra."}
                </p>
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
        </CronogramaContextSection>
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
            Genera el <span className="font-medium text-gray-300">Handoff</span> para ver el cronograma inicial — las fases salen de ahí.
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
      ) : proposal && !hayBorrador && proposalGantt ? (
        <TimelineGantt
          anchor={proposal.anchorStartDate ? proposal.anchorStartDate.slice(0, 10) : null}
          phases={proposalGantt}
          readOnly
        />
      ) : (
        // `space-y-4` propio: el wrapper existe para que el panel "Qué hacer acá" pueda saltar acá
        // (scrollIntoView), y replica el espaciado que estos hijos tenían sueltos en el contenedor.
        <div id="cronograma-gantt" className="space-y-4 scroll-mt-24">
          {/* Revisión de E2a: con una propuesta abierta no se ofrece (sus tareas ya se arman o ya llegaron:
              el enlace solo daba «hay una propuesta sin decidir»), y el texto dice lo mismo que el
              `disabled`: mientras la IA arma, no vuelve a decir «Genera las tareas». E2b: ni con la
              línea que ofrece las tareas (dos llamados a lo mismo). */}
          {canEdit && !hasAiDetail && !hasPublishedOnce && canGenerateTimeline && !hayBorrador && !ofrecerTareas && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-700/50 text-amber-200">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-xs leading-relaxed">
                Este cronograma inicial fue creado con la información del <span className="font-semibold">Handoff</span>.{" "}
                <button
                  type="button"
                  onClick={() => void pedirPropuestaDeDetalle("primera")}
                  disabled={armando !== null || tareasDelBorrador?.estado === "armando"}
                  className="font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-70 disabled:no-underline"
                >
                  {armando !== null || tareasDelBorrador?.estado === "armando" ? "Armando la propuesta…" : "Genera las tareas"}
                </button>{" "}
                para detallarlo y consensuar el avance con el cliente.
              </p>
            </div>
          )}
          {/* Lo que notó el paso 1 cuando no dejó propuesta (sin cambios, o lo acordado que no se pudo
              proponer): el aviso «los ves en «La IA también notó»» no puede quedar como una promesa
              rota. Se ve cuando esta pantalla ya no está pidiendo nada y no hay una barra que lo
              muestre: sin propuesta, o con el borrador vacío que espera sus tareas (no tiene barra;
              revisión de E2a). Con barra, lo muestra ella. Lo del vacío sale de lo GUARDADO, así se ve
              también al recargar (cierre de la revisión). */}
          {observacionesDeLaFranjaEnPantalla.length > 0 &&
            armando === null &&
            (!hayBorrador || !revision.resumen) && (
              <ObservacionesDelPaso1
                observaciones={observacionesDeLaFranjaEnPantalla}
                onCerrar={() => {
                  setObservacionesPaso1([]);
                  setFranjaCerradaPara(hayBorrador ? proposalMeta.current.runId : null);
                }}
              />
            )}
          {/* ⭐ LA REVISIÓN DE LA PROPUESTA DE FASES (E1 del borrador, 2026-09-24): UNA barra fija
              arriba del Gantt, con UN botón que alterna «Ver como estaba antes» ↔ «Ver la propuesta»
              sobre el MISMO Gantt (no se desmonta: las fases abiertas siguen abiertas y el scroll
              queda en su lugar), la lista numerada con casillas y el cierre antes → después.
              ⛔ La barra y el Gantt son HERMANOS dentro de este contenedor: un `sticky` no sale de su
              bloque padre, y así la barra queda fija mientras se recorre el Gantt entero. El Gantt es
              siempre el último hijo: aparecer o irse la barra no lo remonta. */}
          <div ref={revision.contenedorRef} className="space-y-3">
          {/* E2a P6: la línea de las tareas SUELTA, en el mismo lugar que la barra, cuando no hay barra
              que la lleve (ver `lineaSuelta`): «Paso 1 de 2 · Revisando…» solo con material elegido.
              Revisión de E2a: suelta, la propuesta no tiene cambios (ni de fases), así que no promete
              aplicar «solo los cambios de fases»; y con un borrador guardado trae «Descartar», que vive
              en la barra (sin él, el borrador vacío que espera tareas no tenía salida).
              E2b: «ofrecer» — sin propuesta, pide el paso 2 SALTANDO el paso 1 (si no, re-propondría
              fases en bucle), dice si se aplicaron fases, y «Ahora no» la esconde. */}
          {canEdit && lineaSuelta && (
            <LineaDeLasTareas
              estado={lineaSuelta.estado}
              fase={lineaSuelta.fase}
              motivo={lineaSuelta.motivo}
              conMaterial={materialElegido}
              conCambiosDeFases={lineaSuelta.estado === "ofrecer" && ofertaConFases}
              onAccion={
                lineaSuelta.estado === "ofrecer"
                  ? () => void pedirPropuestaDeDetalle(hasAiDetail ? "regen" : "primera", { saltarEstructura: true })
                  : armarLasTareas
              }
              onCerrar={lineaSuelta.estado === "ofrecer" ? () => setOfrecerTareas(false) : undefined}
              onDescartar={hayBorrador && !revision.resumen ? () => void discardProposal() : undefined}
              descartando={descartando}
              trabajando={armando !== null}
              suelta
            />
          )}
          {canEdit && hayBorrador && revision.resumen && (
            <RevisionDeLaPropuesta
              resumen={revision.resumen}
              vista={revision.vista}
              onAlternar={revision.alternar}
              onMarcar={revision.marcar}
              onMarcarVarios={revision.marcarVarios}
              onAplicar={() => void aplicarBorrador()}
              onDescartar={() => void discardProposal()}
              tareas={tareasDeLaBarra}
              onArmarTareas={armarLasTareas}
              enCurso={aplicandoBorrador ? "aplicar" : descartando ? "descartar" : null}
              cierreFijado={closeOverride || null}
              barraRef={revision.barraRef}
            />
          )}
          <TimelineGantt
            /* «Ver la propuesta»: el cronograma como quedaría, SOLO LECTURA y con marcas. Nunca pasa
               por `setPhases` ni por el guardado (plan §3.4): sale de `proyectar`. */
            anchor={verPropuesta && revision.proyeccion ? revision.proyeccion.ancla : anchor || null}
            phases={verPropuesta ? fasesDeLaPropuesta : ganttPhases}
            readOnly={verPropuesta || !canEdit}
            marcas={verPropuesta ? marcasDeLaPropuesta : undefined}
            canDelete={canDelete}
            onToggleStatus={toggleStatus}
            onUpdateTask={(phaseKey, taskKey, patch) => updateTask(phaseKey, taskKey, patch)}
            onAddTask={addTask}
            onUpdatePhase={updatePhase}
            onAddPhase={addPhase}
            onRemovePhase={removePhase}
            onMoveTask={moveTask}
            onReorderPhases={reorderPhases}
            onSetAnchor={verPropuesta ? undefined : setAnchorFromGantt}
            /* El cierre fijado a mano (Tanda K) se ve en LAS DOS vistas: aplicar no lo toca, así que
               es la fecha que muestra el cronograma después de aplicar. Antes la propuesta pasaba
               null y la fecha del encabezado saltaba al alternar aunque nada moviera el cierre. En la
               vista de la propuesta es de solo lectura (sin `onSetCloseOverride`). */
            closeOverride={closeOverride}
            onSetCloseOverride={verPropuesta ? undefined : setCloseOverrideFromGantt}
            onAssistPhase={
              /* Con cambios de fases sin decidir, «IA» de una fase no se ofrece: su propuesta
                 reemplazaría la de las reuniones en pantalla y aplicarla o descartarla borraba la
                 guardada (revisión adversarial, 2026-09-24; `submitAssist` también lo frena). */
              (hasAiDetail ? canRegenerateTimeline : canGenerateTimeline) && !hayBorrador
                ? (phase) => { setAssistScopePhaseId(phase.id ?? null); setAssistOpen(true); }
                : undefined
            }
            onRegeneratePhase={
              // Rehacer una fase solo tiene sentido cuando YA hay detalle IA, y queda para quien puede
              // regenerar (cronograma.regenerate). El server además exige sin-publicar / sin-avance.
              // En la vista de la propuesta, no: esa fila todavía no existe como se ve.
              // E2a: con una propuesta abierta, tampoco: hay UN borrador por proyecto, y lo que
              // «Regenerar» aplicara a esa fase quedaría debajo de la propuesta (el servidor responde 409).
              hasAiDetail && canRegenerateTimeline && !verPropuesta && !hayBorrador
                ? (phase) => void startRegenPreview(phase)
                : undefined
            }
            onOpenTask={(pk, tk) => setSelectedTask({ phaseKey: pk, taskKey: tk })}
            kickoffDate={kickoffDate || null}
            particularidades={particularidades}
            publicadas={publicadas}
            onToggleParticularidadVisible={puedeEditarElGantt ? toggleParticularidadVisible : undefined}
            onCerrarParticularidad={puedeEditarElGantt ? cerrarParticularidad : undefined}
            onEditParticularidad={puedeEditarElGantt ? setEditingParticularidadId : undefined}
            onAddParticularidad={puedeEditarElGantt ? () => setCreatingParticularidad(true) : undefined}
            sugerenciasSlot={
              // El componente se auto-oculta si no hay ninguna. Solo para quien puede editar el
              // cronograma: aprobar una sugerencia ES escribir (y en la vista de la propuesta, no).
              puedeEditarElGantt ? (
                <SugerenciasParticularidad projectId={projectId} sugerencias={sugerencias} onResolved={load} />
              ) : undefined
            }
            onConvertParticularidad={puedeEditarElGantt ? setConvertingParticularidadId : undefined}
            onOpenConvertedTask={
              verPropuesta
                ? undefined
                : (taskId) => {
                    // El id de la tarea no dice en qué fase vive; el drawer se abre por (phaseKey, taskKey).
                    for (const p of phases) {
                      const t = p.tasks.find((tk) => tk.id === taskId);
                      if (t) return setSelectedTask({ phaseKey: p._key, taskKey: t._key });
                    }
                    toast.info("Esa tarea ya no está en el cronograma.");
                  }
            }
            focusGroup={focusGroup}
          />
          </div>
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
        description="Las tareas por semana van a cruzar al cronograma que ve el cliente. Puedes seguir editándolas después."
        confirmLabel="Confirmar detalle"
        loading={confirmingDetail}
        onConfirm={async () => {
          await confirmDetail();
          setConfirmDetailOpen(false);
        }}
        onCancel={() => setConfirmDetailOpen(false)}
      />

      {/* Regen POR FASE → modal de curación viejo↔nuevo. Paso 1: la espera del preview la dice la
          franja de `ocupado`, arriba del cronograma (ya no una ventana encima). */}
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
        /* El regen POR FASE solo conoce su fase, así que el índice cross-fase se arma acá —
           es el único punto con todas las fases a la vista. Sin esto, el aviso de "esta tarea
           ya existe en otra fase" andaría en "Regenerar todo" y no acá. */
        const indice = indexarTareasPorTitulo(
          phases.filter((p) => p.id).map((p) => ({
            phaseId: p.id as string,
            phaseName: p.name,
            current: (p.tasks ?? []).filter((t) => t.id).map((t) => ({ title: t.title, status: t.status })),
          })),
        );
        return (
          <PhaseRegenModal
            open
            phaseName={regenPhase.name}
            durationWeeks={regenPhase.durationWeeks}
            current={current}
            proposed={regenPreview}
            applying={regenApplying}
            avisoRepetida={(titulo) => avisoDeRepetida(titulo, regenPhase.id ?? "", indice)}
            onCancel={() => { setRegenPhase(null); setRegenPreview(null); }}
            onApply={applyPhaseRegen}
          />
        );
      })()}

      {/* Tanda N — "Regenerar todo el cronograma" abría acá su acordeón de dos columnas
          (`AllPhasesRegenModal`), armado en memoria con el resultado del paso 2. Desde E2a
          (2026-09-25) ese resultado queda en el servidor, dentro de la MISMA propuesta que las
          fases, y se revisa en la barra de arriba del Gantt: el acordeón ya no se monta. Sus
          esperas tampoco abren una ventana encima (Elías, 2026-09-24: «que no esté en un modal o
          pop-up»): las dicen el chip del encabezado y la línea de arriba del Gantt. */}

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
        /* Mismo criterio que el modal de «Subir al cliente»: un clic afuera no cancela una
           escritura que ya salió. Se cierra solo al terminar. */
        onClose={() => {
          if (!assisting) setAssistOpen(false);
        }}
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
                Indica qué cambió en esta versión. Queda registrado con un snapshot de lo publicado
                para comparar después lo planificado contra lo real.
              </p>
            </div>
            {/* Subir queda libre con una propuesta abierta, pero se dice (respuesta 4 de Elías). */}
            {hayBorrador && (
              <p className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-warn-ink">
                {AVISO_SUBIR_CON_PROPUESTA}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {suggestingReason ? "Analizando los cambios…" : "Sugerencia automática según los cambios — edita si quieres."}
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

      {/* ⭐ Un acuerdo con operaciones entra por `aplicarOperacionesAcordadas`: un PUT directo, sin
          modelo ni vista previa (lo que se revisa es la lista numerada del chat). `submitAssist`
          queda para los acuerdos viejos con instrucción de texto. El chat acuerda; escribir sigue
          siendo de esta pantalla, con su permiso. */}
      <ChatDelAsistente
        base={`/api/projects/${projectId}`}
        pieza="timeline"
        piezaLabel="Cronograma"
        abierto={chatAbierto}
        onClose={() => setChatAbierto(false)}
        /* ⭐ DOS CARRILES. Con operaciones se ejecuta acá mismo, en milisegundos. Sin ellas —un
           acuerdo viejo, guardado como instrucción de texto— cae al modificador de siempre, que
           tarda minutos. El carril lento no se retira: hace falta cuando hay que ESCRIBIR texto
           nuevo, que ninguna operación puede hacer. */
        onAplicar={(acuerdo) =>
          Array.isArray(acuerdo.operaciones) && acuerdo.operaciones.length > 0
            ? aplicarOperacionesAcordadas(acuerdo.operaciones as Operacion[], acuerdo.resumen)
            : submitAssist(acuerdo.instruccion ?? "", null)
        }
      />
      </div>
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
