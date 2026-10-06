"use client";

/**
 * components/clients/ClientProcesosPanel.tsx
 *
 * Pestaña «Procesos» de la cuenta (ficha del cliente › La cuenta). Los procesos son de la cuenta, no
 * de un proyecto: viven en la sección «procesos» del canvas Información del cliente (proyecto
 * __strategy__) y los leen el diagnóstico, la planificación, el kickoff, la ejecución y la entrega.
 *
 * Desde el 2026-10-05 cada proceso es un mapa en carriles con dos versiones —hoy y después de la
 * implementación— que arma el agente de lib/procesos leyendo las reuniones enteras, con la cita de
 * cada paso. La pantalla vive en components/procesos/ProcesosDeLaCuenta.tsx. Los mapas del formato
 * anterior (los del agente `agent-mapeo-inicial`, ya retirado) se siguen viendo ahí hasta volver a
 * mapear. Ver docs/DECISIONS.md «Procesos: un mapa de hoy y uno de después, en carriles».
 */
import ProcesosDeLaCuenta from "@/components/procesos/ProcesosDeLaCuenta";

export default function ClientProcesosPanel({
  clientId,
  slotDelPanel = null,
}: {
  clientId: string;
  /** El panel de la derecha de la ficha (null con el panel oculto). */
  slotDelPanel?: HTMLElement | null;
}) {
  return (
    <div className="px-8 pb-10 pt-6">
      <ProcesosDeLaCuenta clientId={clientId} slotDelPanel={slotDelPanel} />
    </div>
  );
}
