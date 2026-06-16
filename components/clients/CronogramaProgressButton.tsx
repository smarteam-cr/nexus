"use client";

/**
 * components/clients/CronogramaProgressButton.tsx
 *
 * CTA del agente de AVANCE (D.2) para el canvas Cronograma, anclado junto al
 * nombre del canvas (mismo patrón que CanvasAgentButton, que es el CTA de los
 * demás canvases). Dispara POST /api/projects/[projectId]/timeline/progress
 * (mismo motor que el disparo automático de postProcessSession), interpreta el
 * resultado y, en éxito, llama onDone() para que el panel remonte el Cronograma
 * y muestre el banner de avance. No aplica nada — eso lo hace el CSE en el banner.
 */
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function CronogramaProgressButton({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/progress`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo chequear el avance.");
      } else if (data?.status === "ok") {
        toast.success("Avance propuesto — revisalo abajo.");
        onDone?.();
      } else if (data?.status === "skipped") {
        toast.info(
          data.reason === "no_detail"
            ? "Generá el detalle del cronograma primero."
            : "No se detectó avance nuevo.",
        );
      } else {
        toast.error("No se pudo chequear el avance.");
      }
    } catch {
      toast.error("Error de conexión.");
    }
    setRunning(false);
  };

  return (
    <button
      onClick={run}
      disabled={running}
      title="El agente revisa la etapa de HubSpot + las sesiones y propone el avance — vos lo confirmás"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
    >
      {running ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
      {running ? "Chequeando…" : "Re-chequear avance"}
    </button>
  );
}
