/**
 * lib/timeline/actual-dates.ts
 *
 * D.3 fundación — captura de fechas REALES de ejecución (TimelinePhase / TimelineTask).
 * Única fuente de la semántica status→fechas, compartida por los puntos donde muta el
 * status: PATCH tasks/[taskId], PATCH phases/[phaseId] y el bulk de progress/apply.
 *
 * MODELO MONÓTONO (las fechas son HECHOS de ejecución; el `status` es el estado de HOY):
 *  - IN_PROGRESS: sella `actualStart` la PRIMERA vez (si está null). No toca `actualEnd`.
 *  - DONE:        sella `actualEnd` (al momento actual) + `actualStart` si faltaba.
 *  - PENDING:     NO borra nada. Volver atrás (reset/misclick/reapertura) preserva las
 *                 fechas — el `status` ya refleja "no hecho hoy"; las fechas quedan como
 *                 histórico de cuándo ocurrió de verdad.
 * Las fechas SOLO se setean/avanzan, nunca se auto-borran → ningún toggle pierde un hecho.
 *
 * Contrato para D.3: para "¿está hecho hoy?" mandа el `status`; `actualStart`/`actualEnd`
 * son los timestamps del último inicio/fin y PUEDEN existir aunque el status no sea DONE
 * (p.ej. una tarea completada y luego reabierta). La alarma debe cruzar ambos.
 *
 * El bulk de progress/apply NO usa este helper fila-a-fila (usa un par de updateMany),
 * pero replica las MISMAS reglas: al DONE setea actualEnd + actualStart donde es null, y
 * nunca borra. Ver progress/apply.
 */
import type { TimelineTaskStatus } from "@prisma/client";

export function actualDatesPatch(
  newStatus: TimelineTaskStatus,
  current: { actualStart: Date | null },
  now: Date = new Date(),
): { actualStart?: Date; actualEnd?: Date } {
  switch (newStatus) {
    case "IN_PROGRESS":
      // Inicio real la 1ª vez; el fin queda como esté (preserva si ya se completó antes).
      return current.actualStart ? {} : { actualStart: now };
    case "DONE":
      // Sella el fin (al más reciente) y el inicio si faltaba.
      return current.actualStart ? { actualEnd: now } : { actualStart: now, actualEnd: now };
    case "PENDING":
    default:
      // Reset: el status vuelve a PENDING pero NO se borran los hechos de ejecución.
      return {};
  }
}
