"use client";

/**
 * components/canvas/TimelineGantt.tsx (D.1)
 *
 * Gantt INTERNO del cronograma detallado: grid de semanas con barras por fase
 * coloreadas por tipo de actividad, semana actual resaltada, filas expandibles
 * con las tareas agrupadas por semana y toggle de estado por tarea.
 *
 * Solo VISUALIZACIÓN + estado: la estructura (fases/tareas) se edita en la
 * pestaña Editor de CronogramaCanvas. El estado se cambia acá vía
 * PATCH /timeline/tasks/[taskId] (lo maneja el padre con update optimista).
 *
 * Derivados (nunca persistidos): "vencida" = semana absoluta < semana actual y
 * status != DONE; celda atenuada = semana pasada o todas sus tareas DONE.
 *
 * Las tareas needsValidation se GRITAN a propósito (fila amber + badge "POR
 * VALIDAR"): si el CSE confirma sin revisar, esos títulos cruzan al cliente —
 * este tratamiento visual es la barrera. La marca en sí nunca cruza (columna
 * excluida del mapper externo).
 */

import { useState } from "react";
import {
  fmtDay,
  addWeeks,
  plural,
  computePhaseRanges,
  totalWeeks as sumWeeks,
  fmtPhaseRange,
  currentWeekIndex,
  absoluteWeek,
  isOverdue,
} from "@/lib/timeline/weeks";

// ── Tipos (shape del GET /timeline) ───────────────────────────────────────────

export type GanttTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export interface GanttTask {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  status: GanttTaskStatus;
  notes: string | null;
  needsValidation: boolean;
  source: string;
}

export interface GanttPhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  tasks: GanttTask[];
}

interface Props {
  anchor: string | null; // yyyy-mm-dd o null
  phases: GanttPhase[];
  onToggleStatus: (taskId: string, next: GanttTaskStatus) => void;
}

// ── Metadata de tipos de actividad (color de barra + chip) ────────────────────

const ACTIVITY_META: Record<string, { label: string; seg: string; chip: string }> = {
  EXPLORACION:   { label: "Exploración",   seg: "bg-sky-500",     chip: "text-sky-300 bg-sky-900/30 border-sky-700/40" },
  PLANIFICACION: { label: "Planificación", seg: "bg-violet-500",  chip: "text-violet-300 bg-violet-900/30 border-violet-700/40" },
  CONFIGURACION: { label: "Configuración", seg: "bg-blue-600",    chip: "text-blue-300 bg-blue-900/30 border-blue-700/40" },
  ADOPCION:      { label: "Adopción",      seg: "bg-emerald-500", chip: "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" },
  SEGUIMIENTO:   { label: "Seguimiento",   seg: "bg-teal-400",    chip: "text-teal-300 bg-teal-900/30 border-teal-700/40" },
};
const NEUTRAL_SEG = "bg-gray-600";

// ── Estado de tarea: ciclo + estilos ──────────────────────────────────────────

const NEXT_STATUS: Record<GanttTaskStatus, GanttTaskStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "PENDING",
};

const STATUS_META: Record<GanttTaskStatus, { label: string; cls: string }> = {
  PENDING:     { label: "pendiente", cls: "bg-gray-800 text-gray-400 border-gray-700" },
  IN_PROGRESS: { label: "en curso",  cls: "bg-blue-900/40 text-blue-300 border-blue-700/50" },
  DONE:        { label: "hecho",     cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" },
};
const OVERDUE_CLS = "bg-red-900/40 text-red-300 border-red-700/50";

// ── Componente ────────────────────────────────────────────────────────────────

export default function TimelineGantt({ anchor, phases, onToggleStatus }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const ranges = computePhaseRanges(sorted);
  const total = sumWeeks(sorted);
  const curWeek = currentWeekIndex(anchor);
  const curInRange = curWeek !== null && curWeek >= 0 && curWeek < total;

  if (sorted.length === 0 || total === 0) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gridCols = { gridTemplateColumns: `minmax(220px, 300px) repeat(${total}, minmax(26px, 1fr))` };

  return (
    <div className="space-y-3">
      {/* Leyenda + banner de semana actual */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {Object.values(ACTIVITY_META).map((m) => (
          <span key={m.label} className="flex items-center gap-1.5">
            <span className={`w-6 h-1.5 rounded ${m.seg} inline-block`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{m.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={`w-6 h-1.5 rounded ${NEUTRAL_SEG} inline-block`} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Sin tipo</span>
        </span>
        {curInRange && (
          <span className="ml-auto flex items-center gap-2 text-xs font-bold text-blue-300 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
            Semana actual: S{(curWeek as number) + 1}
            {anchor && <span className="font-medium text-blue-400/80">· {fmtDay(addWeeks(anchor, curWeek as number))}</span>}
          </span>
        )}
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
                    isCur ? "bg-blue-900/50 ring-1 ring-blue-500/60 text-blue-300" : "text-gray-500"
                  }`}
                >
                  <div className="text-[10px] font-bold">S{w + 1}</div>
                  {anchor && <div className="text-[9px] text-gray-600">{fmtDay(addWeeks(anchor, w))}</div>}
                </div>
              );
            })}
          </div>

          {/* Filas de fases */}
          <div className="px-4 py-2 space-y-0.5">
            {sorted.map((p, i) => {
              const range = ranges[i];
              const meta = p.activityType ? ACTIVITY_META[p.activityType] : null;
              const isOpen = expanded.has(p.id);
              const pendingValidation = p.tasks.filter((t) => t.needsValidation).length;
              const hasOverdue = p.tasks.some((t) =>
                isOverdue(absoluteWeek(range.start, t.weekIndex), curWeek, t.status),
              );

              // Tareas agrupadas por semana relativa (para expandido y para estado de celda)
              const tasksByWeek = new Map<number, GanttTask[]>();
              for (const t of p.tasks) {
                const arr = tasksByWeek.get(t.weekIndex) ?? [];
                arr.push(t);
                tasksByWeek.set(t.weekIndex, arr);
              }

              return (
                <div key={p.id}>
                  {/* Fila del grid */}
                  <div
                    onClick={() => toggleExpand(p.id)}
                    className="grid gap-1 items-center px-2 py-1.5 -mx-2 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors group"
                    style={gridCols}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-300 group-hover:text-white">
                        <svg
                          className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="truncate">{p.name}</span>
                        {meta && (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${meta.chip}`}>
                            {meta.label}
                          </span>
                        )}
                        {pendingValidation > 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-amber-300 bg-amber-500/15 border-amber-500/50">
                            ⚠ {pendingValidation} por validar
                          </span>
                        )}
                        {hasOverdue && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Tareas vencidas" />
                        )}
                      </div>
                      <span className="ml-[18px] text-[10px] text-gray-600 mt-0.5">
                        {fmtPhaseRange(anchor, range)}
                        {p.tasks.length > 0 && ` · ${plural(p.tasks.length, "tarea", "tareas")}`}
                      </span>
                    </div>

                    {/* Celdas de semanas */}
                    {Array.from({ length: total }).map((_, w) => {
                      const inRange = w >= range.start && w < range.end;
                      if (!inRange) return <div key={w} className="h-3 rounded bg-gray-800/70" />;

                      const relWeek = w - range.start;
                      const weekTasks = tasksByWeek.get(relWeek) ?? [];
                      const allDone = weekTasks.length > 0 && weekTasks.every((t) => t.status === "DONE");
                      const isPast = curWeek !== null && w < curWeek;
                      const isCur = curWeek === w;
                      const weekOverdue = weekTasks.some((t) => isOverdue(w, curWeek, t.status));

                      return (
                        <div
                          key={w}
                          className={`h-3 rounded transition-all ${meta?.seg ?? NEUTRAL_SEG} ${
                            allDone || isPast ? "opacity-35" : ""
                          } ${isCur ? "ring-2 ring-blue-400 animate-pulse scale-y-125" : ""} ${
                            weekOverdue && !isCur ? "ring-1 ring-red-500/80" : ""
                          }`}
                          title={`S${w + 1}${weekTasks.length ? ` · ${weekTasks.length} tareas` : ""}`}
                        />
                      );
                    })}
                  </div>

                  {/* Expandido: tareas por semana */}
                  {isOpen && (
                    <div className="ml-7 mr-2 mb-3 mt-1 border-l-2 border-gray-700 pl-4 space-y-3">
                      {p.tasks.length === 0 ? (
                        <p className="text-xs text-gray-600 py-1">Sin tareas — agregalas en la pestaña Editor o generá el detalle con IA.</p>
                      ) : (
                        Array.from({ length: p.durationWeeks }).map((_, relWeek) => {
                          const weekTasks = (tasksByWeek.get(relWeek) ?? []).sort((a, b) => a.order - b.order);
                          if (weekTasks.length === 0) return null;
                          const absW = absoluteWeek(range.start, relWeek);
                          return (
                            <div key={relWeek}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-dashed border-gray-700 pb-1 mb-1.5">
                                Semana {relWeek + 1}
                                <span className="text-gray-600 font-semibold ml-2">
                                  S{absW + 1}
                                  {anchor && ` · ${fmtDay(addWeeks(anchor, absW))} – ${fmtDay(addWeeks(anchor, absW + 1))}`}
                                </span>
                              </p>
                              <div className="space-y-1">
                                {weekTasks.map((t) => {
                                  const overdue = isOverdue(absW, curWeek, t.status);
                                  const sm = STATUS_META[t.status];
                                  return (
                                    <div
                                      key={t.id}
                                      className={`flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 ${
                                        t.needsValidation
                                          ? "bg-amber-500/10 border border-amber-500/40"
                                          : "hover:bg-gray-800/40"
                                      }`}
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onToggleStatus(t.id, NEXT_STATUS[t.status]);
                                        }}
                                        title="Cambiar estado (pendiente → en curso → hecho)"
                                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border transition-colors min-w-[66px] text-center ${
                                          overdue ? OVERDUE_CLS : sm.cls
                                        }`}
                                      >
                                        {overdue ? "vencida" : sm.label}
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs ${t.status === "DONE" ? "text-gray-500 line-through" : "text-gray-300"}`}>
                                            {t.title}
                                          </span>
                                          {t.needsValidation && (
                                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-300 bg-amber-500/20 border border-amber-500/60 rounded px-1.5 py-0.5 flex-shrink-0">
                                              Por validar
                                            </span>
                                          )}
                                        </div>
                                        {t.notes?.trim() && (
                                          <p className="text-[11px] text-gray-600 mt-0.5">{t.notes}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
