/**
 * lib/external/timeline-view-types.ts
 *
 * Contrato de tipos del cronograma EXTERNO — lo que cruza al cliente (D.1.5).
 * Archivo SOLO-tipos (sin imports de runtime), compartido por los dos
 * chokepoints (kickoff-view y timeline-view) y los renders cliente.
 * kickoff-view-types los re-exporta con sus nombres históricos
 * (KickoffTask/KickoffPhase/KickoffTimelineData) para no churnear KickoffLanding.
 *
 * CLAVE DE SEGURIDAD: tareas SOLO {title, weekIndex} — status/notes/source/
 * needsValidation son internos y NUNCA cruzan. Las notas DE FASE sí cruzan
 * (by-design D.1: texto en lenguaje cliente), y el TIPO DE ACTIVIDAD de la
 * fase también (by-design D.1.5: el Gantt del cliente colorea y leyenda por
 * tipo — la taxonomía es presentable: Exploración/Planificación/…). El
 * `source` de fase NO cruza.
 */

export interface ExternalTimelineTask {
  title: string;
  weekIndex: number; // 0-indexed relativo a la fase
}

export interface ExternalTimelinePhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  /** Tipo de actividad (EXPLORACION|PLANIFICACION|CONFIGURACION|ADOPCION|SEGUIMIENTO) — colorea el Gantt del cliente. */
  activityType: string | null;
  /** Presente SOLO si el CSE confirmó el detalle (detailConfirmedAt != null). */
  tasks?: ExternalTimelineTask[];
}

export interface ExternalTimelineData {
  exists: boolean;
  anchorStartDate: string | null;
  phases: ExternalTimelinePhase[];
}
