"use client";

/**
 * components/clients/CanvasAgentButton.tsx
 *
 * CTA reutilizable para EJECUTAR un agente anclado a un canvas (reemplaza el pop-up
 * de agentes). Encapsula POST /api/clients/[id]/analyze {agentId, projectId, async?} +
 * polling (pollAgentRun) si el run es detached + spinner + toast (incluye guards como
 * NO_HANDOFF vía data.message). `onDone` deja al canvas refrescar su contenido.
 */
import { useState } from "react";
import { pollAgentRun, summarizeRun, summarizePollResult } from "@/lib/clients/poll-agent-run";
import { useToast } from "@/components/ui/Toast";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";

export default function CanvasAgentButton({
  clientId,
  projectId,
  agentId,
  label,
  runningLabel = "Generando…",
  async: useAsync = false,
  onDone,
  className,
  notifyLabel,
  clientName,
}: {
  clientId: string;
  projectId: string;
  agentId: string;
  label: string;
  runningLabel?: string;
  /** true para agentes pesados (CARDS_AND_FLOWCHARTS) — corren detached y polleamos. */
  async?: boolean;
  onDone?: () => void;
  className?: string;
  /** Sustantivo para la notificación ("diagnóstico"). Default: se deriva del `label`. */
  notifyLabel?: string;
  clientName?: string | null;
}) {
  const [running, setRunning] = useState(false);
  const toast = useToast();

  // Notificación "agente terminado": etiqueta = notifyLabel o el label sin el verbo.
  const noun =
    notifyLabel ??
    (label.replace(/^(generar|regenerar|crear)\s+(el\s+|la\s+|los\s+|las\s+)?/i, "").trim() || "documento");
  const notifyUrl = `/clients/${clientId}`;

  const run = async () => {
    if (running) return;
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    setRunning(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId, ...(useAsync ? { async: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Guards (p.ej. NO_HANDOFF) devuelven { error, message } → mostrar el mensaje claro.
        toast.error(data.message ?? data.error ?? "No se pudo ejecutar el agente.");
      } else if (data.runId) {
        const result = await pollAgentRun(clientId, data.runId);
        const summary = summarizePollResult(result);
        if (summary.type === "success") {
          toast.success(summary.message);
          onDone?.();
        } else {
          toast.error(summary.message);
        }
        void notifyAgentDone({ label: noun, clientName, ok: summary.type === "success", url: notifyUrl });
      } else {
        toast.success(`Listo — ${summarizeRun(data)}`);
        onDone?.();
        void notifyAgentDone({ label: noun, clientName, ok: true, url: notifyUrl });
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
      className={
        className ??
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
      }
    >
      {running ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )}
      {running ? runningLabel : label}
    </button>
  );
}
