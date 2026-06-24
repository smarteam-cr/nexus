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

import { useState } from "react";
import {
  fmtDay,
  fmtFull,
  addWeeks,
  plural,
  computePhaseRanges,
  totalWeeks as sumWeeks,
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
  party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | null;
}

export interface GanttPhase {
  key: string;
  id?: string;
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  activityType: string | null;
  /** D.2 — avance a nivel fase: DONE = completada, IN_PROGRESS = el "hoy". */
  status?: GanttTaskStatus;
  tasks: GanttTask[];
}

interface Props {
  anchor: string | null; // yyyy-mm-dd o null
  phases: GanttPhase[]; // EN ORDEN
  readOnly?: boolean; // preview de propuesta IA — sin edición ni toggles
  onToggleStatus?: (taskId: string, next: GanttTaskStatus) => void;
  onUpdateTask?: (phaseKey: string, taskKey: string, patch: { title?: string; notes?: string | null; weekIndex?: number; party?: "CLIENTE" | "SMARTEAM" | "AMBOS" | null }) => void;
  onAddTask?: (phaseKey: string, weekIndex: number) => void;
  onRemoveTask?: (phaseKey: string, taskKey: string) => void;
  onSetAnchor?: (isoDate: string) => void; // yyyy-mm-dd — fijar arranque desde el Gantt
  onAssistPhase?: (phase: GanttPhase) => void; // abrir el dialog de IA scopeado a esta fase
  kickoffDate?: string | null; // yyyy-mm-dd de la sesión de kickoff — sugerencia del anchor
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

const NEXT_STATUS: Record<GanttTaskStatus, GanttTaskStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "PENDING",
  SUSPENDED: "PENDING", // E — un click en una suspendida la reactiva (vuelve a pendiente)
};

const STATUS_META: Record<GanttTaskStatus, { label: string; cls: string }> = {
  PENDING:     { label: "pendiente", cls: "bg-gray-800 text-gray-400 border-gray-700" },
  IN_PROGRESS: { label: "en curso",  cls: "bg-blue-900/30 text-blue-300 border-blue-700/50" },
  DONE:        { label: "hecho",     cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" },
  SUSPENDED:   { label: "suspendida", cls: "bg-amber-900/30 text-amber-300 border-amber-700/50" },
};
const OVERDUE_CLS = "bg-red-900/40 text-red-300 border-red-700/50";

// B — dueño de la tarea (chip). Cliente resalta (es lo que frena); Smarteam configura; Ambos conjunto.
const PARTY_META: Record<string, { label: string; cls: string }> = {
  CLIENTE:  { label: "Cliente",  cls: "text-amber-300 bg-amber-900/30 border-amber-700/50" },
  SMARTEAM: { label: "Smarteam", cls: "text-sky-300 bg-sky-900/30 border-sky-700/40" },
  AMBOS:    { label: "Ambos",    cls: "text-violet-300 bg-violet-900/30 border-violet-700/40" },
};
// Toda tarea TIENE dueño — el ciclo es Cliente → Smarteam → Ambos → Cliente (sin estado vacío).
// effParty resuelve null/undefined (data vieja) a SMARTEAM para que nunca se muestre "sin dueño".
const PARTY_CYCLE = ["CLIENTE", "SMARTEAM", "AMBOS"] as const;
const effParty = (p: "CLIENTE" | "SMARTEAM" | "AMBOS" | null | undefined): "CLIENTE" | "SMARTEAM" | "AMBOS" =>
  p === "CLIENTE" || p === "SMARTEAM" || p === "AMBOS" ? p : "SMARTEAM";
const nextParty = (p: "CLIENTE" | "SMARTEAM" | "AMBOS"): "CLIENTE" | "SMARTEAM" | "AMBOS" =>
  PARTY_CYCLE[(PARTY_CYCLE.indexOf(p) + 1) % PARTY_CYCLE.length];

// ── Componente ────────────────────────────────────────────────────────────────

export default function TimelineGantt({
  anchor,
  phases,
  readOnly = false,
  onToggleStatus,
  onUpdateTask,
  onAddTask,
  onRemoveTask,
  onSetAnchor,
  onAssistPhase,
  kickoffDate,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const ranges = computePhaseRanges(phases);
  const total = sumWeeks(phases);
  const curWeek = currentWeekIndex(anchor);
  const curInRange = curWeek !== null && curWeek >= 0 && curWeek < total;
  const todayIso = new Date().toISOString();
  const editable = !readOnly && !!onUpdateTask;

  if (phases.length === 0 || total === 0) return null;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const gridCols = { gridTemplateColumns: `minmax(220px, 300px) repeat(${total}, minmax(26px, 1fr))` };

  return (
    <div className="space-y-3">
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
          {curInRange && <span className="font-extrabold">· Semana S{(curWeek as number) + 1}</span>}
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
                  <div className="text-[10px] font-bold">S{w + 1}</div>
                  {anchor && <div className="text-[9px] text-gray-600">{fmtDay(addWeeks(anchor, w))}</div>}
                </div>
              );
            })}
          </div>

          {/* Filas de fases */}
          <div className="px-4 py-2 space-y-0.5">
            {phases.map((p, i) => {
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
                <div key={p.key}>
                  {/* Fila del grid */}
                  <div
                    onClick={() => toggleExpand(p.key)}
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
                        {p.status === "DONE" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-emerald-300 bg-emerald-500/15 border-emerald-500/50" title="Fase completada">
                            ✓ Completada
                          </span>
                        )}
                        {p.status === "IN_PROGRESS" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 text-blue-300 bg-blue-500/15 border-blue-500/50" title="Fase en curso (hoy)">
                            ● En curso
                          </span>
                        )}
                        {meta && (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${meta.chip}`}>
                            {meta.label}
                          </span>
                        )}
                        {hasOverdue && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Tareas vencidas" />
                        )}
                        {onAssistPhase && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssistPhase(p); }}
                            className="ml-auto flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-300"
                            title="Editar esta fase con IA"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                            IA
                          </button>
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
                      const allDone = weekTasks.length > 0 && weekTasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
                      const isPast = curWeek !== null && w < curWeek;
                      const isCur = curWeek === w;
                      const weekOverdue = weekTasks.some((t) => isOverdue(w, curWeek, t.status));

                      return (
                        <div
                          key={w}
                          className={`h-3 rounded transition-all ${meta?.seg ?? NEUTRAL_SEG} ${
                            allDone || isPast ? "opacity-35" : ""
                          } ${isCur ? "timeline-now-pulse" : ""} ${
                            weekOverdue && !isCur ? "ring-1 ring-red-500/80" : ""
                          }`}
                          title={`S${w + 1}${weekTasks.length ? ` · ${weekTasks.length} tareas` : ""}`}
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
                                  S{absW + 1}
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
                            <div className="space-y-1">
                              {weekTasks.map((t) => {
                                const overdue = isOverdue(absW, curWeek, t.status);
                                const sm = STATUS_META[t.status];
                                const canToggle = !readOnly && !!onToggleStatus && !!t.id;
                                return (
                                  <div
                                    key={t.key}
                                    className="flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 group/task hover:bg-gray-800/50"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (canToggle) onToggleStatus!(t.id!, NEXT_STATUS[t.status]);
                                      }}
                                      disabled={!canToggle}
                                      title={
                                        !t.id
                                          ? "Guardá el cronograma para poder cambiar el estado"
                                          : "Cambiar estado (pendiente → en curso → hecho)"
                                      }
                                      className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border transition-colors min-w-[66px] text-center mt-0.5 ${sm.cls} ${!canToggle ? "opacity-50 cursor-default" : ""}`}
                                    >
                                      {sm.label}
                                    </button>
                                    {overdue && (
                                      <span
                                        title="La fecha de esta tarea ya pasó y todavía no está hecha"
                                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border text-center mt-0.5 ${OVERDUE_CLS}`}
                                      >
                                        atrasada
                                      </span>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        {editable ? (
                                          <input
                                            value={t.title}
                                            onChange={(e) => onUpdateTask!(p.key, t.key, { title: e.target.value })}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="Tarea (visible para el cliente al confirmar)"
                                            className={`flex-1 min-w-0 bg-transparent text-xs border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none pb-0.5 ${
                                              t.status === "DONE" || t.status === "SUSPENDED" ? "text-gray-500 line-through" : "text-gray-300"
                                            }`}
                                          />
                                        ) : (
                                          <span className={`text-xs ${t.status === "DONE" || t.status === "SUSPENDED" ? "text-gray-500 line-through" : "text-gray-300"}`}>
                                            {t.title}
                                          </span>
                                        )}
                                        {editable ? (
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onUpdateTask!(p.key, t.key, { party: nextParty(effParty(t.party)) }); }}
                                            title="Dueño de la tarea — clic para cambiar: Cliente, Smarteam o Ambos"
                                            className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border transition-colors ${PARTY_META[effParty(t.party)].cls}`}
                                          >
                                            {PARTY_META[effParty(t.party)].label}
                                          </button>
                                        ) : (
                                          t.party && PARTY_META[t.party] && (
                                            <span
                                              className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${PARTY_META[t.party].cls}`}
                                              title="Dueño de la tarea en el plan compartido"
                                            >
                                              {PARTY_META[t.party].label}
                                            </span>
                                          )
                                        )}
                                        {t.source && (
                                          <span
                                            className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${
                                              t.source === "AGENT"
                                                ? "text-gray-400 bg-gray-700/40 border-gray-600/50"
                                                : "text-blue-300 bg-blue-900/30 border-blue-700/40"
                                            }`}
                                            title={t.source === "AGENT" ? "Generada por la IA" : "Creada o editada por el CSE"}
                                          >
                                            {t.source === "AGENT" ? "IA" : "CSE"}
                                          </span>
                                        )}
                                      </div>
                                      {editable ? (
                                        <input
                                          value={t.notes ?? ""}
                                          onChange={(e) => onUpdateTask!(p.key, t.key, { notes: e.target.value || null })}
                                          onClick={(e) => e.stopPropagation()}
                                          placeholder="Nota (lenguaje cliente, opcional)"
                                          className="w-full bg-transparent text-[11px] text-gray-500 border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none mt-0.5"
                                        />
                                      ) : (
                                        t.notes?.trim() && <p className="text-[11px] text-gray-600 mt-0.5">{t.notes}</p>
                                      )}
                                    </div>

                                    {editable && (
                                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity">
                                        <select
                                          value={t.weekIndex}
                                          onChange={(e) => onUpdateTask!(p.key, t.key, { weekIndex: parseInt(e.target.value, 10) })}
                                          onClick={(e) => e.stopPropagation()}
                                          className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-400 focus:outline-none focus:border-blue-500"
                                          title="Mover de semana"
                                        >
                                          {Array.from({ length: p.durationWeeks }).map((_, w) => (
                                            <option key={w} value={w}>Sem {w + 1}</option>
                                          ))}
                                        </select>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onRemoveTask!(p.key, t.key); }}
                                          title="Eliminar tarea"
                                          className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {weekTasks.length === 0 && editable && (
                                <p className="text-[11px] text-gray-700 px-2.5">Sin tareas esta semana.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {p.tasks.length === 0 && !editable && (
                        <p className="text-xs text-gray-600 py-1">Sin tareas.</p>
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
