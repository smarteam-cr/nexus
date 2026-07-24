/**
 * lib/desarrollo/mutations.ts — escrituras del módulo Desarrollo.
 */
import { prisma } from "@/lib/db/prisma";
import { loadDevEstimate, type DevEstimateState } from "./queries";
import type { DevEstimateCreateInput } from "./schema";

/**
 * Registra una estimación NUEVA. APPEND-ONLY: nunca actualiza la anterior — re-estimar
 * es agregar una fila, y la vigente pasa a ser esta. Así queda el rastro de cómo se movió
 * la estimación a lo largo del proyecto (que es el punto de guardar historial).
 *
 * Devuelve el estado completo (vigente + historial) para que el caller no tenga que
 * hacer un segundo GET.
 */
export async function addDevEstimate(
  projectId: string,
  input: DevEstimateCreateInput,
  createdByEmail: string,
): Promise<DevEstimateState> {
  const fecha = input.estimatedDate?.trim();
  await prisma.devEstimate.create({
    data: {
      projectId,
      hours: input.hours ?? null,
      // Se ancla a mediodía UTC: con `new Date("2026-08-01")` (medianoche UTC) cualquier
      // zona al oeste de Greenwich muestra el día ANTERIOR al re-formatear.
      estimatedDate: fecha ? new Date(`${fecha}T12:00:00.000Z`) : null,
      note: input.note?.trim() || null,
      createdByEmail,
    },
  });
  return loadDevEstimate(projectId);
}
