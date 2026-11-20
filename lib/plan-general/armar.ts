/**
 * lib/plan-general/armar.ts — arma el plan general de una cuenta desde los cronogramas de sus proyectos. Puro.
 *
 * Reglas (DECISIONS «El plan general de la cuenta», 2026-11-19):
 *  - Entra cada fase con `loopNumero`; el resto de las fases no se ve (Semana 0, fases comunes).
 *  - Todo se pinta con el MISMO Gantt del cronograma (S0, S1…), sobre el arranque MÁS TEMPRANO de los cronogramas que
 *    entran: un proyecto que arrancó dos semanas después se corre dos semanas. Un cronograma sin arranque se lee desde
 *    el del plan.
 *  - Dónde arranca cada fase = su inicio en SU cronograma (computePhaseRanges con TODAS sus fases, porque una fase
 *    contigua arranca donde terminó la anterior) + el corrimiento de su proyecto. Las tareas quedan como están
 *    (weekIndex relativo a su fase, `semanas`): son las mismas filas que edita el cronograma del proyecto.
 *  - Para el cliente: `unirParaElCliente` junta los cronogramas YA filtrados por el chokepoint del cronograma externo
 *    (readClientTimeline: sin notas de tarea, sin SUSPENDED ni «por validar», sin tareas si el detalle no está
 *    confirmado). Este archivo no decide nada de lo que cruza.
 */
import type { ExternalTimelineData, ExternalTimelinePhase } from "@/lib/external/timeline-view-types";
import { computePhaseRanges } from "@/lib/timeline/weeks";
import { rotuloDelLoop, type FaseDelPlan, type PlanGeneral, type TareaDelPlan } from "./tipos";

export interface FaseParaElPlan {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  loopNumero: number | null;
  activityType: string | null;
  status: string;
  needsValidation: boolean;
  sessionCount: number | null;
  tasks: Array<{
    id: string;
    title: string;
    weekIndex: number;
    semanas: number | null;
    order: number;
    status: string;
    notes: string | null;
    needsValidation: boolean;
    source: string;
    statusSource: string | null;
    statusChangedByEmail: string | null;
    statusChangedAt: Date | string | null;
    party: string | null;
    type: string | null;
    startDateOverride: Date | string | null;
    dueDateOverride: Date | string | null;
  }>;
}

export interface ProyectoParaElPlan {
  id: string;
  name: string;
  timeline: { anchorStartDate: Date | string | null; detailConfirmedAt?: Date | string | null; phases: FaseParaElPlan[] } | null;
}

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

function diaUtc(d: Date | string): number {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** Semanas enteras entre dos arranques (redondeadas: un arranque en martes cuenta como la semana del lunes). */
export function semanasEntre(desde: Date | string, hasta: Date | string): number {
  return Math.round((diaUtc(hasta) - diaUtc(desde)) / SEMANA_MS);
}

/** El arranque común: el más temprano de los que hay (ISO), o null. */
export function anclaComun(arranques: ReadonlyArray<Date | string | null | undefined>): string | null {
  const ms = arranques.filter((a): a is Date | string => a != null).map(diaUtc);
  return ms.length ? new Date(Math.min(...ms)).toISOString() : null;
}

/** Cuántas semanas se corre un cronograma que arranca en `ancla` dentro del plan que arranca en `comun`. */
export function corrimiento(comun: string | null, ancla: Date | string | null | undefined): number {
  return comun && ancla ? semanasEntre(comun, ancla) : 0;
}

const iso = (d: Date | string | null): string | null => (d == null ? null : new Date(d).toISOString());
const ESTADOS = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;
const estadoDeTarea = (s: string): TareaDelPlan["status"] => ((ESTADOS as readonly string[]).includes(s) ? (s as TareaDelPlan["status"]) : "PENDING");
const estadoDeFase = (s: string): FaseDelPlan["status"] => (s === "DONE" || s === "IN_PROGRESS" ? s : "PENDING");
const PARTES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;

/** Lo que ve el equipo: las fases-loop de todos los proyectos, con sus tareas tal cual, sobre el arranque común. */
export function armarPlanGeneral(proyectos: readonly ProyectoParaElPlan[]): PlanGeneral {
  const conLoops = proyectos.filter((p) => p.timeline?.phases.some((f) => f.loopNumero != null));
  const ancla = anclaComun(conLoops.map((p) => p.timeline?.anchorStartDate));
  const fases: FaseDelPlan[] = [];
  for (const p of conLoops) {
    const tl = p.timeline!;
    const ordenadas = [...tl.phases].sort((a, b) => a.order - b.order);
    const rangos = computePhaseRanges(ordenadas);
    const corre = corrimiento(ancla, tl.anchorStartDate);
    ordenadas.forEach((f, i) => {
      if (f.loopNumero == null) return;
      fases.push({
        id: f.id,
        proyectoId: p.id,
        proyectoNombre: p.name,
        loopNumero: f.loopNumero,
        name: f.name,
        durationWeeks: f.durationWeeks,
        startWeek: rangos[i].start + corre,
        activityType: f.activityType,
        status: estadoDeFase(f.status),
        needsValidation: f.needsValidation,
        sessionCount: f.sessionCount,
        tasks: [...f.tasks]
          .sort((a, b) => a.weekIndex - b.weekIndex || a.order - b.order)
          .map((t) => ({
            id: t.id,
            title: t.title,
            weekIndex: t.weekIndex,
            semanas: t.semanas,
            order: t.order,
            status: estadoDeTarea(t.status),
            notes: t.notes,
            needsValidation: t.needsValidation,
            source: t.source,
            statusSource: t.statusSource,
            statusChangedByEmail: t.statusChangedByEmail,
            statusChangedAt: iso(t.statusChangedAt),
            party: (PARTES as readonly string[]).includes(t.party ?? "") ? (t.party as TareaDelPlan["party"]) : null,
            type: t.type === "SESSION" || t.type === "TASK" ? t.type : null,
            startDateOverride: iso(t.startDateOverride),
            dueDateOverride: iso(t.dueDateOverride),
          })),
      });
    });
  }
  fases.sort((a, b) => a.loopNumero - b.loopNumero || a.proyectoNombre.localeCompare(b.proyectoNombre, "es"));
  const proyectosDelPlan = conLoops.map((p) => ({ id: p.id, nombre: p.name, detalleConfirmado: !!p.timeline?.detailConfirmedAt }));
  return { ancla, proyectos: proyectosDelPlan, fases };
}

/** Un cronograma ya filtrado para el cliente (readClientTimeline) y qué fases suyas son loops. */
export interface CronogramaDelCliente {
  data: ExternalTimelineData;
  /** id de fase → número de loop. Las fases que no están acá no entran. */
  loops: ReadonlyMap<string, number>;
  /** El nombre del proyecto: SOLO para desempatar dos loops con el mismo número igual que la vista del equipo. No cruza. */
  proyectoNombre?: string;
}

/**
 * Lo que ve el cliente: UN cronograma, con la forma del cronograma compartible (lo pinta TimelineLanding), hecho con
 * las fases-loop de los cronogramas de la cuenta. Las fases salen con el nombre del loop («01 · …»), arranque
 * explícito sobre el arranque común y en orden de loop; las tareas, tal como las dejó pasar el chokepoint. Sin
 * particularidades: son de cada proyecto y viven en su cronograma.
 */
export function unirParaElCliente(cronogramas: readonly CronogramaDelCliente[]): ExternalTimelineData {
  const conLoops = cronogramas.filter((c) => c.data.phases.some((f) => c.loops.has(f.id)));
  const ancla = anclaComun(conLoops.map((c) => c.data.anchorStartDate));
  const fases: Array<{ loop: number; proyecto: string; fase: ExternalTimelinePhase }> = [];
  for (const c of conLoops) {
    const ordenadas = [...c.data.phases].sort((a, b) => a.order - b.order);
    const rangos = computePhaseRanges(ordenadas);
    const corre = corrimiento(ancla, c.data.anchorStartDate);
    ordenadas.forEach((f, i) => {
      const loop = c.loops.get(f.id);
      if (loop == null) return;
      fases.push({ loop, proyecto: c.proyectoNombre ?? "", fase: { ...f, name: rotuloDelLoop(loop, f.name), startWeek: rangos[i].start + corre, loopNumero: loop } });
    });
  }
  // El mismo orden que la vista del equipo (armarPlanGeneral): por loop y, a igual número, por proyecto.
  fases.sort((a, b) => a.loop - b.loop || a.proyecto.localeCompare(b.proyecto, "es"));
  return {
    exists: fases.length > 0,
    anchorStartDate: ancla,
    phases: fases.map(({ fase }, order) => ({ ...fase, order })),
    particularidades: [],
  };
}
