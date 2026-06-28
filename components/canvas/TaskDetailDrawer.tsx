"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type GanttTask,
  type GanttTaskStatus,
  STATUS_META,
  StatusCircle,
  PARTY_META,
  effParty,
  nextParty,
  TYPE_META,
  effType,
  nextType,
} from "./TimelineGantt";
import { addWeeks, absoluteWeek, fmtDay, isOverdue } from "@/lib/timeline/weeks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type TaskPatch = {
  title?: string;
  notes?: string | null;
  weekIndex?: number;
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | null;
  type?: "SESSION" | "TASK" | null;
};

interface Props {
  open: boolean;
  task: GanttTask | null;
  phaseKey: string | null;
  phaseName: string;
  phaseDurationWeeks: number;
  /** Semana absoluta de inicio de la fase (range.start) — para derivar la fecha de la tarea. */
  absolutePhaseStart: number;
  anchor: string | null;
  currentWeek: number | null;
  onClose: () => void;
  onToggleStatus: (taskId: string, next: GanttTaskStatus) => void;
  onUpdateTask: (phaseKey: string, taskKey: string, patch: TaskPatch) => void;
  onRemoveTask: (phaseKey: string, taskKey: string) => void;
  // Navegación entre tareas con el drawer abierto (revisor).
  onNavigate?: (dir: -1 | 1) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const STATUS_ORDER: GanttTaskStatus[] = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"];

export default function TaskDetailDrawer({
  open,
  task,
  phaseKey,
  phaseName,
  phaseDurationWeeks,
  absolutePhaseStart,
  anchor,
  currentWeek,
  onClose,
  onToggleStatus,
  onUpdateTask,
  onRemoveTask,
  onNavigate,
  hasPrev,
  hasNext,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  // Esc cierra; ↑/↓ (o j/k) navegan — salvo cuando el foco está en un input/textarea (ahí esas
  // teclas escriben/mueven el cursor). Esc siempre cierra.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if ((e.key === "ArrowDown" || e.key === "j") && hasNext) { e.preventDefault(); onNavigate?.(1); }
      else if ((e.key === "ArrowUp" || e.key === "k") && hasPrev) { e.preventDefault(); onNavigate?.(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hasPrev, hasNext, onNavigate, onClose]);

  // Scroll-lock del body mientras el drawer está abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Auto-grow del textarea de descripción (se reajusta al cambiar de tarea/contenido).
  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [task?.key, task?.notes]);

  if (typeof document === "undefined" || !open || !task || !phaseKey) return null;

  const canToggle = !!task.id;
  const absW = absoluteWeek(absolutePhaseStart, task.weekIndex);
  const overdue = isOverdue(absW, currentWeek, task.status);
  const partyEff = effParty(task.party);
  const typeEff = effType(task.type);
  const dateLabel = anchor
    ? `${fmtDay(addWeeks(anchor, absW))} – ${fmtDay(addWeeks(anchor, absW + 1))}`
    : `Semana ${absW + 1} (sin fecha de arranque)`;

  const propLabel = "text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1";

  return createPortal(
    <>
      {/* Backdrop sin blur: el cronograma queda visible detrás (drawer a media pantalla) */}
      <div className="fixed inset-0 z-[55] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Detalle de la tarea"
        onClick={(e) => e.stopPropagation()}
        className="fixed right-0 top-0 h-full z-[60] w-[50vw] min-w-[420px] max-w-[720px] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <input
              value={task.title}
              onChange={(e) => onUpdateTask(phaseKey, task.key, { title: e.target.value })}
              placeholder="Título de la tarea"
              className="w-full bg-transparent text-base font-semibold text-white border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none pb-1"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {phaseName} · Semana {task.weekIndex + 1}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onNavigate?.(-1)}
              disabled={!hasPrev}
              title="Tarea anterior (↑)"
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button
              onClick={() => onNavigate?.(1)}
              disabled={!hasNext}
              title="Tarea siguiente (↓)"
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button
              onClick={onClose}
              title="Cerrar (Esc)"
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 ml-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Estado */}
        <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <StatusCircle status={task.status} size={24} />
            <span className="text-sm font-semibold text-gray-200">{STATUS_META[task.status].label}</span>
            {overdue && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border text-red-300 bg-red-900/40 border-red-700/50">
                atrasada
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => canToggle && onToggleStatus(task.id!, s)}
                disabled={!canToggle}
                title={!canToggle ? "Guardá el cronograma para poder cambiar el estado" : undefined}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded border transition-colors ${
                  task.status === s ? STATUS_META[s].cls : "bg-surface-hover text-fg-muted border-line hover:text-fg-secondary"
                } ${!canToggle ? "opacity-50 cursor-default" : ""}`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Propiedades */}
        <div className="px-5 py-4 border-b border-gray-800 grid grid-cols-2 gap-4 flex-shrink-0">
          <div>
            <div className={propLabel}>Responsable</div>
            <button
              onClick={() => onUpdateTask(phaseKey, task.key, { party: nextParty(partyEff) })}
              title="Clic para cambiar: Cliente · Smarteam · Ambos"
              className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-1 border transition-colors ${PARTY_META[partyEff].cls}`}
            >
              {PARTY_META[partyEff].label}
            </button>
          </div>
          <div>
            <div className={propLabel}>Tipo</div>
            <button
              onClick={() => onUpdateTask(phaseKey, task.key, { type: nextType(typeEff) })}
              title="Clic para cambiar: Sesión (reunión) · Tarea (acción)"
              className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-1 border transition-colors ${TYPE_META[typeEff].cls}`}
            >
              {TYPE_META[typeEff].label}
            </button>
          </div>
          <div>
            <div className={propLabel}>Semana</div>
            <select
              value={task.weekIndex}
              onChange={(e) => onUpdateTask(phaseKey, task.key, { weekIndex: parseInt(e.target.value, 10) })}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {Array.from({ length: phaseDurationWeeks }).map((_, w) => (
                <option key={w} value={w}>Semana {w + 1}</option>
              ))}
            </select>
          </div>
          <div>
            <div className={propLabel}>Fecha</div>
            <p className="text-xs text-gray-300">{dateLabel}</p>
          </div>
          <div>
            <div className={propLabel}>Origen</div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-1 border ${
                task.source === "AGENT"
                  ? "text-fg-muted bg-surface-hover border-line"
                  : "text-blue-300 bg-blue-900/30 border-blue-700/40"
              }`}
            >
              {task.source === "AGENT" ? "IA" : "CSE"}
            </span>
          </div>
        </div>

        {/* Descripción (cuerpo principal) */}
        <div className="px-5 py-4 flex-1 overflow-y-auto">
          <div className={propLabel}>Descripción</div>
          <textarea
            ref={notesRef}
            value={task.notes ?? ""}
            onChange={(e) => onUpdateTask(phaseKey, task.key, { notes: e.target.value || null })}
            placeholder="Descripción de la tarea (lenguaje cliente). Qué incluye, qué se necesita de su parte…"
            rows={4}
            className="w-full resize-none bg-surface-muted border border-line rounded-lg px-3 py-2 text-sm text-fg leading-relaxed focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Eliminar tarea
          </button>
          <span className="text-[11px] text-gray-600">Los cambios se guardan solos</span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar esta tarea?"
        description="Se quita del cronograma. Esta acción no se puede deshacer."
        confirmLabel="Eliminar tarea"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onRemoveTask(phaseKey, task.key);
          onClose();
        }}
      />
    </>,
    document.body,
  );
}
