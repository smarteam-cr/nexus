/**
 * lib/timeline/actual-dates.ts
 *
 * D.3 fundación — captura de fechas REALES de ejecución (TimelinePhase / TimelineTask).
 * Única fuente de la semántica status→fechas, compartida por los puntos donde muta el
 * status: PATCH tasks/[taskId], PATCH phases/[phaseId] y el bulk de progress/apply.
 *
 * Reglas (idénticas para fase y tarea):
 *  - IN_PROGRESS: actualStart = now si está null (no pisa el inicio ya registrado);
 *                 actualEnd = null (volver a "en curso" desde DONE lo limpia).
 *  - DONE:        actualEnd = now; actualStart = now si está null (arrancó y terminó junto).
 *  - PENDING:     limpia ambas (reset: no ocurrió).
 *
 * Para el bulk (progress/apply → DONE con updateMany) NO se usa este helper fila-a-fila:
 * se replica con un par de updateMany (set actualEnd a todos + set actualStart donde es null),
 * manteniendo las mismas reglas. Ver el comentario en progress/apply.
 */
import type { TimelineTaskStatus } from "@prisma/client";

export function actualDatesPatch(
  newStatus: TimelineTaskStatus,
  current: { actualStart: Date | null },
  now: Date = new Date(),
): { actualStart?: Date | null; actualEnd?: Date | null } {
  switch (newStatus) {
    case "IN_PROGRESS":
      return { actualStart: current.actualStart ?? now, actualEnd: null };
    case "DONE":
      return { actualStart: current.actualStart ?? now, actualEnd: now };
    case "PENDING":
    default:
      return { actualStart: null, actualEnd: null };
  }
}
