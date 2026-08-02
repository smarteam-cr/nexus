/**
 * lib/agents/run-colgada.ts — CUÁNDO una corrida de agente está MUERTA aunque diga que corre.
 * Puro, sin base de datos, sin async. CLIENT-SAFE.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Una corrida se marca `RUNNING` al empezar y `DONE`/`ERROR` al terminar. Si el proceso muere
 * en el medio —un deploy, un reinicio, una caída— nadie escribe el estado final y la fila queda
 * en `RUNNING` PARA SIEMPRE. El centro de corridas la pinta "Corriendo…" indefinidamente.
 *
 * Encontrado en vivo el 2026-08-02: una corrida del detalle de cronograma llevaba **546 horas**
 * (23 días) en `RUNNING`, con `createdAt` idéntico a `updatedAt` — o sea que murió antes de
 * escribir su primer latido. Era la única viva entre 1.598 terminadas: no es un patrón, es una
 * fila que nadie iba a recoger nunca.
 *
 * ── POR QUÉ ESTO Y NO OTRO REAPER ────────────────────────────────────────────
 * Ya había dos barredores, cada uno inventado por su cuenta y acotado a SU familia: el watchdog
 * de CS (solo `cs-account-brief`) y el de Marketing. El agente de cronograma no estaba en
 * ninguna lista, igual que los de canvas y los de business case. Agregar un tercer reaper
 * acotado repetiría el error: la próxima familia volvería a quedar afuera.
 *
 * Este módulo NO barre nada. Define qué significa "colgada" y lo aplica EN LA LECTURA, así
 * cubre a todas las familias de una vez —incluidas las que todavía no existen— sin cron, sin
 * escrituras y sin que nadie tenga que acordarse de registrarse en una lista.
 *
 * ── POR QUÉ 30 MINUTOS ───────────────────────────────────────────────────────
 * Es el más CONSERVADOR de los dos umbrales que ya existían (CS usa 30, Marketing 15). La
 * asimetría del error manda: declarar muerta una corrida viva es mentirle a quien la lanzó y
 * empujarlo a relanzarla al pedo; tardar de más en declararla muerta solo demora una verdad.
 * Ante la duda, se peca de paciente.
 *
 * ⚠ Los 15 minutos de Marketing NO se unifican acá, y es deliberado: responden otra pregunta
 * —"¿hay algo corriendo como para no arrancar otro?"— que no es "¿esto murió?". Coinciden en
 * ser un número de minutos y en nada más. Ver `findActiveRun` en lib/marketing/runs.ts.
 */

/** Sin señales de vida por más de esto, la corrida se considera muerta. */
export const MS_SIN_LATIDO_PARA_COLGADA = 30 * 60 * 1000;

/** Lo que se le muestra a quien la lanzó. Dice QUÉ pasó y QUÉ hacer, no un código. */
export const MOTIVO_COLGADA =
  "La corrida se interrumpió (probablemente un reinicio del servidor) y no dejó resultado. " +
  "Podés volver a lanzarla.";

/** Los dos estados que la UI pinta como "en curso". */
export type EstadoEnCurso = "PENDING" | "RUNNING";

export interface CorridaParaColgada {
  status: string;
  /** Último latido. Se escribe en cada cambio de fase; si nunca cambió, es la creación. */
  updatedAt: Date;
}

/**
 * ¿Esta corrida dice que está viva pero hace rato que no da señales?
 *
 * Mira `updatedAt` y NO `createdAt` a propósito: una corrida larga que va reportando fases
 * (`currentPhase`) refresca su latido y sigue contando como viva por más que haya empezado
 * hace una hora. Con `createdAt` se mataría trabajo legítimo solo por durar.
 */
export function estaColgada(
  corrida: CorridaParaColgada,
  ahora: Date = new Date(),
): boolean {
  if (corrida.status !== "PENDING" && corrida.status !== "RUNNING") return false;
  return ahora.getTime() - corrida.updatedAt.getTime() > MS_SIN_LATIDO_PARA_COLGADA;
}

/** El instante a partir del cual una corrida sigue contando como viva (para el `where`). */
export function cortePorLatido(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - MS_SIN_LATIDO_PARA_COLGADA);
}
