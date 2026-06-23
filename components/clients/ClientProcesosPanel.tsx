"use client";

/**
 * components/clients/ClientProcesosPanel.tsx
 *
 * Pestaña top-level "Procesos" del cliente. Muestra los diagramas de proceso
 * (sección "procesos" del canvas "Información del cliente", proyecto __strategy__)
 * en la vista lineal a ancho completo. Se promovió desde la sub-pestaña de
 * ClientInfoPanel — misma data, superficie dedicada (sin migración).
 *
 * CTA "Generar/Regenerar procesos": corre el agente de mapeo (agent-mapeo-inicial,
 * CARDS_AND_FLOWCHARTS → async) anclado acá. Alimenta también la sección "Procesos"
 * del kickoff. Al terminar, agentNonce remonta la vista para refetch.
 */
import { useState } from "react";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { invalidateGps } from "@/lib/clients/gps-cache";

export default function ClientProcesosPanel({
  clientId,
  projectId,
  canvasId,
}: {
  clientId: string;
  projectId: string;
  canvasId: string;
}) {
  const [agentNonce, setAgentNonce] = useState(0);

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-fg">Procesos</h2>
          <p className="text-sm text-fg-muted mt-0.5">
            Diagramas de los procesos del cliente (generados por el agente de mapeo).
          </p>
        </div>
        <CanvasAgentButton
          clientId={clientId}
          projectId={projectId}
          agentId="agent-mapeo-inicial"
          label="Generar procesos"
          runningLabel="Mapeando…"
          async
          onDone={() => {
            setAgentNonce((n) => n + 1);
            // Procesos es client-level y se genera en OTRA pestaña (GPS no montado) → invalidar el
            // cache del GPS para que el pill "Procesos" del widget refetchee al volver al proyecto.
            invalidateGps();
          }}
        />
      </div>
      <CanvasLinearView key={agentNonce} projectId={projectId} canvasId={canvasId} onlyKey="procesos" />
    </div>
  );
}
