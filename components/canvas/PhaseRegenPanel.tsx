"use client";

/**
 * components/canvas/PhaseRegenPanel.tsx
 *
 * Extraído de PhaseRegenModal.tsx (Tanda N) — la curación de dos columnas de UNA fase, sin el
 * <Modal> wrapper ni el título/footer, para poder reusarla N veces dentro de un acordeón
 * (AllPhasesRegenModal.tsx, "Regenerar todo el cronograma") sin duplicar la lógica de DnD.
 *
 *   - IZQUIERDA "Tareas actuales": las tareas PENDIENTES reemplazables de la fase (paleta; arrastralas
 *     a la derecha para conservarlas — las que queden acá se descartan al aplicar).
 *   - DERECHA "Cómo quedará la fase": el set final. Se pre-siembra con las tareas NUEVAS propuestas por
 *     la IA + las tareas existentes con avance (DONE/iniciadas) o manuales (para no perderlas).
 *
 * El CSE mueve (drag entre columnas), borra, edita (título/responsable/tipo/semana) y marca hechas.
 * `onChange` reporta el resultado en cada cambio — el caller (PhaseRegenModal o
 * AllPhasesRegenModal) decide cuándo/cómo mandarlo al server. dnd propio (no reusa el del
 * Gantt, atado a semanas/fases).
 */
import { useEffect, useState } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners, useDroppable,
  type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatusCircle, PARTY_META, type GanttTaskStatus } from "./TimelineGantt";

const PARTIES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;
type Party = (typeof PARTIES)[number];

export interface RegenCurrentTask {
  id: string;
  title: string;
  weekIndex: number;
  party?: string | null;
  type?: string | null;
  status: GanttTaskStatus;
  source?: string | null;
  notes?: string | null;
}
export interface RegenProposedTask {
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: Party;
  type: "SESSION" | "TASK";
}
export interface FinalTask {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: string | null;
  type: string | null;
  status: GanttTaskStatus;
}

interface Item {
  _key: string;
  id?: string;
  title: string;
  weekIndex: number;
  party: string | null;
  type: string | null;
  status: GanttTaskStatus;
  notes: string | null;
  isNew: boolean;
}

type Col = "left" | "right";

let keySeq = 0;
const nextKey = () => `pr-${keySeq++}`;

/** Preservada automáticamente: iniciada/hecha/suspendida (no PENDING) o manual (HUMAN). */
export const isKept = (t: RegenCurrentTask) => t.status !== "PENDING" || t.source === "HUMAN";

/** ¿Esta fase tiene algo que revisar? Con esto el acordeón decide expand-por-defecto. */
export function phaseHasChanges(current: RegenCurrentTask[], proposed: RegenProposedTask[]): boolean {
  return proposed.length > 0 || current.some((t) => !isKept(t));
}

export interface PhaseRegenPanelProps {
  durationWeeks: number;
  current: RegenCurrentTask[];
  proposed: RegenProposedTask[];
  onChange: (finals: FinalTask[]) => void;
}

export function PhaseRegenPanel({ durationWeeks, current, proposed, onChange }: PhaseRegenPanelProps) {
  // Estado inicial calculado UNA vez al montar (lazy) — mismo criterio que el PhaseRegenModal
  // original: current/proposed cambian de referencia si el padre re-renderiza y NO deben
  // re-sembrar la curación a mitad de camino.
  const [left, setLeft] = useState<Item[]>(() =>
    current.filter((t) => !isKept(t)).map((t) => ({
      _key: nextKey(), id: t.id, title: t.title, weekIndex: t.weekIndex,
      party: t.party ?? null, type: t.type ?? null, status: t.status, notes: t.notes ?? null, isNew: false,
    })),
  );
  const [right, setRight] = useState<Item[]>(() => [
    ...current.filter(isKept).map((t) => ({
      _key: nextKey(), id: t.id, title: t.title, weekIndex: t.weekIndex,
      party: t.party ?? null, type: t.type ?? null, status: t.status, notes: t.notes ?? null, isNew: false,
    })),
    ...proposed.map((t) => ({
      _key: nextKey(), title: t.title, weekIndex: t.weekIndex, party: t.party, type: t.type,
      status: "PENDING" as GanttTaskStatus, notes: t.notes, isNew: true,
    })),
  ]);

  // Reporta el resultado en cada cambio de `right` — el caller decide qué hacer con él (el
  // modal de una fase lo guarda en un ref hasta que se apreta "Aceptar"; el de todas las fases
  // igual, uno por fase). Corre también al montar: así una sección colapsada del acordeón ya
  // deja su resultado disponible sin que el CSE tenga que abrirla.
  useEffect(() => {
    const perWeek = new Map<number, number>();
    const finals: FinalTask[] = right
      .filter((i) => i.title.trim())
      .map((i) => {
        const order = perWeek.get(i.weekIndex) ?? 0;
        perWeek.set(i.weekIndex, order + 1);
        return { id: i.id, title: i.title.trim(), weekIndex: i.weekIndex, order, notes: i.notes, party: i.party, type: i.type, status: i.status };
      });
    onChange(finals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [right]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colOf = (key: string): Col | null =>
    left.some((i) => i._key === key) ? "left" : right.some((i) => i._key === key) ? "right" : null;
  const listOf = (c: Col) => (c === "left" ? left : right);
  const setList = (c: Col, v: Item[]) => (c === "left" ? setLeft(v) : setRight(v));

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = colOf(String(active.id));
    const to = colOf(String(over.id)) ?? (over.id === "left" || over.id === "right" ? (over.id as Col) : null);
    if (!from || !to || from === to) return;
    const item = listOf(from).find((i) => i._key === active.id);
    if (!item) return;
    setList(from, listOf(from).filter((i) => i._key !== active.id));
    const toList = listOf(to);
    const overIdx = toList.findIndex((i) => i._key === over.id);
    const insertAt = overIdx >= 0 ? overIdx : toList.length;
    setList(to, [...toList.slice(0, insertAt), item, ...toList.slice(insertAt)]);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const c = colOf(String(active.id));
    if (!c) return;
    const list = listOf(c);
    const oldIdx = list.findIndex((i) => i._key === active.id);
    const newIdx = list.findIndex((i) => i._key === over.id);
    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) setList(c, arrayMove(list, oldIdx, newIdx));
  }

  const patch = (c: Col, key: string, p: Partial<Item>) =>
    setList(c, listOf(c).map((i) => (i._key === key ? { ...i, ...p } : i)));
  const remove = (c: Col, key: string) => setList(c, listOf(c).filter((i) => i._key !== key));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Column id="left" title="Tareas actuales" subtitle="Pendientes reemplazables — arrastrá para conservar"
          items={left} durationWeeks={durationWeeks} onPatch={(k, p) => patch("left", k, p)} onRemove={(k) => remove("left", k)} />
        <Column id="right" title="Cómo quedará la fase" subtitle="Resultado final (se aplica al aceptar)"
          items={right} durationWeeks={durationWeeks} onPatch={(k, p) => patch("right", k, p)} onRemove={(k) => remove("right", k)} highlight />
      </div>
    </DndContext>
  );
}

function Column({ id, title, subtitle, items, durationWeeks, onPatch, onRemove, highlight }: {
  id: Col; title: string; subtitle: string; items: Item[]; durationWeeks: number;
  onPatch: (key: string, p: Partial<Item>) => void; onRemove: (key: string) => void; highlight?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="flex flex-col min-w-0">
      <div className="px-1 pb-1">
        <p className="text-xs font-semibold text-fg">{title}</p>
        <p className="text-[10px] text-fg-muted">{subtitle}</p>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 min-h-[16rem] max-h-[55vh] overflow-y-auto rounded-lg border p-2 space-y-2 transition-colors ${
          isOver ? "border-brand/60 bg-brand/5" : highlight ? "border-line bg-surface-muted/40" : "border-line bg-surface-muted/20"
        }`}>
        <SortableContext items={items.map((i) => i._key)} strategy={verticalListSortingStrategy}>
          {items.map((i) => (
            <TaskCard key={i._key} item={i} durationWeeks={durationWeeks} onPatch={(p) => onPatch(i._key, p)} onRemove={() => onRemove(i._key)} />
          ))}
        </SortableContext>
        {items.length === 0 && <p className="text-[10px] text-fg-muted italic px-1 py-6 text-center">Sin tareas — arrastrá acá.</p>}
      </div>
    </div>
  );
}

function TaskCard({ item, durationWeeks, onPatch, onRemove }: {
  item: Item; durationWeeks: number; onPatch: (p: Partial<Item>) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const partyMeta = item.party ? PARTY_META[item.party] : null;
  const cycleParty = () => {
    const idx = item.party ? PARTIES.indexOf(item.party as Party) : -1;
    onPatch({ party: PARTIES[(idx + 1) % PARTIES.length] });
  };
  const done = item.status === "DONE";
  return (
    <div ref={setNodeRef} style={style}
      className="rounded-md border border-line bg-surface p-2 flex items-start gap-2 group">
      <button {...attributes} {...listeners} className="mt-0.5 cursor-grab text-fg-muted hover:text-fg touch-none" title="Arrastrar">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.5"/><circle cx="7" cy="10" r="1.5"/><circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="5" r="1.5"/><circle cx="13" cy="10" r="1.5"/><circle cx="13" cy="15" r="1.5"/></svg>
      </button>
      <button onClick={() => onPatch({ status: done ? "PENDING" : "DONE" })} className="mt-0.5 flex-shrink-0" title={done ? "Marcar pendiente" : "Marcar hecha"}>
        <StatusCircle status={item.status} size={16} />
      </button>
      <div className="min-w-0 flex-1">
        <input value={item.title} onChange={(e) => onPatch({ title: e.target.value })}
          className={`w-full bg-transparent text-xs text-fg border-b border-transparent hover:border-line focus:border-brand focus:outline-none pb-0.5 ${done ? "line-through text-fg-muted" : ""}`}
          placeholder="Título de la tarea" />
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <button onClick={cycleParty}
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${partyMeta?.cls ?? "border-line text-fg-secondary"}`}
            title="Cambiar responsable">
            {partyMeta?.label ?? "—"}
          </button>
          <button onClick={() => onPatch({ type: item.type === "SESSION" ? "TASK" : "SESSION" })}
            className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-secondary" title="Sesión / Tarea">
            {item.type === "SESSION" ? "Sesión" : "Tarea"}
          </button>
          <select value={item.weekIndex} onChange={(e) => onPatch({ weekIndex: Number(e.target.value) })}
            className="text-[9px] bg-surface-muted border border-line rounded px-1 py-0.5 text-fg-secondary" title="Semana de la fase">
            {Array.from({ length: Math.max(durationWeeks, 1) }, (_, w) => (
              <option key={w} value={w}>Sem {w + 1}</option>
            ))}
          </select>
          {item.isNew && <span className="text-[9px] text-brand-light font-medium">nueva</span>}
        </div>
      </div>
      <button onClick={onRemove} className="mt-0.5 text-fg-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Quitar">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  );
}
