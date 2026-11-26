/**
 * lib/plan-general/tipos.ts — el plan general de la cuenta. Client-safe.
 *
 * Una cuenta con varios proyectos tiene UN plan (2026-11-26, DECISIONS «El plan general es un objeto de la cuenta»): un
 * objeto propio (`PlanGeneral`) con la lista EXPLÍCITA de sus proyectos (de cada uno entran sus loops) y su propio
 * cronograma (las fases transversales, que no son de ningún proyecto). Todo se pinta en el MISMO Gantt de Nexus
 * (TimelineGantt + el panel de tarea), sobre el arranque del plan. Las tareas de un loop son las filas del cronograma de
 * SU proyecto (editar acá es editar ahí); las de una fase propia son del cronograma del plan. Lo que ve el cliente es la
 * foto publicada (AccesoAlPlanGeneral.publicado), con la forma del cronograma compartible.
 */

/** Una tarea del plan: la fila de `TimelineTask`, con lo que el Gantt y su panel necesitan. */
export interface TareaDelPlan {
  id: string;
  title: string;
  /** Desde 0, relativa a su fase (como en el cronograma del proyecto). */
  weekIndex: number;
  semanas: number | null;
  order: number;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "SUSPENDED";
  notes: string | null;
  needsValidation: boolean;
  source: string;
  statusSource: string | null;
  statusChangedByEmail: string | null;
  statusChangedAt: string | null;
  party: "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV" | null;
  type: "SESSION" | "TASK" | null;
  startDateOverride: string | null;
  dueDateOverride: string | null;
}

/** Una fase del plan: un loop del cronograma de un proyecto incluido, o una fase PROPIA del plan (`proyectoId` null). */
export interface FaseDelPlan {
  id: string;
  /** null = fase propia del plan (su cronograma es del plan, no de un proyecto). */
  proyectoId: string | null;
  proyectoNombre: string | null;
  /** El número del loop. Siempre en un loop de proyecto; en una fase propia puede faltar (0 = «00 · Transversal»). */
  loopNumero: number | null;
  name: string;
  durationWeeks: number;
  /** Dónde arranca, desde 0, contada desde el arranque del plan (ya corrida por el arranque de su cronograma). */
  startWeek: number;
  activityType: string | null;
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  needsValidation: boolean;
  sessionCount: number | null;
  tasks: TareaDelPlan[];
}

export interface ProyectoDelPlan {
  id: string;
  nombre: string;
  /** El cronograma tiene el detalle confirmado: sin eso, el cliente ve sus loops pero no sus tareas (como su cronograma). */
  detalleConfirmado: boolean;
}

export interface PlanGeneral {
  /** El plan ya existe como fila. false = una cuenta sin plan guardado, vista como antes (los proyectos con loops). */
  guardado: boolean;
  /** El arranque del plan (ISO): el de su cronograma; sin él, el más temprano de sus proyectos. null = ninguno tiene. */
  ancla: string | null;
  /** El arranque está fijado en el plan (si no, es el de sus proyectos). */
  anclaPropia: boolean;
  /** Cuántas semanas se corren las fases propias (un proyecto que arranca antes que el plan mueve el S0): 0 casi siempre.
   *  El `startWeek` de una fase propia que se guarda es el de la pantalla menos esto. */
  corrimientoPropio: number;
  /** Los proyectos incluidos (con loops o sin ellos todavía). */
  proyectos: ProyectoDelPlan[];
  /** En orden de loop (las fases propias sin número, primero); a igual número, primero las del plan y después por proyecto. */
  fases: FaseDelPlan[];
}

/** Un proyecto de la cuenta que se puede sumar al plan (la lista de «Proyectos del plan»). */
export interface ProyectoParaElegir {
  id: string;
  nombre: string;
  incluido: boolean;
  /** Cuántos loops tiene su cronograma: un proyecto sin loops entra pero no muestra nada todavía. */
  loops: number;
}

/** «01 · Customer 360° & Connections»: el nombre de un loop en la vista del cliente. «00 · Transversal» con el 0. */
export function rotuloDelLoop(numero: number, nombre: string): string {
  return `${String(numero).padStart(2, "0")} · ${nombre}`;
}

/** El orden de las fases del plan: por número de loop (sin número, primero), a igual número las del plan primero. */
export function ordenDeLasFases<T extends { loopNumero: number | null; proyectoNombre: string | null }>(a: T, b: T): number {
  return (a.loopNumero ?? -1) - (b.loopNumero ?? -1) || (a.proyectoNombre ?? "").localeCompare(b.proyectoNombre ?? "", "es");
}
