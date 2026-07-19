"use client";

/**
 * hooks/useAgentRun.ts — seguimiento de una corrida de agente CON fase visible.
 *
 * El contrato es transport-agnostic a propósito: el consumidor recibe `{ phase, track }`
 * y no sabe si abajo hay polling o streaming — hoy el motor es `pollAgentRun` (el worker
 * detached persiste `AgentRun.currentPhase` en DB y el GET lo expone); si mañana hay un
 * endpoint SSE, se cambia ESTE archivo y ningún disparador se entera.
 *
 * Uso (el flujo imperativo de los disparadores no cambia):
 *   const { phase, track } = useAgentRun(clientId);
 *   ...
 *   const result = await track(data.runId);   // ← en vez de pollAgentRun(clientId, runId)
 *   ...
 *   <span>{phase ?? runningLabel}</span>      // ← "Analizando sesiones…" real, con fallback
 *
 * `phase` es null fuera de una corrida y vuelve a null al terminar (el label estático
 * del botón retoma). `track` es estable por clientId (useCallback).
 */
import { useCallback, useState } from "react";
import { pollAgentRun, type PolledRun } from "@/lib/clients/poll-agent-run";

export function useAgentRun(clientId: string): {
  /** Fase en curso reportada por el agente ("Analizando sesiones…") o null. */
  phase: string | null;
  /** Sigue una corrida detached hasta DONE/ERROR/TIMEOUT, pintando la fase mientras. */
  track: (runId: string) => Promise<PolledRun>;
} {
  const [phase, setPhase] = useState<string | null>(null);

  const track = useCallback(
    async (runId: string): Promise<PolledRun> => {
      setPhase(null);
      try {
        return await pollAgentRun(clientId, runId, { onPhase: setPhase });
      } finally {
        setPhase(null);
      }
    },
    [clientId],
  );

  return { phase, track };
}
