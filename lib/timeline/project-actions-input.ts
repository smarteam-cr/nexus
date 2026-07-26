/**
 * lib/timeline/project-actions-input.ts
 *
 * De las SEÑALES CRUDAS de un cronograma al input de `buildProjectActions`. Puro, client-safe.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El motor de acciones (`project-actions.ts`) siempre fue puro, pero armar su input no lo era:
 * vivía en un `useMemo` de 50 líneas dentro de `CronogramaCanvas.tsx`, cruzando el summary con
 * las fases del Gantt, las particularidades y cuatro helpers. O sea que **las acciones de un
 * proyecto solo existían si alguien abría ese proyecto**.
 *
 * Eso alcanzaba mientras "Qué hacer acá" viviera arriba del Gantt. Dejó de alcanzar cuando la
 * lista se mudó a una bandeja que muestra la cartera entera: un CSE carga 13 a 17 proyectos
 * activos, y montar 17 canvases para saber qué hacer no es una opción.
 *
 * Acá está el mismo cálculo, movido TAL CUAL —sin una sola regla nueva—, para que lo puedan
 * llamar los dos: el canvas (con sus fases locales, que reaccionan antes del próximo `load()`)
 * y el cargador batch del servidor. Una función pura, dos llamadores, cero divergencia posible.
 *
 * ── `now` PUEDE SER null, Y ES A PROPÓSITO ───────────────────────────────────
 * Todo lo que depende de "hoy" (atrasos, compromisos vencidos, pendientes del cliente) se apaga
 * con `now: null`. En el canvas eso pasa antes de hidratar: calcular con la hora del servidor y
 * después con la del navegador producía dos árboles distintos y React se quejaba. En el servidor
 * `now` siempre viene, así que la rama nula es solo para el primer pintado del cliente.
 */
import { buildProjectActions, type ProjectActionsInput, type ProjectAction } from "./project-actions";
import { collectClientBlockers } from "./client-blockers";
import { summarizeDuplicates } from "./particularidad-identity";
import { esCompromisoPendiente } from "./particularidad-to-task";
import { computePhaseRanges, overduePlannedEnd, isOverdueByDate } from "./weeks";

/** Lo mínimo de una tarea para resolver atrasos y pendientes del cliente. */
export interface ActionTask {
  /** null cuando la tarea todavía no existe en la base (fila nueva sin guardar). */
  id?: string | null;
  title: string;
  weekIndex: number;
  status?: string;
  party?: string | null;
}

/** Lo mínimo de una fase. `order` opcional: si falta manda la posición del array. */
export interface ActionPhase {
  order?: number;
  name: string;
  startWeek?: number | null;
  durationWeeks: number;
  tasks?: ActionTask[];
}

/** Lo mínimo de una particularidad CONFIRMADA (las `needsValidation` van por otro campo). */
export interface ActionParticularidad {
  id: string;
  kind: string;
  title: string;
  weeksImpact?: number | null;
  convertedTaskId?: string | null;
  sourceQuote?: string | null;
  party?: string | null;
  occurredAt?: string | Date | null;
}

/** Lo que hay que saber de un cronograma para resolver sus acciones. */
export interface TimelineActionSignals {
  anchorStartDate: string | null;
  detailConfirmedAt: string | null;
  /** ¿Hay detalle generado por el agente? (no "¿hay alguna tarea?" — ver el canvas). */
  hasTasks: boolean;
  /** Borradores del agente esperando confirmación. */
  pendingProgress: boolean;
  pendingParticularidades: number;
  pendingProposal: boolean;
  /** Confirmadas (needsValidation = false). */
  particularidades: ActionParticularidad[];
  /** Cuántas reportó una PERSONA del equipo y esperan respuesta (needsValidation = true). */
  sugerenciasDelEquipo: number;
  phases: ActionPhase[];
}

/** El pedazo del summary de cartera que el motor necesita. Sin Prisma ni imports pesados. */
export interface ActionSummary {
  scheduleAlarmsActive?: boolean;
  overdueTasks?: number;
  stageAlarms?: Array<{ key: string; label: string; days: number }>;
  scope?: {
    measurable: boolean;
    exceeded: boolean;
    attenuated: boolean;
    addedTasks: number;
    weeksDelta: number;
  };
  stalled?: boolean;
  daysSinceActivity?: number | null;
}

/**
 * Traduce las señales al input del motor. `now: null` apaga todo lo que depende de "hoy".
 */
export function buildActionsInput(
  s: TimelineActionSignals,
  summary: ActionSummary | null,
  now: Date | null,
): ProjectActionsInput {
  const anchor = s.anchorStartDate || null;
  const blockers = anchor && now ? collectClientBlockers(s.phases, anchor, now) : [];
  const scope = summary?.scope;

  return {
    pendingProgress: s.pendingProgress,
    pendingParticularidades: s.pendingParticularidades,
    pendingProposal: s.pendingProposal,
    sugerenciasDelEquipo: s.sugerenciasDelEquipo,
    anchorStartDate: anchor,
    detailConfirmedAt: s.detailConfirmedAt,
    hasTasks: s.hasTasks,
    // ATRASO sin semanas: no suma al corrimiento, así que el total que ve el CSE queda corto.
    sinCuantificar: s.particularidades.filter((p) => p.kind === "ATRASO" && !p.weeksImpact).length,
    duplicados: summarizeDuplicates(s.particularidades),
    // Trabajo anotado que nadie está persiguiendo. MISMO criterio que el grupo "Compromisos sin
    // dueño" al que lleva el botón: si acá se contaran también los atrasos sin cuantificar
    // (que son convertibles) el número saldría inflado y no coincidiría con ningún grupo — y
    // además los estaría contando dos veces, porque ya tienen su propia línea.
    compromisosSinTarea: s.particularidades.filter(esCompromisoPendiente).length,
    compromisosVencidos: contarCompromisosVencidos(s, anchor, now),
    pendientesDelClienteVencidos: blockers.length,
    // Las alarmas de cronograma solo aplican cuando la etapa ya lo dio por consensuado.
    tareasVencidas: summary?.scheduleAlarmsActive ? (summary?.overdueTasks ?? 0) : 0,
    alarmasDeEtapa: summary?.stageAlarms ?? [],
    // `attenuated` = el baseline es flojo, así que el "extra" probablemente sea detalle, no alcance real.
    alcanceExcedido:
      scope?.exceeded && scope.measurable && !scope.attenuated
        ? { addedTasks: scope.addedTasks, weeksDelta: scope.weeksDelta }
        : null,
    estancadoDias: summary?.stalled ? (summary.daysSinceActivity ?? null) : null,
  };
}

/**
 * Compromisos que YA tienen tarea, cuya fecha pasó y siguen sin hacerse.
 *
 * Usa el MISMO predicado de atraso del resto del sistema (semana + anchor), no una segunda
 * matemática basada en `committedDueDate`: dos definiciones de "vencido" conviviendo es
 * exactamente cómo se llega a que dos pantallas muestren números distintos del mismo proyecto.
 */
function contarCompromisosVencidos(
  s: TimelineActionSignals,
  anchor: string | null,
  now: Date | null,
): number {
  const conTarea = new Set(
    s.particularidades.map((p) => p.convertedTaskId).filter((id): id is string => !!id),
  );
  if (conTarea.size === 0 || !anchor || !now) return 0;
  const ranges = computePhaseRanges(s.phases);
  let n = 0;
  s.phases.forEach((ph, i) => {
    for (const t of ph.tasks ?? []) {
      if (!t.id || !conTarea.has(t.id)) continue;
      const fin = overduePlannedEnd(anchor, ranges[i].start, t.weekIndex);
      // Sin estado explícito se asume PENDING: el predicado solo perdona DONE y SUSPENDED, y
      // una tarea de estado desconocido no puede darse por resuelta.
      if (isOverdueByDate(fin, now, t.status ?? "PENDING")) n++;
    }
  });
  return n;
}

/**
 * Señales → acciones, en un paso. Es lo que llaman el canvas y el cargador batch.
 *
 * ── SIN FASES NO HAY CRONOGRAMA, Y SIN CRONOGRAMA NO HAY NADA QUE DECIR ──────
 * Un proyecto sin una sola fase **no tiene cronograma**, y sobre lo que no existe este motor
 * no opina. La compuerta parece obvia y no lo era: el canvas la tenía implícita (solo pinta el
 * panel con `phases.length > 0`), pero el cargador batch no, y la primera corrida contra la
 * cartera real lo mostró — de los 40 proyectos a los que les emitía "El cronograma no tiene
 * fecha de arranque · Fijar el arranque", **24 no tenían cronograma en absoluto**. Ese aviso
 * habría sido el bloque más poblado de la bandeja, y habría sido falso: no hay nada que fijar
 * porque no hay plan.
 *
 * Que un proyecto no tenga cronograma SÍ es un pendiente — pero es de otro dueño: el
 * desplegable de piezas ya lo dice ("vacía" / "por activar"), y `PortfolioRow.setup` ya trae
 * la señal para que la bandeja la pinte sin que este motor invente una acción que no aplica.
 */
export function actionsFromSignals(
  s: TimelineActionSignals,
  summary: ActionSummary | null,
  now: Date | null,
): ProjectAction[] {
  if (s.phases.length === 0) return [];
  return buildProjectActions(buildActionsInput(s, summary, now));
}
