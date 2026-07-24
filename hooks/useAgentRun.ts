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
import { useAgentRuns } from "@/components/ai/AgentRunsProvider";

export function useAgentRun(clientId: string): {
  /** Fase en curso reportada por el agente ("Analizando sesiones…") o null. */
  phase: string | null;
  /** Sigue una corrida detached hasta DONE/ERROR/TIMEOUT, pintando la fase mientras. */
  track: (runId: string) => Promise<PolledRun>;
} {
  const [phase, setPhase] = useState<string | null>(null);
  // El centro de corridas (AgentRunsProvider) también vigila esta corrida y avisa
  // cuando termina. Si ESTE componente sigue vivo hasta el final, el toast local ya
  // dio la noticia (con más detalle) → se la marca como anunciada para que el
  // provider no la repita. Si el usuario navegó, el componente murió, nadie marcó
  // nada y el aviso lo da el provider: exactamente uno en los dos casos.
  const runs = useAgentRuns();

  const track = useCallback(
    async (runId: string): Promise<PolledRun> => {
      setPhase(null);
      // Avisarle al provider que hay algo nuevo: sin esto tarda hasta un minuto en
      // notar la corrida y el spinner del sidebar aparecería tarde.
      runs?.refrescar();
      try {
        const res = await pollAgentRun(clientId, runId, { onPhase: setPhase });
        // TIMEOUT no se marca: el polling se rindió pero la corrida sigue viva, así
        // que el provider DEBE poder anunciarla cuando de verdad termine.
        if (res.status === "DONE" || res.status === "ERROR") runs?.marcarAnunciada(runId);
        return res;
      } finally {
        setPhase(null);
      }
    },
    [clientId, runs],
  );

  return { phase, track };
}
