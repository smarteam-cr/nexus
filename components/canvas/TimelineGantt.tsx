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
  addWeeks,
  plural,
  computePhaseRanges,
  timelineSpan,
  fmtPhaseRange,
  currentWeekIndex,
  absoluteWeek,
  isOverdue,
} from "@/lib/timeline/weeks";
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

export const STATUS_META: Record<GanttTaskStatus, { label: string; cls: string }> = {
  PENDING:     { label: "pendiente", cls: "bg-gray-800 text-gray-400 border-gray-700" },
  IN_PROGRESS: { label: "en curso",  cls: "bg-blue-900/30 text-blue-300 border-blue-700/50" },
  DONE:        { label: "hecho",     cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" },
  SUSPENDED:   { label: "suspendida", cls: "bg-amber-900/30 text-amber-300 border-amber-700/50" },
};

// Círculo de estado tipo checklist (reusado por la fila del Gantt y el TaskDetailDrawer).
// BINARIO: no hecha = check-circle tenue (aro + check gris); hecha = disco verde con check blanco.
// "En curso" y "suspendida" NO se representan acá (se gestionan en el drawer). "Atrasada" es un tag.
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
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="flex-shrink-0 text-gray-400 group-hover/task:text-gray-300 transition-colors"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.5 12.5l2.5 2.5 4.5-5" />
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
  kickoffDate,
  onUpdatePhase,
  onAddPhase,
  onRemovePhase,
  onMoveTask,
  onReorderPhases,
  onOpenTask,
  // onRemoveTask removido del Gantt: el borrado de tarea vive en el TaskDetailDrawer.
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // #3 — renombrar inline: el título es TEXTO; al hacer clic se vuelve input (solo esa tarea).
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);

  const ranges = computePhaseRanges(phases);
  const total = timelineSpan(phases); // ancho de calendario (max end) — soporta fases en paralelo
  const curWeek = currentWeekIndex(anchor);
  const curInRange = curWeek !== null && curWeek >= 0 && curWeek < total;
  const todayIso = new Date().toISOString();
  const editable = !readOnly && !!onUpdateTask;

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
    // data-fixed-dark: neutraliza el remap de grises crudos de `html.light` (globals.css) para
    // que el Gantt no cambie en modo claro. data-dark-chrome: además, este es chrome 100% oscuro
    // (inputs oscuros + sin sombra de tarjeta) — reglas que NO aplican a vizs claras (FlowchartViewer).
    <div className="space-y-3" data-fixed-dark data-dark-chrome>
      {/* Fecha de hoy — SIEMPRE visible — + leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-xs font-bold text-blue-300 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-1.5">
          {curInRange && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
          )}
          Hoy: {fmtFull(todayIso)}
          {curInRange && <span className="font-extrabold">· Semana S{curWeek as number}</span>}
          {anchor && curWeek !== null && curWeek < 0 && (
            <span className="font-medium text-blue-400/90">· el proyecto arranca el {fmtFull(anchor)}</span>
          )}
          {anchor && curWeek !== null && curWeek >= total && (
            <span className="font-medium text-blue-400/90">· cronograma finalizado</span>
          )}
        </span>
        {onSetAnchor && <AnchorDatePicker value={anchor ?? ""} onChange={onSetAnchor} />}

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
                isOverdue(absoluteWeek(range.start, t.weekIndex), curWeek, t.status),
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
                        {(onAssistPhase || (editable && canDelete && onRemovePhase)) && (
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
                      const weekOverdue = weekTasks.some((t) => isOverdue(w, curWeek, t.status));

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
                                const overdue = isOverdue(absW, curWeek, t.status);
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
                                    {/* Círculo de estado (checklist) — clic marca hecha/pendiente; no abre el drawer */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (canToggle) onToggleStatus!(t.id!, t.status === "DONE" ? "PENDING" : "DONE");
                                      }}
                                      disabled={!canToggle}
                                      title={
                                        !t.id
                                          ? "Guardá el cronograma para poder cambiar el estado"
                                          : t.status === "DONE" ? "Marcar como pendiente" : "Marcar como hecha"
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
    </div>
  );
}
