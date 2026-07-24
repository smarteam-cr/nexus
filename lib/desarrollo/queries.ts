/**
 * lib/desarrollo/queries.ts — lecturas del módulo Desarrollo.
 */
import { prisma } from "@/lib/db/prisma";

/** Una estimación tal como la consume la UI (fechas ya serializadas a ISO). */
export interface DevEstimateDTO {
  id: string;
  hours: number | null;
  /** ISO `YYYY-MM-DD` (sin hora: la estimación es de día, no de instante). */
  estimatedDate: string | null;
  note: string | null;
  createdByEmail: string;
  createdAt: string;
}

export interface DevEstimateState {
  /** La estimación VIGENTE = la más reciente. `null` si nunca se estimó. */
  current: DevEstimateDTO | null;
  /** Re-estimaciones anteriores, de la más nueva a la más vieja (sin la vigente). */
  history: DevEstimateDTO[];
}

function toDTO(r: {
  id: string;
  hours: number | null;
  estimatedDate: Date | null;
  note: string | null;
  createdByEmail: string;
  createdAt: Date;
}): DevEstimateDTO {
  return {
    id: r.id,
    hours: r.hours,
    estimatedDate: r.estimatedDate ? r.estimatedDate.toISOString().slice(0, 10) : null,
    note: r.note,
    createdByEmail: r.createdByEmail,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Estimación vigente + historial de un proyecto.
 *
 * La tabla es APPEND-ONLY: la vigente es simplemente la fila más reciente. Se lee TODO el
 * historial en una query (son unidades de filas por proyecto — re-estimar es un evento raro)
 * en vez de dos queries separadas.
 */
export async function loadDevEstimate(projectId: string): Promise<DevEstimateState> {
  const rows = await prisma.devEstimate.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      hours: true,
      estimatedDate: true,
      note: true,
      createdByEmail: true,
      createdAt: true,
    },
  });
  const dtos = rows.map(toDTO);
  return { current: dtos[0] ?? null, history: dtos.slice(1) };
}
