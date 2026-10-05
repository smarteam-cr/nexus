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
import { createPortal } from "react-dom";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { invalidateGps } from "@/lib/clients/gps-cache";

export default function ClientProcesosPanel({
  clientId,
  projectId,
  canvasId,
  slotDelPanel = null,
}: {
  clientId: string;
  projectId: string;
  canvasId: string;
  /** El panel de la derecha de la ficha (null con el panel oculto). */
  slotDelPanel?: HTMLElement | null;
}) {
  const [agentNonce, setAgentNonce] = useState(0);

  return (
    <div className="space-y-5 px-8 pb-10 pt-6">
      {slotDelPanel &&
        createPortal(
          <section className="flex flex-col gap-2.5">
            <span className={ROTULO_DEL_SISTEMA}>De dónde salen</span>
            <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-fg-secondary">
              La IA los mapea con las reuniones y el handoff de la cuenta. Son de la cuenta, no de un
              proyecto: los lee la sección «Procesos» del kickoff de cada proyecto.
            </div>
          </section>,
          slotDelPanel,
        )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight text-fg">Procesos</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Los diagramas de los procesos del cliente, mapeados por la IA.
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
