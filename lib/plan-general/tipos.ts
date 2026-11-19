/**
 * lib/plan-general/tipos.ts — el plan general de la cuenta (2026-11-19, kölbi). Client-safe.
 *
 * Una cuenta con varios proyectos tiene UN plan: los loops de todos sus proyectos en un solo gantt. Cada loop es una
 * fase de un cronograma con `loopNumero`; cada fila del plan es una tarea de esa fase. El plan NO guarda nada propio:
 * se arma leyendo los cronogramas (lib/plan-general/armar.ts), así que editar acá o en el cronograma del proyecto es
 * editar lo mismo. Lo único propio es la foto que ve el cliente (AccesoAlPlanGeneral.publicado).
 */

/** Los tipos de trabajo de una actividad, en el orden del método. `tipoDeTrabajo` en `TimelineTask`. */
export const TIPOS_DE_TRABAJO = [
  "diagnostico",
  "diseno",
  "ejecucion",
  "optimizacion",
  "medicion",
  "continuidad",
  "cierre",
] as const;
export type TipoDeTrabajo = (typeof TIPOS_DE_TRABAJO)[number];

export const ETIQUETA_DEL_TIPO: Record<TipoDeTrabajo, string> = {
  diagnostico: "Diagnóstico",
  diseno: "Diseño",
  ejecucion: "Ejecución",
  optimizacion: "Optimización",
  medicion: "Medición",
  continuidad: "Continuidad",
  cierre: "Cierre de ciclo",
};

export function esTipoDeTrabajo(v: unknown): v is TipoDeTrabajo {
  return typeof v === "string" && (TIPOS_DE_TRABAJO as readonly string[]).includes(v);
}

/** Los tres estados que se ven en el plan. SUSPENDED no es un estado del plan: la tarea salió de él. */
export type EstadoDelPlan = "PENDING" | "IN_PROGRESS" | "DONE";
export const ETIQUETA_DEL_ESTADO: Record<EstadoDelPlan, string> = {
  DONE: "Hecho",
  IN_PROGRESS: "En curso",
  PENDING: "Por iniciar",
};

/** Una actividad del plan. Las semanas van desde 1, contadas desde el arranque del plan (la semana 1 es la del arranque). */
export interface FilaDelPlan {
  tareaId: string;
  titulo: string;
  tipo: TipoDeTrabajo | null;
  /** Primera y última semana (1 en adelante, inclusivas). */
  desde: number;
  hasta: number;
  estado: EstadoDelPlan;
  /** El detalle (las notas de la tarea). Interno: nunca va en la foto del cliente. */
  detalle: string | null;
  /** La tarea típica que inventó un agente y nadie revisó: el equipo la ve marcada, el cliente no la ve hasta que
   *  alguien la edita en el plan (o en el Gantt). */
  porValidar: boolean;
}

/** Un loop: una fase de un cronograma con `loopNumero`. */
export interface GrupoDelPlan {
  loopNumero: number;
  nombre: string;
  faseId: string;
  proyectoId: string;
  proyectoNombre: string;
  /** Dónde arranca la fase en el plan (semana 1 en adelante) y cuántas semanas tiene: el rango donde caben sus filas. */
  faseDesde: number;
  faseSemanas: number;
  /** El cronograma de su proyecto tiene el detalle confirmado: sin eso, el cliente no ve sus actividades. */
  detalleConfirmado: boolean;
  filas: FilaDelPlan[];
}

export interface PlanGeneral {
  /** El arranque del plan (ISO, día de calendario en UTC): el más temprano de los cronogramas. null = ninguno tiene. */
  arranque: string | null;
  /** Cuántas semanas tiene el plan: la última que ocupa alguna fase o actividad. */
  semanas: number;
  grupos: GrupoDelPlan[];
}

/** «01 · Customer 360° & Connections» */
export function rotuloDelLoop(numero: number, nombre: string): string {
  return `${String(numero).padStart(2, "0")} · ${nombre}`;
}

/**
 * Cuántas semanas puede durar una tarea que arranca en `weekIndex` dentro de una fase de `durationWeeks`: lo que pidió,
 * recortado al final de la fase. 1 se guarda como null (lo de siempre). Lo usa el PUT del cronograma al crear o
 * recrear una tarea (moverla de fase la recrea).
 */
export function semanasQueCaben(semanas: number | null | undefined, weekIndex: number, durationWeeks: number): number | null {
  if (!semanas || semanas <= 1) return null;
  const n = Math.min(semanas, Math.max(1, durationWeeks - weekIndex));
  return n > 1 ? n : null;
}
