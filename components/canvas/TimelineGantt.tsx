"use client";

/**
 * components/canvas/TimelineGantt.tsx (D.1)
 *
 * EL cronograma: Gantt de semanas con edición INLINE — no hay vista de edición
 * aparte. Barras por fase coloreadas por tipo de actividad, fecha de HOY
 * siempre visible (y la semana actual resaltada si hay fecha de arranque),
 * filas expandibles con las tareas agrupadas por semana.
 *
 * Edición en el mismo Gantt (cuando no es readOnly):
 *   - título / nota / semana de cada tarea, agregar y eliminar — via callbacks
 *     del padre (CronogramaCanvas), que acumula dirty y guarda por PUT bulk.
 *   - toggle de ESTADO por tarea (PENDING→IN_PROGRESS→DONE) — inmediato vía
 *     PATCH (lo maneja el padre con update optimista). Deshabilitado en tareas
 *     sin guardar (sin id).
 *   - fecha de arranque: date input inline en el banner, SIEMPRE disponible —
 *     fijarla (label amber cuando falta) o cambiarla (input compacto). Es el
 *     único campo de estructura con control directo; el resto va por IA.
 *
 * readOnly: para la VISTA PREVIA de una propuesta de la IA (sin handlers).
 *
 * Derivados (nunca persistidos): el badge muestra el ESTADO real (pendiente /
 * en curso / hecho); si la semana ya pasó y la tarea no está DONE se marca
 * "atrasada" en rojo APARTE (tag + punto de fase + anillo de celda). Celda
 * atenuada = semana pasada o todas sus tareas DONE.
 * Las tareas needsValidation se GRITAN a propósito (fila amber + badge): si el
 * CSE confirma sin revisar, esos títulos cruzan al cliente — este tratamiento
 * es la barrera. La marca en sí nunca cruza (columna excluida del mapper externo).
 */

import { useState, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fmtDay,
  fmtFull,
  fmtLocalDay,
  addWeeks,
  plural,
  computePhaseRanges,
  timelineSpan,
  fmtPhaseRange,
  currentWeekIndex,
  absoluteWeek,
  overduePlannedEnd,
  isOverdueByDate,
} from "@/lib/timeline/weeks";
import { collectClientBlockers } from "@/lib/timeline/client-blockers";
import { summarizeParticularidades, attributionSentence } from "@/lib/timeline/particularidades-summary";
import { findDuplicateGroups } from "@/lib/timeline/particularidad-identity";
import { esCompromisoPendiente } from "@/lib/timeline/particularidad-to-task";
import { clientStatusLine } from "@/lib/timeline/client-status";
import { useHydrated } from "@/lib/hooks/useHydrated";
import AnchorDatePicker from "@/components/canvas/AnchorDatePicker";

// ── Tipos (estado de trabajo del padre — key estable, id solo si está persistida) ──

export type GanttTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "SUSPENDED";

export interface GanttTask {
  key: string;
  id?: string;
  title: string;
  weekIndex: number;
  status: GanttTaskStatus;
  notes: string | null;
  needsValidation: boolean;
  /** Procedencia (de `source`): AGENT → tag "IA", MODIFIED|HUMAN → tag "CSE". */
  source?: string;
  /** Procedencia del ESTADO/check (de `statusSource`): HUMAN = marcado por el CSE a mano;
   *  AI_CONFIRMED = avance detectado por IA y confirmado por el CSE. Distinto de `source`. */
  statusSource?: string;
  statusChangedByEmail?: string | null;
  statusChangedAt?: string | null;
  /** B — dueño en el plan compartido (chip). null/undefined = sin asignar. */
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null;
  /** ¿la tarea es una SESIÓN (reunión con el cliente) o una TAREA (acción)? */
  type?: "SESSION" | "TASK" | null;
  /** #4 — override manual de fechas (ISO o null = derivar de la semana). */
  startDateOverride?: string | null;
  dueDateOverride?: string | null;
}

export interface GanttPhase {
  key: string;
  id?: string;
  name: string;
  durationWeeks: number;
  /** Inicio explícito (offset 0-based). null = contigua tras la anterior. Habilita paralelo/solape. */
  startWeek?: number | null;
  sessionCount: number | null;
  /** Sesiones de entrega reales (CSE/dev + cliente) ejecutadas en la ventana de la fase.
   *  Solo-lectura, calculado por el server. number en fases iniciadas; null → usa el estimado. */
  actualSessionCount?: number | null;
  activityType: string | null;
  /** D.2 — avance a nivel fase: DONE = completada, IN_PROGRESS = el "hoy". */
  status?: GanttTaskStatus;
  /** El agente del handoff estimó la fase/duración sin dato real en ventas → badge "estimada". */
  needsValidation?: boolean;
  tasks: GanttTask[];
}

interface Props {
  anchor: string | null; // yyyy-mm-dd o null
  phases: GanttPhase[]; // EN ORDEN
  readOnly?: boolean; // preview de propuesta IA — sin edición ni toggles
  canDelete?: boolean; // #3 — habilita BORRAR fases/tareas (el CSE no: suspende). Default false.
  onToggleStatus?: (taskId: string, next: GanttTaskStatus) => void;
  onUpdateTask?: (phaseKey: string, taskKey: string, patch: { title?: string; notes?: string | null; weekIndex?: number; party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null; type?: "SESSION" | "TASK" | null }) => void;
  onAddTask?: (phaseKey: string, weekIndex: number) => void;
  // Nota: el borrado de tarea se hace desde el TaskDetailDrawer, no desde la fila del Gantt.
  onSetAnchor?: (isoDate: string) => void; // yyyy-mm-dd — fijar arranque desde el Gantt
  onAssistPhase?: (phase: GanttPhase) => void; // abrir el dialog de IA scopeado a esta fase
  onRegeneratePhase?: (phase: GanttPhase) => void; // regenerar (borrar+rehacer) las tareas IA de esta fase
  kickoffDate?: string | null; // yyyy-mm-dd de la sesión de kickoff — sugerencia del anchor
  // Edición DIRECTA de fases (cuando editable) — además de la barra de IA
  onUpdatePhase?: (phaseKey: string, patch: { name?: string; durationWeeks?: number; sessionCount?: number | null; startWeek?: number | null }) => void;
  onAddPhase?: () => void;
  onRemovePhase?: (phaseKey: string) => void;
  // Drag&drop de tareas: mover/reordenar dentro y entre semanas Y entre fases → persiste.
  onMoveTask?: (taskKey: string, toPhaseKey: string, toWeekIndex: number, toOrder: number) => void;
  // Drag&drop de fases: reordenar filas → persiste order.
  onReorderPhases?: (activeKey: string, overKey: string) => void;
  // Abre el drawer de detalle de una tarea (la edición completa vive ahí). Sin esto, la fila no abre.
  onOpenTask?: (phaseKey: string, taskKey: string) => void;
  // Particularidades (desviaciones curadas). El CSE ve TODAS (visibles y ocultas); el chip
  // "visible" marca las que cruzan al cliente. Vacío/undefined = no se renderiza el bloque.
  particularidades?: GanttParticularidad[];
  /** Las del `publishedSnapshot` congelado: lo que el cliente lee AHORA, distinto de lo que leerá
   *  al «Subir». Sin esto, `visibleExternal` en vivo se confunde con "ya comunicado". */
  publicadas?: Array<{ kind: string; party: string; weeksImpact: number | null }>;
  // Togglear la visibilidad al cliente de una particularidad ya creada. Sin esto, el estado
  // se muestra estático (preview readOnly). La visibilidad recién llega al cliente al «Subir».
  onToggleParticularidadVisible?: (id: string, next: boolean) => void;
  // Abrir el modal de edición de contenido de una particularidad (tipo/party/título/detalle/semanas).
  onEditParticularidad?: (id: string) => void;
  // Crear un AVISO a mano (el CSE le escribe algo al cliente). Si viene, el bloque se muestra
  // aunque no haya ninguna particularidad todavía — si no, no habría dónde poner el botón.
  onAddParticularidad?: () => void;
  // Convertir una particularidad en TAREA del cronograma (dueño + fecha). Sin esto el botón no sale.
  onConvertParticularidad?: (id: string) => void;
  // Abrir el drawer de la tarea que ya persigue este hecho (chip "→ tarea").
  onOpenConvertedTask?: (taskId: string) => void;
  /** Pedido del panel "Qué hacer acá" de ABRIR un grupo colapsado. El `nonce` existe para que
   *  re-clickear el mismo CTA vuelva a abrirlo aunque la key no haya cambiado. */
  focusGroup?: { key: string; nonce: number } | null;
}

// Forma mínima de una particularidad para el resumen + bitácora del Gantt interno.
export interface GanttParticularidad {
  id: string;
  kind: string; // ATRASO | COMPROMISO (SOLICITUD = legacy, no se crean nuevas)
  party: string; // CLIENTE | SMARTEAM | AMBOS | DEV
  title: string;
  detail: string | null;
  /** Cita interna que respalda el hecho ([fecha] «fragmento»). Solo CSE; NUNCA cruza al cliente. */
  sourceQuote?: string | null;
  weeksImpact: number | null;
  visibleExternal: boolean;
  occurredAt: string;
  /** Fase a la que el agente atribuyó el hecho. Prellena la fase al convertirlo en tarea. */
  phaseId?: string | null;
  /** Si ya se convirtió en tarea, el id de esa tarea. El hecho queda como registro de POR QUÉ pasó;
   *  la tarea es quién lo hace y para cuándo. null = nadie lo está persiguiendo. */
  convertedTaskId?: string | null;
}

// ── Metadata de tipos de actividad (color de barra + chip) ────────────────────

// 5 familias de matiz bien separadas (celeste·púrpura·naranja·verde·magenta).
// Rojo, amber y gris quedan reservados: vencida / por validar / sin tipo. El
// azul de marca (chrome interactivo, semana actual) tampoco se usa acá.
const ACTIVITY_META: Record<string, { label: string; seg: string; chip: string }> = {
  EXPLORACION:   { label: "Exploración",   seg: "bg-sky-500",     chip: "text-sky-300 bg-sky-900/30 border-sky-700/40" },
  PLANIFICACION: { label: "Planificación", seg: "bg-violet-500",  chip: "text-violet-300 bg-violet-900/30 border-violet-700/40" },
  CONFIGURACION: { label: "Configuración", seg: "bg-orange-500",  chip: "text-orange-300 bg-orange-900/30 border-orange-700/40" },
  ADOPCION:      { label: "Adopción",      seg: "bg-emerald-500", chip: "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" },
  SEGUIMIENTO:   { label: "Seguimiento",   seg: "bg-fuchsia-500", chip: "text-fuchsia-300 bg-fuchsia-900/30 border-fuchsia-700/40" },
};
const NEUTRAL_SEG = "bg-gray-600";

// ── Estado de tarea: ciclo + estilos ──────────────────────────────────────────

// Ciclo: pendiente → en curso → hecho → suspendida → pendiente. Suspender es parte del toggle.
export const NEXT_STATUS: Record<GanttTaskStatus, GanttTaskStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "SUSPENDED",
  SUSPENDED: "PENDING",
};

// Ciclo RÁPIDO del check de la fila del cronograma: pendiente → en curso → hecho → pendiente.
// Deja SUSPENDIDA afuera a propósito (aparcar una tarea es una decisión deliberada; se marca desde
// el detalle). Una tarea suspendida vuelve a pendiente al clickear el check.
export const NEXT_STATUS_QUICK: Record<GanttTaskStatus, GanttTaskStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "PENDING",
  SUSPENDED: "PENDING",
};

export const STATUS_META: Record<GanttTaskStatus, { label: string; cls: string }> = {
  PENDING:     { label: "pendiente", cls: "bg-gray-800 text-gray-400 border-gray-700" },
  IN_PROGRESS: { label: "en curso",  cls: "bg-blue-900/30 text-blue-300 border-blue-700/50" },
  DONE:        { label: "hecho",     cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" },
  SUSPENDED:   { label: "suspendida", cls: "bg-amber-900/30 text-amber-300 border-amber-700/50" },
};

// Círculo de estado tipo checklist (reusado por la fila del Gantt y el TaskDetailDrawer).
// El check está COLOREADO POR ESTADO: hecha = disco verde con check blanco; en curso = check AZUL;
// suspendida = aro ámbar con guion (aparcada); pendiente = aro gris tenue. Antes era binario y una
// tarea EN CURSO se veía igual que una PENDIENTE desde el cronograma (no se sabía si algo atrasado
// ya se estaba trabajando). "Atrasada" sigue siendo un tag aparte (es ortogonal al estado).
export function StatusCircle({ status, size = 18 }: { status: GanttTaskStatus; size?: number }) {
  const done = status === "DONE";
  if (done) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full flex-shrink-0 bg-emerald-500"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg width={size * 0.62} height={size * 0.62} fill="none" viewBox="0 0 24 24"><path stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
      </span>
    );
  }
  const tone =
    status === "IN_PROGRESS"
      ? "text-blue-400 group-hover/task:text-blue-300"
      : status === "SUSPENDED"
        ? "text-amber-400 group-hover/task:text-amber-300"
        : "text-gray-400 group-hover/task:text-gray-300";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={`flex-shrink-0 transition-colors ${tone}`}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" strokeWidth={status === "IN_PROGRESS" ? "2.5" : "2"} />
      {status === "SUSPENDED" ? (
        <path strokeLinecap="round" strokeWidth="2" d="M8.5 12h7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={status === "IN_PROGRESS" ? "2.5" : "2"} d="M8.5 12.5l2.5 2.5 4.5-5" />
      )}
    </svg>
  );
}

// B — dueño de la tarea (chip). Cliente resalta (es lo que frena); Smarteam configura; Ambos conjunto.
export const PARTY_META: Record<string, { label: string; cls: string }> = {
  CLIENTE:  { label: "Cliente",  cls: "text-amber-300 bg-amber-900/30 border-amber-700/50" },
  SMARTEAM: { label: "Smarteam", cls: "text-sky-300 bg-sky-900/30 border-sky-700/40" },
  AMBOS:    { label: "Ambos",    cls: "text-violet-300 bg-violet-900/30 border-violet-700/40" },
  DEV:      { label: "Dev",      cls: "text-indigo-300 bg-indigo-900/30 border-indigo-700/40" }, // #7 — desarrollo/integración
};
// Toda tarea TIENE dueño — el ciclo es Cliente → Smarteam → Ambos → Dev → Cliente (sin estado vacío).
// effParty resuelve null/undefined (data vieja) a SMARTEAM para que nunca se muestre "sin dueño".
type Party = "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV";
const PARTY_CYCLE = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;
export const effParty = (p: Party | null | undefined): Party =>
  p === "CLIENTE" || p === "SMARTEAM" || p === "AMBOS" || p === "DEV" ? p : "SMARTEAM";
export const nextParty = (p: Party): Party =>
  PARTY_CYCLE[(PARTY_CYCLE.indexOf(p) + 1) % PARTY_CYCLE.length];

// Tipo de tarea (chip). Sesión = reunión con el cliente (resalta); Tarea = acción (neutro).
// effType resuelve null/undefined (data vieja) a TASK. Mapeo a futuro: SESSION→Meeting, TASK→Task.
export const TYPE_META: Record<string, { label: string; cls: string }> = {
  SESSION: { label: "Sesión", cls: "text-teal-300 bg-teal-900/30 border-teal-700/40" },
  TASK:    { label: "Tarea",  cls: "text-gray-400 bg-gray-800/60 border-gray-700/50" },
};
export const effType = (t: "SESSION" | "TASK" | null | undefined): "SESSION" | "TASK" =>
  t === "SESSION" ? "SESSION" : "TASK";
export const nextType = (t: "SESSION" | "TASK"): "SESSION" | "TASK" => (t === "SESSION" ? "TASK" : "SESSION");

// Tipo de PARTICULARIDAD (desviación curada). Atraso rojo, solicitud ámbar, compromiso verde.
export const PARTICULARIDAD_KIND_META: Record<string, { label: string; cls: string }> = {
  ATRASO:     { label: "Atraso",     cls: "text-red-300 bg-red-900/30 border-red-700/40" },
  // SOLICITUD es la forma VIEJA de un compromiso (un insumo del cliente es trabajo con dueño, no
  // una desviación). En gris y marcada como vieja: en ámbar competía con COMPROMISO y se leía como
  // una categoría distinta y vigente — por eso un grupo de 4 parecía tener solo 2.
  SOLICITUD:  { label: "Compromiso (viejo)", cls: "text-gray-400 bg-gray-800/60 border-gray-700/50" },
  COMPROMISO: { label: "Compromiso", cls: "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" },
  // Nota libre del CSE al cliente: NO mueve fechas ni suma al corrimiento. Azul (informativo),
  // deliberadamente fuera de la familia rojo/verde de "se atrasó"/"acordado".
  AVISO:      { label: "Aviso",      cls: "text-blue-300 bg-blue-900/30 border-blue-700/40" },
};

// ── Drag & drop de tareas: item sortable + contenedor de semana droppable ─────
function SortableRow({
  id,
  disabled,
  data,
  children,
}: {
  id: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  children: (attributes: DraggableAttributes, listeners: DraggableSyntheticListeners) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled, data });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {children(attributes, listeners)}
    </div>
  );
}

function DroppableWeek({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "week" } });
  return (
    <div ref={setNodeRef} className={`space-y-1 rounded-lg ${isOver ? "ring-1 ring-blue-500/40 bg-blue-500/5" : ""}`}>
      {children}
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function TimelineGantt({
  anchor,
  phases,
  readOnly = false,
  canDelete = false,
  onToggleStatus,
  onUpdateTask,
  onAddTask,
  onSetAnchor,
  onAssistPhase,
  onRegeneratePhase,
  kickoffDate,
  onUpdatePhase,
  onAddPhase,
  onRemovePhase,
  onMoveTask,
  onReorderPhases,
  onOpenTask,
  particularidades,
  publicadas,
  onToggleParticularidadVisible,
  onEditParticularidad,
  onAddParticularidad,
  onConvertParticularidad,
  onOpenConvertedTask,
  focusGroup,
  // onRemoveTask removido del Gantt: el borrado de tarea vive en el TaskDetailDrawer.
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // #3 — renombrar inline: el título es TEXTO; al hacer clic se vuelve input (solo esa tarea).
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);

  const ranges = computePhaseRanges(phases);
  const total = timelineSpan(phases); // ancho de calendario (max end) — soporta fases en paralelo
  // "Hoy" es hora de pared LOCAL del usuario (a diferencia de las fechas derivadas
  // del anchor, que son días de calendario en UTC — ver lib/timeline/weeks.ts).
  // Por eso NO puede calcularse en el servidor: `curInRange` gatea nodos y el
  // Gantt viaja al cliente externo dentro de TimelineSection → mismatch de
  // hidratación. Hasta montar, `today` es null y la variante neutra no lo usa.
  const hydrated = useHydrated();
  const today = hydrated ? new Date() : null;
  const curWeek = today ? currentWeekIndex(anchor, today) : null;
  const curInRange = curWeek !== null && curWeek >= 0 && curWeek < total;
  const editable = !readOnly && !!onUpdateTask;

  // Estado en una línea, con el MISMO helper que redacta el del cliente. Antes acá decía
  // "cronograma finalizado" apenas se acababa el calendario, aunque quedaran tareas abiertas:
  // el helper exige que estén TODAS resueltas y si no dice "En cierre · quedan N".
  const tasksTotal = phases.reduce((n, p) => n + p.tasks.length, 0);
  const tasksDone = phases.reduce(
    (n, p) => n + p.tasks.filter((t) => t.status === "DONE" || t.status === "SUSPENDED").length,
    0,
  );
  const statusLine = clientStatusLine({
    curWeek,
    totalWeeks: total,
    tasksDone,
    tasksTotal,
    delayWeeks: summarizeParticularidades(particularidades ?? []).totalWeeks,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Copia de trabajo durante el arrastre de una tarea: cuando la tarea entra a otra semana/fase la
  // "adoptamos" acá para que ese contenedor abra el hueco en vivo. Null fuera del drag → se renderiza
  // `phases` (props) tal cual.
  const [dragTasks, setDragTasks] = useState<GanttPhase[] | null>(null);
  const renderPhases = dragTasks ?? phases;

  // Arrastre HORIZONTAL de la barra de una fase para fijar su inicio (paralelo). Pointer events
  // nativos (NO @dnd-kit, que está cableado para reorden vertical + move-task). Mide el ancho de
  // semana con la celda donde arranca el drag → convierte px a semanas.
  const barDrag = useRef<{ phaseKey: string; origStart: number; startX: number; weekPx: number; last: number; moved: boolean } | null>(null);
  // Mover la barra en el tiempo NO debe desplegar/colapsar la fila. Tras un drag REAL (que movió el
  // inicio) el pointerup sintetiza un click; si el drag cruzó varias celdas, ese click se dispara sobre
  // la FILA (ancestro común de press y release), no sobre una celda — por eso el guard vive en el onClick
  // de la FILA, no de la celda. Lo consumimos ahí para que la fase quede como estaba. Un click pelado en
  // la barra (sin mover) sí togglea.
  const suppressBarClick = useRef(false);
  const startBarDrag = (e: ReactPointerEvent, phaseKey: string, rangeStart: number) => {
    if (!editable || !onUpdatePhase) return;
    const weekPx = (e.currentTarget as HTMLElement).getBoundingClientRect().width;
    if (!weekPx) return;
    e.stopPropagation();
    e.preventDefault();
    suppressBarClick.current = false; // arrancar limpio: una bandera vieja no debe comerse este gesto
    barDrag.current = { phaseKey, origStart: rangeStart, startX: e.clientX, weekPx, last: rangeStart, moved: false };
    const move = (ev: PointerEvent) => {
      const d = barDrag.current;
      if (!d) return;
      const next = Math.max(0, d.origStart + Math.round((ev.clientX - d.startX) / d.weekPx));
      if (next !== d.last) {
        d.last = next;
        d.moved = true;
        onUpdatePhase(d.phaseKey, { startWeek: next });
      }
    };
    const up = () => {
      if (barDrag.current?.moved) suppressBarClick.current = true;
      barDrag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Ubicar una tarea por key en el árbol de fases (para resolver origen/destino del drag).
  const locateTask = (arr: GanttPhase[], key: string) => {
    for (let pi = 0; pi < arr.length; pi++) {
      const ti = arr[pi].tasks.findIndex((t) => t.key === key);
      if (ti >= 0) return { pi, ti, task: arr[pi].tasks[ti] };
    }
    return null;
  };

  // Colisión filtrada por tipo: una FASE solo cae sobre fases; una TAREA sobre tareas o semanas.
  // Permite tener fases (sortable) y tareas (sortable, multi-contenedor) en UN solo DndContext.
  const collisionStrategy: CollisionDetection = (args) => {
    const type = args.active.data.current?.type;
    if (!type) return closestCorners(args);
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const ct = c.data.current?.type;
        return type === "phase" ? ct === "phase" : ct === "task" || ct === "week";
      }),
    });
  };

  // Durante el arrastre: solo movemos la tarea entre CONTENEDORES (fase+semana). Dentro del mismo
  // contenedor el SortableContext anima el hueco solo (y evitamos un loop de re-render). Al cruzar
  // a otra semana/fase, "adoptamos" la tarea en la copia de trabajo → ese contenedor abre el hueco.
  const handleDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type !== "task") return;
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);
    if (overId === activeKey) return;
    const base = dragTasks ?? phases;
    const from = locateTask(base, activeKey);
    if (!from) return;

    let toPi: number;
    let toWeek: number;
    let overTaskKey: string | null = null;
    if (overId.includes("::w")) {
      const sep = overId.lastIndexOf("::w");
      toPi = base.findIndex((p) => p.key === overId.slice(0, sep));
      toWeek = parseInt(overId.slice(sep + 3), 10);
    } else {
      const ov = locateTask(base, overId);
      if (!ov) return;
      toPi = ov.pi;
      toWeek = ov.task.weekIndex;
      overTaskKey = overId;
    }
    if (toPi < 0) return;
    if (from.pi === toPi && from.task.weekIndex === toWeek) return; // mismo contenedor

    const next = base.map((p) => ({ ...p, tasks: p.tasks.filter((t) => t.key !== activeKey) }));
    const updatedTask = { ...from.task, weekIndex: toWeek };
    const targetTasks = next[toPi].tasks;
    let arrIdx: number;
    if (overTaskKey) {
      arrIdx = targetTasks.findIndex((t) => t.key === overTaskKey);
      if (arrIdx < 0) arrIdx = targetTasks.length;
    } else {
      arrIdx = targetTasks.length;
      for (let j = targetTasks.length - 1; j >= 0; j--) {
        if (targetTasks[j].weekIndex === toWeek) { arrIdx = j + 1; break; }
      }
    }
    targetTasks.splice(arrIdx, 0, updatedTask);
    next[toPi] = { ...next[toPi], tasks: targetTasks };
    setDragTasks(next);
  };

  // Al soltar: ruteo por data.type. Para tareas, la posición final sale de la copia de trabajo
  // (donde onDragOver ya dejó la tarea en su contenedor) afinada por el `over` del drop.
  const handleDragEnd = (event: DragEndEvent) => {
    const base = dragTasks;
    setDragTasks(null);
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);

    if (active.data.current?.type === "phase") {
      if (onReorderPhases && activeKey !== overId) onReorderPhases(activeKey, overId);
      return;
    }
    if (!onMoveTask) return;

    const src = base ?? phases;
    const from = locateTask(src, activeKey);
    if (!from) return;
    if (!base && overId === activeKey) return; // soltó en el mismo sitio sin cruzar nada

    let toPhaseKey: string;
    let toWeek: number;
    let toOrder: number;
    if (overId.includes("::w")) {
      const sep = overId.lastIndexOf("::w");
      toPhaseKey = overId.slice(0, sep);
      toWeek = parseInt(overId.slice(sep + 3), 10);
      const tp = src.find((p) => p.key === toPhaseKey);
      toOrder = tp ? tp.tasks.filter((t) => t.weekIndex === toWeek && t.key !== activeKey).length : 0;
    } else if (overId === activeKey) {
      // soltó sobre la propia tarea ya reubicada por onDragOver → su posición actual.
      toPhaseKey = src[from.pi].key;
      toWeek = from.task.weekIndex;
      toOrder = src[from.pi].tasks.filter((t, j) => t.weekIndex === toWeek && j < from.ti).length;
    } else {
      const ov = locateTask(src, overId);
      if (!ov) return;
      toPhaseKey = src[ov.pi].key;
      toWeek = ov.task.weekIndex;
      if (from.pi === ov.pi && from.task.weekIndex === toWeek) {
        // misma fase + semana → arrayMove (arriba/abajo sin off-by-one).
        const weekKeys = src[ov.pi].tasks.filter((t) => t.weekIndex === toWeek).map((t) => t.key);
        const oldI = weekKeys.indexOf(activeKey);
        const newI = weekKeys.indexOf(overId);
        toOrder = oldI >= 0 && newI >= 0 ? arrayMove(weekKeys, oldI, newI).indexOf(activeKey) : weekKeys.length;
      } else {
        const targetKeys = src[ov.pi].tasks.filter((t) => t.weekIndex === toWeek && t.key !== activeKey).map((t) => t.key);
        const idx = targetKeys.indexOf(overId);
        toOrder = idx < 0 ? targetKeys.length : idx;
      }
    }
    onMoveTask(activeKey, toPhaseKey, toWeek, toOrder);
  };

  if (phases.length === 0 || total === 0) return null;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const gridCols = { gridTemplateColumns: `minmax(240px, 380px) repeat(${total}, minmax(26px, 1fr))` };

  return (
    // data-fixed-light: el Cronograma interno debe verse SIEMPRE CLARO (igual que el del
    // cliente), sin importar el tema. El remap claro de `html.light` (globals.css) se extiende
    // a este subárbol vía `:is(html.light, [data-fixed-light])`, así la viz queda clara también
    // en modo oscuro.
    <div className="space-y-3" data-fixed-light>
      {/* Fecha de hoy — visible apenas hidrata (depende de la zona del usuario) + leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {today && (
          <span className="flex items-center gap-2 text-xs font-bold text-blue-300 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-1.5">
            {curInRange && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
              </span>
            )}
            Hoy: {fmtLocalDay(today)}
            {curInRange && <span className="font-extrabold">· Semana S{curWeek as number}</span>}
            {anchor && curWeek !== null && curWeek < 0 && (
              <span className="font-medium text-blue-400/90">· el proyecto arranca el {fmtFull(anchor)}</span>
            )}
          </span>
        )}
        {/* Cómo va esto, en una línea: semana, tareas y si vamos al día. Es lo primero que el CSE
            necesita para orientarse, y hasta ahora había que deducirlo mirando el Gantt entero. */}
        {statusLine && (
          <span className="text-xs font-semibold text-gray-300 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
            {statusLine}
          </span>
        )}
        {onSetAnchor && (
          <span id="cronograma-arranque" className="scroll-mt-24">
            <AnchorDatePicker value={anchor ?? ""} onChange={onSetAnchor} />
          </span>
        )}

        {/* Sugerencia: fecha de la sesión de kickoff. Aparece si difiere del anchor
            actual (incl. cuando está vacío). Un click la fija; se guarda con «Guardar». */}
        {onSetAnchor && kickoffDate && kickoffDate !== anchor && (
          <button
            type="button"
            onClick={() => onSetAnchor(kickoffDate)}
            title="Usar la fecha de la sesión de kickoff como arranque"
            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-300 bg-blue-900/30 border border-blue-700/40 hover:bg-blue-900/50 rounded-lg px-2.5 py-1 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Kickoff: {fmtFull(kickoffDate)} · usar
          </button>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {Object.values(ACTIVITY_META).map((m) => (
            <span key={m.label} className="flex items-center gap-1.5">
              <span className={`w-6 h-1.5 rounded ${m.seg} inline-block`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{m.label}</span>
            </span>
          ))}
        </span>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-x-auto">
        <div style={{ minWidth: Math.max(640, 300 + total * 34) }}>
          {/* Cabecera de semanas */}
          <div className="grid gap-1 items-center px-4 py-2.5 border-b border-gray-800 bg-gray-800/60" style={gridCols}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Fase</div>
            {Array.from({ length: total }).map((_, w) => {
              const isCur = curWeek === w;
              return (
                <div
                  key={w}
                  className={`text-center leading-tight rounded py-0.5 ${
                    isCur ? "bg-blue-900/50 text-blue-300 timeline-now-pulse" : "text-gray-500"
                  }`}
                >
                  <div className="text-[10px] font-bold">S{w}</div>
                  {anchor && <div className="text-[9px] text-gray-600">{fmtDay(addWeeks(anchor, w))}</div>}
                </div>
              );
            })}
          </div>

          {/* Filas de fases */}
          <div className="px-4 py-2 space-y-0.5">
            <DndContext sensors={sensors} collisionDetection={collisionStrategy} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => setDragTasks(null)}>
            <SortableContext items={renderPhases.map((ph) => ph.key)} strategy={verticalListSortingStrategy}>
            {renderPhases.map((p, i) => {
              const range = ranges[i];
              const meta = p.activityType ? ACTIVITY_META[p.activityType] : null;
              const isOpen = expanded.has(p.key);
              const hasOverdue = p.tasks.some((t) =>
                isOverdueByDate(overduePlannedEnd(anchor, range.start, t.weekIndex), today, t.status),
              );

              const tasksByWeek = new Map<number, GanttTask[]>();
              for (const t of p.tasks) {
                const arr = tasksByWeek.get(t.weekIndex) ?? [];
                arr.push(t);
                tasksByWeek.set(t.weekIndex, arr);
              }

              return (
                <SortableRow key={p.key} id={p.key} data={{ type: "phase" }} disabled={!editable || !onReorderPhases}>
                {(attributes, listeners) => (
                <div>
                  {/* Fila del grid */}
                  <div
                    onClick={() => {
                      // Si venimos de mover la barra en el tiempo (drag real), nos comemos este click
                      // sintético para que la fila quede como estaba (no se despliega ni colapsa).
                      if (suppressBarClick.current) {
                        suppressBarClick.current = false;
                        return;
                      }
                      toggleExpand(p.key);
                    }}
                    className="grid gap-1 items-center px-2 py-1.5 -mx-2 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors group"
                    style={gridCols}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-300 group-hover:text-white">
                        {editable && onReorderPhases && (
                          <button
                            {...attributes}
                            {...listeners}
                            onClick={(e) => e.stopPropagation()}
                            title="Arrastrar para reordenar la fase"
                            className="flex-shrink-0 cursor-grab touch-none text-gray-600 hover:text-gray-400"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>
                          </button>
                        )}
                        <svg
                          className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        {editable && onUpdatePhase ? (
                          <input
                            value={p.name}
                            onChange={(e) => onUpdatePhase(p.key, { name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Nombre de la fase"
                            className="flex-1 min-w-[12rem] bg-transparent border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none pb-0.5 text-gray-200"
                          />
                        ) : (
                          <span className="flex-1 min-w-[12rem] break-words">{p.name}</span>
                        )}
                        {(onAssistPhase || onRegeneratePhase || (editable && canDelete && onRemovePhase)) && (
                          <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                            {onAssistPhase && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAssistPhase(p); }}
                                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-300"
                                title="Editar esta fase con IA"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                IA
                              </button>
                            )}
                            {onRegeneratePhase && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRegeneratePhase(p); }}
                                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-300"
                                title="Regenerar (rehacer) las tareas de esta fase con IA"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Regenerar
                              </button>
                            )}
                            {editable && canDelete && onRemovePhase && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRemovePhase(p.key); }}
                                className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Eliminar fase"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="ml-[18px] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {editable && onUpdatePhase ? (
                          <span className="flex items-center gap-1.5 text-[10px] text-gray-500" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number" min={1}
                              value={p.durationWeeks}
                              onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1) onUpdatePhase(p.key, { durationWeeks: v }); }}
                              className="w-9 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-blue-500"
                              title="Duración en semanas"
                            />
                            <span>sem</span>
                            <span className="text-gray-700">·</span>
                            {p.actualSessionCount != null ? (
                              <span className="text-gray-400 font-medium" title="Sesiones de entrega ejecutadas (CSE/Dev + cliente) en la ventana de la fase — calculado">
                                {p.actualSessionCount} ses
                              </span>
                            ) : (
                              <>
                                <input
                                  type="number" min={1}
                                  value={p.sessionCount ?? ""}
                                  placeholder="—"
                                  onChange={(e) => { const v = e.target.value === "" ? null : parseInt(e.target.value, 10); onUpdatePhase(p.key, { sessionCount: v }); }}
                                  className="w-9 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-blue-500"
                                  title="Sesiones estimadas (opcional)"
                                />
                                <span>ses</span>
                              </>
                            )}
                            <span className="text-gray-700">·</span>
                            <span className="text-gray-600">inicia S</span>
                            <input
                              type="number" min={1}
                              value={p.startWeek != null ? p.startWeek + 1 : ""}
                              placeholder="auto"
                              onChange={(e) => { const raw = e.target.value === "" ? null : parseInt(e.target.value, 10); onUpdatePhase(p.key, { startWeek: raw != null && raw >= 1 ? raw - 1 : null }); }}
                              className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-300 focus:outline-none focus:border-blue-500"
                              title="Inicio de la fase (n° de semana). Vacío = automático (tras la fase anterior). Igualá el de otra fase para correr EN PARALELO."
                            />
                            <span className="text-gray-700 ml-1">{fmtPhaseRange(anchor, range)}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-600">
                            {fmtPhaseRange(anchor, range)}
                            {p.actualSessionCount != null && ` · ${plural(p.actualSessionCount, "sesión", "sesiones")}`}
                            {p.tasks.length > 0 && ` · ${plural(p.tasks.length, "tarea", "tareas")}`}
                          </span>
                        )}
                        {/* Etiquetas a la derecha: estado + tipo de actividad + estimada + atraso */}
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                          {p.status === "DONE" && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-emerald-300 bg-emerald-900/30 border-emerald-700/40" title="Fase completada">
                              ✓ Completada
                            </span>
                          )}
                          {p.status === "IN_PROGRESS" && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-blue-300 bg-blue-900/30 border-blue-700/40" title="Fase en curso (hoy)">
                              ● En curso
                            </span>
                          )}
                          {meta && (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${meta.chip}`}>
                              {meta.label}
                            </span>
                          )}
                          {p.needsValidation && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-amber-300 bg-amber-900/30 border-amber-700/40" title="El agente estimó esta fase/duración sin datos de tiempos en ventas — confirmá y ajustá">
                              ⚠ Estimada
                            </span>
                          )}
                          {hasOverdue && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Tareas vencidas" />
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Celdas de semanas */}
                    {Array.from({ length: total }).map((_, w) => {
                      const inRange = w >= range.start && w < range.end;
                      if (!inRange) return <div key={w} className="h-3 rounded bg-gray-800/70" />;

                      const relWeek = w - range.start;
                      const weekTasks = tasksByWeek.get(relWeek) ?? [];
                      const allDone = weekTasks.length > 0 && weekTasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
                      const isPast = curWeek !== null && w < curWeek;
                      const isCur = curWeek === w;
                      const weekOverdue = weekTasks.some((t) => isOverdueByDate(overduePlannedEnd(anchor, range.start, relWeek), today, t.status));

                      return (
                        <div
                          key={w}
                          onPointerDown={editable && onUpdatePhase ? (e) => startBarDrag(e, p.key, range.start) : undefined}
                          className={`h-3 rounded transition-all ${meta?.seg ?? NEUTRAL_SEG} ${
                            allDone || isPast ? "opacity-35" : ""
                          } ${isCur ? "timeline-now-pulse" : ""} ${
                            weekOverdue && !isCur ? "ring-1 ring-red-500/80" : ""
                          } ${editable && onUpdatePhase ? "cursor-ew-resize touch-none" : ""}`}
                          title={editable && onUpdatePhase ? `S${w} — arrastrá para mover el inicio de la fase` : `S${w}${weekTasks.length ? ` · ${weekTasks.length} tareas` : ""}`}
                        />
                      );
                    })}
                  </div>

                  {/* Expandido: tareas por semana (edición inline) */}
                  {isOpen && (
                    <div className="ml-7 mr-2 mb-3 mt-1 border-l-2 border-gray-700 pl-4 space-y-3">
                      {Array.from({ length: p.durationWeeks }).map((_, relWeek) => {
                        const weekTasks = tasksByWeek.get(relWeek) ?? [];
                        if (weekTasks.length === 0 && !editable) return null;
                        const absW = absoluteWeek(range.start, relWeek);
                        return (
                          <div key={relWeek}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-dashed border-gray-700 pb-1 mb-1.5 flex items-center">
                              <span>
                                Semana {relWeek + 1}
                                <span className="text-gray-600 font-semibold ml-2">
                                  S{absW}
                                  {anchor && ` · ${fmtDay(addWeeks(anchor, absW))} – ${fmtDay(addWeeks(anchor, absW + 1))}`}
                                </span>
                              </span>
                              {editable && onAddTask && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onAddTask(p.key, relWeek); }}
                                  className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-300 normal-case tracking-normal transition-colors"
                                  title="Agregar tarea en esta semana"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                                  tarea
                                </button>
                              )}
                            </p>
                            <DroppableWeek id={`${p.key}::w${relWeek}`}>
                            <SortableContext items={weekTasks.map((wt) => wt.key)} strategy={verticalListSortingStrategy}>
                              {weekTasks.map((t) => {
                                const overdue = isOverdueByDate(overduePlannedEnd(anchor, range.start, relWeek), today, t.status);
                                const canToggle = !readOnly && !!onToggleStatus && !!t.id;
                                return (
                                  <SortableRow key={t.key} id={t.key} data={{ type: "task" }} disabled={!editable || !onMoveTask}>
                                  {(attributes, listeners) => (
                                  <div
                                    onClick={() => { if (!readOnly && onOpenTask) onOpenTask(p.key, t.key); }}
                                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 group/task hover:bg-gray-800/50 ${!readOnly && onOpenTask ? "cursor-pointer" : ""}`}
                                  >
                                    {editable && onMoveTask && (
                                      <button
                                        {...attributes}
                                        {...listeners}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Arrastrar para reordenar o mover de semana"
                                        className="flex-shrink-0 cursor-grab touch-none text-gray-600 hover:text-gray-400 opacity-0 group-hover/task:opacity-100 transition-opacity"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>
                                      </button>
                                    )}
                                    {/* Círculo de estado (checklist) — clic CICLA pendiente → en curso → hecha
                                        (sin abrir el drawer), para poder marcar "en curso" desde el cronograma.
                                        Suspender queda en el detalle de la tarea. */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (canToggle) onToggleStatus!(t.id!, NEXT_STATUS_QUICK[t.status]);
                                      }}
                                      disabled={!canToggle}
                                      title={
                                        !t.id
                                          ? "Guardá el cronograma para poder cambiar el estado"
                                          : `Estado: ${STATUS_META[t.status].label} — clic para marcar como ${STATUS_META[NEXT_STATUS_QUICK[t.status]].label}`
                                      }
                                      className={`flex-shrink-0 ${!canToggle ? "opacity-50 cursor-default" : "cursor-pointer"}`}
                                    >
                                      <StatusCircle status={t.status} />
                                    </button>
                                    {/* Título — TEXTO por defecto; clic en el nombre (cuando se puede editar) lo
                                        vuelve input solo para esa tarea. El clic no burbujea para no abrir el drawer. */}
                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                      {editable && editingTitleKey === t.key ? (
                                        <input
                                          value={t.title}
                                          onChange={(e) => onUpdateTask(p.key, t.key, { title: e.target.value })}
                                          onClick={(e) => e.stopPropagation()}
                                          onBlur={() => setEditingTitleKey(null)}
                                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                          autoFocus
                                          placeholder="Título de la tarea"
                                          // Auto-ancho al contenido: `size` (en caracteres) sigue al texto; crece al tipear
                                          // (value controlado → re-render). max-w-full evita desbordar la fila.
                                          size={Math.max(t.title.length, 8)}
                                          className={`max-w-full bg-transparent text-xs border-b border-blue-500 focus:outline-none ${t.status === "DONE" || t.status === "SUSPENDED" ? "text-gray-500 line-through" : "text-gray-300"}`}
                                        />
                                      ) : (
                                        <span
                                          onClick={editable ? (e) => { e.stopPropagation(); setEditingTitleKey(t.key); } : undefined}
                                          title={editable ? "Clic para renombrar" : undefined}
                                          className={`min-w-0 truncate text-xs ${editable ? "cursor-text hover:underline decoration-dotted underline-offset-2" : ""} ${t.status === "DONE" || t.status === "SUSPENDED" ? "text-gray-500 line-through" : "text-gray-300"}`}
                                        >
                                          {t.title?.trim() ? t.title : <span className="text-gray-600 italic">Sin título</span>}
                                        </span>
                                      )}
                                      {/* "En curso" convive con "Atrasada": una tarea atrasada que YA se está
                                          trabajando muestra ambos tags, y así no se confunde con una pendiente. */}
                                      {t.status === "IN_PROGRESS" && (
                                        <span
                                          className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${STATUS_META.IN_PROGRESS.cls}`}
                                          title="Ya se está trabajando (no está solo pendiente)"
                                        >
                                          En curso
                                        </span>
                                      )}
                                      {overdue && (
                                        <span
                                          className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border text-red-300 bg-red-900/30 border-red-700/50"
                                          title="La fecha de esta tarea ya pasó y todavía no está hecha"
                                        >
                                          Atrasada
                                        </span>
                                      )}
                                    </div>
                                    {/* Chips informativos (read-only en la fila; se editan en el drawer) */}
                                    {effType(t.type) === "SESSION" && (
                                      <span
                                        className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${TYPE_META.SESSION.cls}`}
                                        title="Sesión / reunión con el cliente"
                                      >
                                        {TYPE_META.SESSION.label}
                                      </span>
                                    )}
                                    <span
                                      className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${PARTY_META[effParty(t.party)].cls}`}
                                      title="Responsable de la tarea"
                                    >
                                      {PARTY_META[effParty(t.party)].label}
                                    </span>
                                  </div>
                                  )}
                                  </SortableRow>
                                );
                              })}
                              {weekTasks.length === 0 && editable && (
                                <p className="text-[11px] text-gray-700 px-2.5">Sin tareas esta semana.</p>
                              )}
                            </SortableContext>
                            </DroppableWeek>
                          </div>
                        );
                      })}
                      {p.tasks.length === 0 && !editable && (
                        <p className="text-xs text-gray-600 py-1">Sin tareas.</p>
                      )}
                    </div>
                  )}
                </div>
                )}
                </SortableRow>
              );
            })}
            </SortableContext>
            </DndContext>
            {editable && onAddPhase && (
              <button
                onClick={onAddPhase}
                className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>
                Agregar fase
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pendientes del CLIENTE atrasados — al pie, para que el CSE señale de un vistazo lo que
          frena la implementación. Mismo criterio de atraso (isOverdue por semana) que el tag rojo
          inline. Solo aparece si hay ≥1 y tras hidratar (necesita el "hoy" del cliente). */}
      {(() => {
        const blockers = collectClientBlockers(phases, anchor, today);
        if (blockers.length === 0) return null;
        return (
          <div id="cronograma-pendientes-cliente" className="scroll-mt-24 rounded-2xl border border-amber-700/50 bg-amber-900/15 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Pendiente del cliente · atrasadas
              </span>
              <span className="text-[10px] font-semibold text-amber-400/80 bg-amber-900/40 border border-amber-700/40 rounded-full px-2 py-0.5">
                {blockers.length}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {blockers.map((b) => {
                const clickable = !readOnly && !!onOpenTask && !!b.task.key;
                return (
                  <li key={b.task.key ?? `${b.phase.key}-${b.absWeek}-${b.task.title}`}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={clickable ? () => onOpenTask!(b.phase.key, b.task.key!) : undefined}
                      className={`w-full flex flex-wrap items-center gap-2 text-left px-2 py-1.5 rounded-lg ${clickable ? "hover:bg-amber-900/25 cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="text-sm text-gray-200 flex-1 min-w-0">{b.task.title}</span>
                      <span className="text-[11px] text-gray-500">{b.phaseName}</span>
                      <span className="text-[10px] font-semibold text-red-300">
                        {b.weeksLate >= 1 ? `hace ${plural(b.weeksLate, "semana", "semanas")}` : ""}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${PARTY_META.CLIENTE.cls}`}>
                        {PARTY_META.CLIENTE.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}

      {/* Particularidades — desviaciones curadas con atribución. Resumen (corrimiento acumulado
          por responsable) + bitácora legible. El CSE ve TODAS; el chip "visible" marca las que
          cruzan al cliente. Espejo light en TimelineSection (la matemática es única: helper puro). */}
      {(() => {
        const parts = particularidades ?? [];
        // Con cero particularidades el bloque desaparecía — y entonces no había dónde colgar
        // "Agregar aviso". Si el CSE puede crear, el bloque se muestra igual (vacío, con el botón).
        if (parts.length === 0 && !onAddParticularidad) return null;
        // ── TRES números distintos, y confundirlos era el defecto ─────────────────────────────
        // REGISTRADO  = todas las filas. Lo que sabemos internamente.
        // LISTO       = las marcadas visibles PERO todavía no publicadas. Lo que leerá al «Subir».
        // COMUNICADO  = las del snapshot congelado. Lo que el cliente tiene delante AHORA.
        // Antes se rotulaba "El cliente lee:" a las visibles EN VIVO: marcabas tres, no publicabas,
        // y la pantalla te decía que el cliente ya las había visto.
        const summary = summarizeParticularidades(parts);
        const sentence = attributionSentence(summary, { audience: "interno" });
        const registrado = summary.totalWeeks;
        const listo = summarizeParticularidades(parts.filter((p) => p.visibleExternal)).totalWeeks;
        const comunicado = summarizeParticularidades(publicadas ?? []).totalWeeks;
        const hayPendienteDeSubir = listo !== comunicado;
        // El id de abajo es el destino de los CTA del panel "Qué hacer acá". Sin él, "Cuantificar"
        // scrolleaba al tope de un Gantt altísimo y el CSE tenía que cazar la fila.
        return (
          <div id="cronograma-particularidades" className="scroll-mt-24 rounded-2xl border border-gray-800 bg-gray-900/40 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300">
                Particularidades del cronograma
              </span>
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-800/60 border border-gray-700/50 rounded-full px-2 py-0.5">
                {parts.length}
              </span>
              {onAddParticularidad && (
                <button
                  onClick={onAddParticularidad}
                  title="Escribirle al cliente un aviso sobre el cronograma"
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-light transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar aviso
                </button>
              )}
            </div>
            {parts.length === 0 && (
              <p className="text-[11px] text-fg-muted leading-relaxed">
                Todavía no hay avisos. Agregá uno para contarle al cliente algo del cronograma — por
                ejemplo una pausa, un cambio de contacto o un acuerdo de la última sesión.
              </p>
            )}
            {sentence && (
              <p className="text-sm text-gray-200 mb-3 leading-relaxed">{sentence}</p>
            )}
            {/* Los tres números, nombrados. Solo aparece cuando difieren: si registrado == comunicado
                no hay nada que aclarar. */}
            {(registrado !== comunicado || hayPendienteDeSubir) && (
              <p className="text-[11px] text-gray-400 mb-3 leading-relaxed flex flex-wrap gap-x-3 gap-y-0.5">
                <span>
                  <span className="font-semibold text-gray-300">El cliente lee:</span>{" "}
                  {comunicado > 0 ? plural(comunicado, "semana", "semanas") : "ningún atraso"}
                </span>
                {hayPendienteDeSubir && (
                  <span title="Marcado como visible, pero el cliente no lo ve hasta el «Subir al cliente»">
                    <span className="font-semibold text-gray-300">Listo para subir:</span>{" "}
                    {listo > 0 ? plural(listo, "semana", "semanas") : "nada"}
                  </span>
                )}
                <span>
                  <span className="font-semibold text-gray-300">Registrado:</span>{" "}
                  {plural(registrado, "semana", "semanas")}
                </span>
              </p>
            )}
            {/* Agrupado por ESTADO DE LA FILA, no por visibilidad. La pregunta que el CSE se hace
                al entrar es "¿esto me pide algo o es registro?", y los grupos viejos (visibilidad +
                cuantificación) cruzaban dos ejes sin contestar ninguno.
                Cuando el triage termina, los dos primeros grupos DESAPARECEN y queda uno cerrado:
                ése es el estado "esto está sano", que antes la pantalla no sabía expresar. */}
            <div className="flex flex-col gap-1">
              {(() => {
                const dupIds = new Set(findDuplicateGroups(parts).flat().map((p) => p.id));
                // Mismo predicado que el contador del panel — importado, no reescrito: el botón
                // "6 compromisos sin tarea" tiene que traerte a un grupo que diga 6.
                const esCompromiso = esCompromisoPendiente;
                const paraArreglar = (p: GanttParticularidad) =>
                  dupIds.has(p.id) || (!p.weeksImpact && (p.kind === "ATRASO" || !!p.convertedTaskId));

                const compromisos = parts.filter(esCompromiso);
                const arreglar = parts.filter((p) => !esCompromiso(p) && paraArreglar(p));
                const historia = parts.filter((p) => !esCompromiso(p) && !paraArreglar(p));

                return [
                  {
                    key: "compromisos",
                    title: "Compromisos sin dueño",
                    hint: "Alguien se comprometió a algo y no hay ninguna tarea persiguiéndolo.",
                    items: compromisos,
                  },
                  {
                    key: "arreglar",
                    title: "Filas para arreglar",
                    hint: "No suman al total de atraso, lo inflan, o ya no deberían existir. Ponele semanas" +
                      " si ya sabés cuánto movió el plan; si todavía no es un atraso sino algo que alguien" +
                      " tiene que averiguar, convertila en tarea.",
                    items: arreglar,
                  },
                  {
                    key: "historia",
                    title: "Lo que ya pasó",
                    hint: "Registro fechado. No piden acción: explican por qué se movió el plan.",
                    items: historia,
                    // El histórico NUNCA abre solo: es lo único que no pide nada.
                    forceClosed: true,
                  },
                ]
                  .filter((g) => g.items.length > 0)
                  .map((g) => (
                    <ParticularidadGroup
                      key={g.key}
                      groupKey={g.key}
                      title={g.title}
                      hint={g.hint}
                      items={g.items}
                      // Un grupo de acción con 20 filas sepulta el resto de la pantalla; el contador
                      // del encabezado ya dice cuántas son.
                      defaultOpen={!g.forceClosed && g.items.length <= 8}
                      focusGroup={focusGroup}
                      onToggleParticularidadVisible={onToggleParticularidadVisible}
                      onEditParticularidad={onEditParticularidad}
                      onConvertParticularidad={onConvertParticularidad}
                      onOpenConvertedTask={onOpenConvertedTask}
                    />
                  ));
              })()}
            </div>
            {onToggleParticularidadVisible && (
              <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-800 leading-relaxed">
                La visibilidad al cliente se aplica al «Subir al cliente».
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/** Cuántas filas del histórico se muestran antes del "Ver las N restantes". */
const HISTORIA_VISIBLES = 8;

/**
 * Un grupo colapsable de particularidades. Existe porque la lista plana no se podía leer: 13 ítems
 * en orden cronológico inverso, todos con el mismo peso, sin decir cuál pide acción. Cada grupo
 * responde a UNA pregunta —¿esto pide algo? ¿esto está mal cargado? ¿esto es historia?— y solo los
 * que piden acción arrancan abiertos.
 */
function ParticularidadGroup({
  groupKey,
  title,
  hint,
  items,
  defaultOpen,
  focusGroup,
  onToggleParticularidadVisible,
  onEditParticularidad,
  onConvertParticularidad,
  onOpenConvertedTask,
}: {
  groupKey: string;
  title: string;
  hint: string | null;
  items: GanttParticularidad[];
  defaultOpen: boolean;
  focusGroup?: { key: string; nonce: number } | null;
  onToggleParticularidadVisible?: (id: string, next: boolean) => void;
  onEditParticularidad?: (id: string) => void;
  onConvertParticularidad?: (id: string) => void;
  onOpenConvertedTask?: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [verTodas, setVerTodas] = useState(false);

  // El panel "Qué hacer acá" pide abrir este grupo. Depende del `nonce` y no de la key, para que
  // re-clickear el mismo CTA vuelva a abrirlo después de que el CSE lo cerró a mano.
  // Ajuste DURANTE el render (patrón de React para "estado derivado de una prop que cambió") en vez
  // de un efecto: con efecto se pinta el grupo cerrado y recién después se abre.
  const focusNonce = focusGroup?.key === groupKey ? focusGroup.nonce : null;
  const [lastNonce, setLastNonce] = useState(focusNonce);
  if (focusNonce !== null && focusNonce !== lastNonce) {
    setLastNonce(focusNonce);
    setOpen(true);
  }

  // Una bitácora no se pagina: se lee por reciente o no se lee. Se trunca y se expande in-place.
  const truncado = !verTodas && items.length > HISTORIA_VISIBLES;
  const visibles = truncado ? items.slice(0, HISTORIA_VISIBLES) : items;

  return (
    <div className="rounded-xl border border-gray-800/80 bg-gray-900/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/40 rounded-xl transition-colors"
      >
        <svg
          className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300">{title}</span>
        <span className="text-[10px] font-semibold text-gray-400 bg-gray-800/60 border border-gray-700/50 rounded-full px-1.5">
          {items.length}
        </span>
        {hint && !open && <span className="text-[11px] text-gray-500 truncate">{hint}</span>}
      </button>
      {open && (
        <>
          {hint && <p className="text-[11px] text-gray-500 px-3 pb-1 leading-relaxed">{hint}</p>}
          <ul className="flex flex-col gap-1.5 px-1 pb-2">
            {visibles.map((pt) => (
              <ParticularidadRow
                key={pt.id}
                pt={pt}
                onToggleParticularidadVisible={onToggleParticularidadVisible}
                onEditParticularidad={onEditParticularidad}
                onConvertParticularidad={onConvertParticularidad}
                onOpenConvertedTask={onOpenConvertedTask}
              />
            ))}
          </ul>
          {truncado && (
            <button
              type="button"
              onClick={() => setVerTodas(true)}
              className="w-full text-[11px] font-semibold text-gray-400 hover:text-gray-200 px-3 pb-2 text-left"
            >
              Ver las {items.length - HISTORIA_VISIBLES} restantes
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Una particularidad: tipo · título · semanas · quién causó · visibilidad · convertir · editar · cita. */
function ParticularidadRow({
  pt,
  onToggleParticularidadVisible,
  onEditParticularidad,
  onConvertParticularidad,
  onOpenConvertedTask,
}: {
  pt: GanttParticularidad;
  onToggleParticularidadVisible?: (id: string, next: boolean) => void;
  onEditParticularidad?: (id: string) => void;
  onConvertParticularidad?: (id: string) => void;
  onOpenConvertedTask?: (taskId: string) => void;
}) {
  const kMeta = PARTICULARIDAD_KIND_META[pt.kind] ?? { label: pt.kind, cls: "text-gray-400 bg-gray-800/60 border-gray-700/50" };
  const pMeta = PARTY_META[pt.party] ?? PARTY_META.SMARTEAM;
  // Convertible = todavía nadie lo persigue Y hay algo que perseguir: un compromiso/solicitud, o un
  // atraso sin cuantificar (que muchas veces no es un atraso sino algo que alguien tiene que averiguar).
  const convertible =
    !pt.convertedTaskId &&
    (pt.kind === "COMPROMISO" || pt.kind === "SOLICITUD" || (pt.kind === "ATRASO" && !pt.weeksImpact));
  return (
    <li className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-lg">
      <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${kMeta.cls}`}>
        {kMeta.label}
      </span>
      <span className="text-sm text-gray-200 flex-1 min-w-0">{pt.title}</span>
      {pt.weeksImpact != null && pt.weeksImpact > 0 && (
        <span className="text-[11px] font-semibold text-red-300">+{plural(pt.weeksImpact, "semana", "semanas")}</span>
      )}
      <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${pMeta.cls}`}>
        {pMeta.label}
      </span>
      {/* Visibilidad al cliente: toggle interactivo cuando es editable; tag legible si no.
          Verde = cruza; neutro contrastado (gris claro) = solo interna. */}
      {onToggleParticularidadVisible ? (
        <button
          type="button"
          onClick={() => onToggleParticularidadVisible(pt.id, !pt.visibleExternal)}
          title={pt.visibleExternal ? "Visible al cliente (clic para ocultar). Se aplica al «Subir al cliente»." : "Solo interna (clic para mostrarla al cliente). Se aplica al «Subir al cliente»."}
          className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border transition-colors ${pt.visibleExternal ? "text-emerald-300 bg-emerald-900/30 border-emerald-700/50 hover:bg-emerald-900/50" : "text-gray-700 bg-gray-300 border-gray-400 hover:bg-gray-200"}`}
        >
          {pt.visibleExternal ? (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          ) : (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          )}
          {pt.visibleExternal ? "Visible al cliente" : "Solo interna"}
        </button>
      ) : (
        !pt.visibleExternal && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-700 bg-gray-300 border border-gray-400 rounded px-1.5 py-0.5 flex-shrink-0" title="No cruza al cliente">
            Solo interna
          </span>
        )
      )}
      {/* Convertir en TAREA: el hecho queda como registro de por qué pasó; la tarea es quién lo hace
          y para cuándo. Texto y no ícono a propósito — es un gesto con consecuencia. */}
      {convertible && onConvertParticularidad && (
        <button
          type="button"
          onClick={() => onConvertParticularidad(pt.id)}
          title="Crear una tarea del cronograma con dueño y fecha para que esto se haga"
          className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border border-blue-700/50 bg-blue-900/30 text-blue-300 hover:bg-blue-900/60 transition-colors"
        >
          Convertir en tarea
        </button>
      )}
      {/* Ya tiene quien la persiga: el chip lleva a esa tarea. */}
      {pt.convertedTaskId && (
        <button
          type="button"
          onClick={() => onOpenConvertedTask?.(pt.convertedTaskId as string)}
          disabled={!onOpenConvertedTask}
          title="Ver la tarea que persigue este hecho"
          className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 enabled:hover:bg-emerald-900/60 transition-colors"
        >
          → tarea
        </button>
      )}
      {onEditParticularidad && (
        <button
          type="button"
          onClick={() => onEditParticularidad(pt.id)}
          title="Editar particularidad"
          className="flex-shrink-0 text-gray-400 hover:text-gray-100 rounded p-1 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
      )}
      {/* Cita interna (fecha de la sesión + fragmento) — solo el CSE la ve; nunca cruza. */}
      {pt.sourceQuote && (
        <p className="w-full text-[11px] text-gray-500 italic leading-relaxed pl-0.5">
          <span className="not-italic text-gray-600 mr-1">[{pt.occurredAt.slice(0, 10)}]</span>
          «{pt.sourceQuote}»
        </p>
      )}
    </li>
  );
}
