"use client";

/**
 * components/clients/ClientProcesosPanel.tsx
 *
 * Pestaña top-level "Procesos" del cliente. Muestra los diagramas de proceso
 * (sección "procesos" del canvas "Información del cliente", proyecto __strategy__)
 * en la vista lineal a ancho completo. Se promovió desde la sub-pestaña de
 * ClientInfoPanel — misma data, superficie dedicada (sin migración).
 */
import CanvasLinearView from "@/components/canvas/CanvasLinearView";

export default function ClientProcesosPanel({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  return (
    <div className="px-6 py-4 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-fg">Procesos</h2>
        <p className="text-sm text-fg-muted mt-0.5">
          Diagramas de los procesos del cliente (generados por el agente de mapeo).
        </p>
      </div>
      <CanvasLinearView projectId={projectId} canvasId={canvasId} onlyKey="procesos" />
    </div>
  );
}
