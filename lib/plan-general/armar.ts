/**
 * lib/plan-general/armar.ts — arma el plan general de una cuenta desde los cronogramas de sus proyectos y el suyo. Puro.
 *
 * Reglas (DECISIONS «El plan general de la cuenta», 2026-11-19, y «El plan general es un objeto de la cuenta», 26 nov):
 *  - De cada proyecto incluido entra cada fase con `loopNumero`; el resto de sus fases no se ve (Semana 0, fases comunes).
 *  - Del cronograma PROPIO del plan entran TODAS sus fases (lo transversal), con número o sin él.
 *  - Todo se pinta con el MISMO Gantt del cronograma (S0, S1…), sobre el arranque del plan: el de su cronograma, o el
 *    MÁS TEMPRANO de los proyectos si el plan no tiene uno. Un proyecto que arrancó dos semanas después se corre dos
 *    semanas. Un cronograma sin arranque se lee desde el del plan.
 *  - Dónde arranca cada fase = su inicio en SU cronograma (computePhaseRanges con TODAS sus fases, porque una fase
 *    contigua arranca donde terminó la anterior) + el corrimiento de su cronograma. Las tareas quedan como están
 *    (weekIndex relativo a su fase, `semanas`): son las mismas filas que edita cada cronograma.
 *  - Para el cliente: `unirParaElCliente` junta los cronogramas YA filtrados por el chokepoint del cronograma externo
 *    (readClientTimeline / readClientTimelineDelPlan: sin notas de tarea, sin SUSPENDED ni «por validar», sin tareas si
 *    el detalle no está confirmado). Este archivo no decide nada de lo que cruza.
 */
import type { ExternalTimelineData, ExternalTimelinePhase } from "@/lib/external/timeline-view-types";
import { computePhaseRanges } from "@/lib/timeline/weeks";
import { ordenDeLasFases, rotuloDelLoop, type FaseDelPlan, type PlanGeneral, type TareaDelPlan } from "./tipos";

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

interface CronogramaParaElPlan {
  anchorStartDate: Date | string | null;
  detailConfirmedAt?: Date | string | null;
  phases: FaseParaElPlan[];
}

export interface ProyectoParaElPlan {
  id: string;
  name: string;
  timeline: CronogramaParaElPlan | null;
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

/**
 * El arranque del plan: el de su cronograma o, si un proyecto arranca ANTES, el de ese proyecto (el más temprano de
 * todos). El Gantt cuenta desde S0: un loop antes del arranque quedaría en semanas negativas y no se vería. Fijarlo
 * después que los proyectos se rechaza al guardar (plan.ts); esto cubre lo que cambia después (un proyecto que se suma
 * a la lista, un kickoff que corre el arranque de un proyecto hacia atrás).
 */
export function anclaDelPlan(propio: Date | string | null | undefined, deLosProyectos: ReadonlyArray<Date | string | null | undefined>): string | null {
  return anclaComun([propio, ...deLosProyectos]);
}

const iso = (d: Date | string | null): string | null => (d == null ? null : new Date(d).toISOString());
const ESTADOS = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;
const estadoDeTarea = (s: string): TareaDelPlan["status"] => ((ESTADOS as readonly string[]).includes(s) ? (s as TareaDelPlan["status"]) : "PENDING");
const estadoDeFase = (s: string): FaseDelPlan["status"] => (s === "DONE" || s === "IN_PROGRESS" ? s : "PENDING");
const PARTES = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"] as const;

const tieneLoops = (tl: CronogramaParaElPlan | null | undefined) => !!tl?.phases.some((f) => f.loopNumero != null);

function aTareas(tasks: FaseParaElPlan["tasks"]): TareaDelPlan[] {
  return [...tasks]
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
    }));
}

/** Las fases de un cronograma que entran al plan (`entra`), con su inicio sobre el arranque del plan. */
function fasesDe(
  tl: CronogramaParaElPlan,
  ancla: string | null,
  entra: (f: FaseParaElPlan) => boolean,
  proyecto: { id: string; nombre: string } | null,
): FaseDelPlan[] {
  const ordenadas = [...tl.phases].sort((a, b) => a.order - b.order);
  const rangos = computePhaseRanges(ordenadas);
  const corre = corrimiento(ancla, tl.anchorStartDate);
  return ordenadas.flatMap((f, i) =>
    entra(f)
      ? [
          {
            id: f.id,
            proyectoId: proyecto?.id ?? null,
            proyectoNombre: proyecto?.nombre ?? null,
            loopNumero: f.loopNumero,
            name: f.name,
            durationWeeks: f.durationWeeks,
            startWeek: rangos[i].start + corre,
            activityType: f.activityType,
            status: estadoDeFase(f.status),
            needsValidation: f.needsValidation,
            sessionCount: f.sessionCount,
            tasks: aTareas(f.tasks),
          },
        ]
      : [],
  );
}

/**
 * Lo que ve el equipo. `proyectos` son los que ENTRAN (los de la lista del plan; sin plan guardado, los que tienen
 * loops); de cada uno, sus loops. `propio` es el cronograma del plan (null = el plan todavía no existe o no tiene).
 */
export function armarPlanGeneral(proyectos: readonly ProyectoParaElPlan[], propio: CronogramaParaElPlan | null = null, guardado = propio != null): PlanGeneral {
  const ancla = anclaDelPlan(
    propio?.anchorStartDate,
    proyectos.filter((p) => tieneLoops(p.timeline)).map((p) => p.timeline?.anchorStartDate),
  );
  const fases: FaseDelPlan[] = [
    ...(propio ? fasesDe(propio, ancla, () => true, null) : []),
    ...proyectos.flatMap((p) => (p.timeline ? fasesDe(p.timeline, ancla, (f) => f.loopNumero != null, { id: p.id, nombre: p.name }) : [])),
  ];
  // Estable: dentro de un mismo cronograma y número, el orden de su cronograma.
  fases.sort(ordenDeLasFases);
  return {
    guardado,
    ancla,
    anclaPropia: propio?.anchorStartDate != null,
    corrimientoPropio: propio ? corrimiento(ancla, propio.anchorStartDate) : 0,
    proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name, detalleConfirmado: !!p.timeline?.detailConfirmedAt })),
    fases,
  };
}

/** Un cronograma ya filtrado para el cliente (readClientTimeline) y qué fases suyas entran. */
export interface CronogramaDelCliente {
  data: ExternalTimelineData;
  /** id de fase → número de loop. En un cronograma de proyecto, las fases que no están acá no entran. */
  loops: ReadonlyMap<string, number>;
  /** El nombre del proyecto: SOLO para desempatar dos loops con el mismo número igual que la vista del equipo. No cruza. */
  proyectoNombre?: string;
  /** El cronograma PROPIO del plan: entran todas sus fases, y su arranque es el del plan. */
  delPlan?: boolean;
}

/**
 * Lo que ve el cliente: UN cronograma, con la forma del cronograma compartible (lo pinta TimelineLanding), hecho con
 * las fases propias del plan y las fases-loop de sus proyectos. Una fase con número sale con el nombre del loop
 * («01 · …», «00 · Transversal»), arranque explícito sobre el arranque del plan y en el orden de la vista del equipo; las
 * tareas, tal como las dejó pasar el chokepoint. Sin particularidades: son de cada proyecto y viven en su cronograma.
 */
export function unirParaElCliente(cronogramas: readonly CronogramaDelCliente[]): ExternalTimelineData {
  const entra = (c: CronogramaDelCliente, f: ExternalTimelinePhase) => c.delPlan === true || c.loops.has(f.id);
  const conFases = cronogramas.filter((c) => c.data.phases.some((f) => entra(c, f)));
  const propio = cronogramas.find((c) => c.delPlan);
  const ancla = anclaDelPlan(
    propio?.data.anchorStartDate,
    conFases.filter((c) => !c.delPlan).map((c) => c.data.anchorStartDate),
  );
  const fases: Array<{ loopNumero: number | null; proyectoNombre: string | null; fase: ExternalTimelinePhase }> = [];
  // El propio primero: con el orden estable, a igual número sus fases van antes (como en la vista del equipo).
  for (const c of [...conFases].sort((a, b) => Number(!!b.delPlan) - Number(!!a.delPlan))) {
    const ordenadas = [...c.data.phases].sort((a, b) => a.order - b.order);
    const rangos = computePhaseRanges(ordenadas);
    const corre = corrimiento(ancla, c.data.anchorStartDate);
    ordenadas.forEach((f, i) => {
      if (!entra(c, f)) return;
      const loop = c.loops.get(f.id) ?? null;
      fases.push({
        loopNumero: loop,
        proyectoNombre: c.delPlan ? null : (c.proyectoNombre ?? ""),
        fase: { ...f, name: loop != null ? rotuloDelLoop(loop, f.name) : f.name, startWeek: rangos[i].start + corre },
      });
    });
  }
  fases.sort(ordenDeLasFases);
  // La página del plan (título, logo, qué se muestra) es la de SU cronograma, no la de un proyecto: cada proyecto tiene
  // la suya para su propia página.
  const pagina = propio?.data.pagina;
  return {
    exists: fases.length > 0,
    anchorStartDate: ancla,
    phases: fases.map(({ fase }, order) => ({ ...fase, order })),
    particularidades: [],
    ...(pagina ? { pagina } : {}),
  };
}
