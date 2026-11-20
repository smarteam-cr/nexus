/**
 * lib/plan-general/tipos.ts — el plan general de la cuenta (2026-11-19, kölbi). Client-safe.
 *
 * Una cuenta con varios proyectos tiene UN plan: las fases-loop de todos sus proyectos en el MISMO Gantt de Nexus
 * (TimelineGantt + el panel de tarea), sobre un arranque común. El plan NO guarda nada propio: se arma leyendo los
 * cronogramas (lib/plan-general/armar.ts), y cada cambio se guarda en la tarea de su proyecto, así que editar acá o en
 * el cronograma del proyecto es editar las mismas filas. Lo único propio es la foto que ve el cliente
 * (AccesoAlPlanGeneral.publicado), con la forma del cronograma compartible.
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

/** Una fase del plan: una fase con `loopNumero` del cronograma de un proyecto de la cuenta. */
export interface FaseDelPlan {
  id: string;
  proyectoId: string;
  proyectoNombre: string;
  loopNumero: number;
  name: string;
  durationWeeks: number;
  /** Dónde arranca, desde 0, contada desde el arranque COMÚN del plan (ya corrida por el arranque de su proyecto). */
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
  /** El arranque del plan (ISO): el más temprano de los cronogramas. null = ninguno tiene. */
  ancla: string | null;
  proyectos: ProyectoDelPlan[];
  /** En orden de loop (01, 02…); dos con el mismo número, por proyecto. */
  fases: FaseDelPlan[];
}

/** «01 · Customer 360° & Connections»: el nombre de un loop en la vista del cliente. */
export function rotuloDelLoop(numero: number, nombre: string): string {
  return `${String(numero).padStart(2, "0")} · ${nombre}`;
}
