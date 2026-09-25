/**
 * lib/timeline/borrador-del-detalle.ts — el borrador del cronograma y la corrida que arma sus TAREAS
 * (el paso 2 de «Regenerar todo» y de «Generar cronograma»). SERVER-ONLY: lee la base.
 *
 * El estado de las tareas NO se guarda (§0.4 de la especificación de E2a): se DEDUCE de la corrida
 * con `estadoDeLasTareas` (lib/timeline/borrador.ts), con el umbral único de `estaColgada`. Así no
 * hay una máquina de estados que se desincronice con la corrida real: si el proceso muere, la
 * corrida queda colgada y el borrador pasa solo a «fallo».
 *
 * E2a P2 trae la LECTURA (la usan aplicar y el descarte automático). P4 suma acá la prevalidación,
 * la marca «armando» y la fusión del paso 2.
 */
import { prisma } from "@/lib/db/prisma";
import { parseRunError } from "@/lib/agents/run-error";
import { esBorradorV1, estadoDeLasTareas, leerBorrador, type EstadoDeLasTareas } from "./borrador";

export interface EstadoDeLasTareasDelBorrador {
  estado: EstadoDeLasTareas;
  /** Solo en «armando»: la fase que reporta la corrida (`currentPhase`), o null. */
  fase: string | null;
  /** Solo en «fallo»: por qué, en palabras del CSE. null = no se sabe (la pantalla dice lo genérico). */
  motivo: string | null;
}

/** Propio y no `MOTIVO_COLGADA` (run-colgada.ts), que tiene voseo. */
export const MOTIVO_TAREAS_CORTADAS =
  "Se cortó mientras armaba las tareas (probablemente un reinicio del servidor).";
export const MOTIVO_TAREAS_SIN_GUARDAR = "No se pudieron guardar las tareas.";

/** Lo que se lee de la corrida del paso 2. */
export interface CorridaDeLasTareas {
  status: string;
  updatedAt: Date;
  currentPhase: string | null;
  output: string | null;
}

/**
 * Por qué fallaron las tareas, según la corrida (ya se sabe que el estado es «fallo»). Puro.
 *   · ERROR → el error humanizado que dejó `markError` (el único lector de ese contrato es
 *     `parseRunError`). Su texto genérico tiene voseo: sin un error propio, null;
 *   · todavía PENDING/RUNNING → está colgada (si no, el estado sería «armando»);
 *   · DONE → terminó y no se fusionó;
 *   · sin fila, o ARCHIVED → null.
 */
export function motivoDelFallo(corrida: CorridaDeLasTareas | null): string | null {
  if (!corrida) return null;
  switch (corrida.status) {
    case "ERROR": {
      const motivo = parseRunError(corrida.output);
      return motivo === parseRunError(null) ? null : motivo;
    }
    case "PENDING":
    case "RUNNING":
      return MOTIVO_TAREAS_CORTADAS;
    case "DONE":
      return MOTIVO_TAREAS_SIN_GUARDAR;
    default:
      return null;
  }
}

/**
 * El estado de las tareas del borrador guardado en `pendingProposal`. null = no es un `borrador-v1`
 * o no espera tareas (el handoff, el formato viejo). Solo lee la corrida cuando hace falta: con las
 * tareas listas, o sin corrida, la respuesta sale del JSON.
 */
export async function leerEstadoDeLasTareas(
  guardado: unknown,
  ahora: Date = new Date(),
): Promise<EstadoDeLasTareasDelBorrador | null> {
  if (!esBorradorV1(guardado)) return null;
  // La base no importa para un v1: solo se usa para convertir el formato viejo.
  const tareas = leerBorrador(guardado, { ancla: null, fases: [] })?.tareas ?? null;
  if (tareas === null) return null;
  if (tareas.listas || tareas.corrida === null) {
    const estado = estadoDeLasTareas(tareas, null, ahora);
    return estado === null ? null : { estado, fase: null, motivo: null };
  }
  const corrida = await prisma.agentRun.findUnique({
    where: { id: tareas.corrida },
    select: { status: true, updatedAt: true, currentPhase: true, output: true },
  });
  const estado = estadoDeLasTareas(tareas, corrida, ahora);
  if (estado === null) return null;
  return {
    estado,
    fase: estado === "armando" ? (corrida?.currentPhase ?? null) : null,
    motivo: estado === "fallo" ? motivoDelFallo(corrida) : null,
  };
}
