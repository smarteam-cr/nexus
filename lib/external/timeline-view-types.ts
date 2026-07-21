/**
 * lib/external/timeline-view-types.ts
 *
 * Contrato de tipos del cronograma EXTERNO — lo que cruza al cliente (D.1.5).
 * Archivo SOLO-tipos (sin imports de runtime), compartido por los dos
 * chokepoints (kickoff-view y timeline-view) y los renders cliente.
 * kickoff-view-types los re-exporta con sus nombres históricos
 * (KickoffTask/KickoffPhase/KickoffTimelineData) para no churnear KickoffLanding.
 *
 * CLAVE DE SEGURIDAD: por tarea cruzan {title, weekIndex, status, party} — el
 * status y el party (responsable) los muestra la página compartible del
 * cronograma (gated por "Subir"); notes/source/needsValidation siguen internos y
 * NUNCA cruzan, y las tareas SUSPENDED se excluyen por completo. Las notas DE FASE sí cruzan
 * (by-design D.1: texto en lenguaje cliente), y el TIPO DE ACTIVIDAD de la
 * fase también (by-design D.1.5: el Gantt del cliente colorea y leyenda por
 * tipo — la taxonomía es presentable: Exploración/Planificación/…). El
 * `source` de fase NO cruza.
 */

export interface ExternalTimelineTask {
  title: string;
  weekIndex: number; // 0-indexed relativo a la fase
  /** Estado de avance (PENDING|IN_PROGRESS|DONE) — lo muestra el cronograma compartible (gated por "Subir"). SUSPENDED nunca llega. Opcional: snapshots viejos no lo tienen. */
  status?: string;
  /** Responsable (CLIENTE|SMARTEAM|AMBOS|DEV) — lo muestra el cronograma compartible. null/ausente = sin asignar. */
  party?: string | null;
  /** Tipo (SESSION|TASK). El cronograma compartible muestra badge "Sesión" SOLO si es SESSION; TASK no muestra nada. */
  type?: string | null;
}

export interface ExternalTimelinePhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  /** Inicio explícito (offset 0-based). null = contigua. Cruza para que el landing muestre el paralelismo. */
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  /** Tipo de actividad (EXPLORACION|PLANIFICACION|CONFIGURACION|ADOPCION|SEGUIMIENTO) — colorea el Gantt del cliente. */
  activityType: string | null;
  /** Presente SOLO si el CSE confirmó el detalle (detailConfirmedAt != null). */
  tasks?: ExternalTimelineTask[];
}

/**
 * PARTICULARIDAD visible al cliente — desviación curada con atribución. Cruza SOLO si
 * visibleExternal=true (gate por-registro en el chokepoint, como SUSPENDED). CLAVE DE
 * SEGURIDAD: cruzan solo {kind, party, title, detail, weeksImpact, phaseId, occurredAt};
 * NUNCA cruzan source/needsValidation/createdByEmail NI sourceQuote (fail-closed).
 */
export interface ExternalParticularidad {
  /** ATRASO | COMPROMISO (SOLICITUD = legacy, no se crean nuevas). */
  kind: string;
  /** CLIENTE | SMARTEAM | AMBOS | DEV — atribución de la causa. */
  party: string;
  title: string;
  detail: string | null;
  /** Semanas de corrimiento que causó; null si no movió fechas. */
  weeksImpact: number | null;
  /** Fase ancla (opcional); null si es a nivel cronograma. */
  phaseId: string | null;
  /** Cuándo ocurrió (ISO). */
  occurredAt: string;
}

export interface ExternalTimelineData {
  exists: boolean;
  anchorStartDate: string | null;
  phases: ExternalTimelinePhase[];
  /** Desviaciones curadas visibles al cliente (visibleExternal=true). Ausente en snapshots
   *  viejos congelados antes de esta feature → el render trata undefined como []. */
  particularidades?: ExternalParticularidad[];
}
