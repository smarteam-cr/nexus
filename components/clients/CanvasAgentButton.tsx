"use client";

/**
 * components/clients/CanvasAgentButton.tsx
 *
 * CTA reutilizable para EJECUTAR un agente anclado a un canvas (reemplaza el pop-up
 * de agentes). Encapsula POST /api/clients/[id]/analyze {agentId, projectId, async?} +
 * polling (pollAgentRun) si el run es detached + spinner + toast (incluye guards como
 * NO_HANDOFF vía data.message). `onDone` deja al canvas refrescar su contenido.
 */
import { useState, useRef, useEffect } from "react";
import { pollAgentRun, summarizeRun } from "@/lib/clients/poll-agent-run";

export default function CanvasAgentButton({
  clientId,
  projectId,
  agentId,
  label,
  runningLabel = "Generando…",
  async: useAsync = false,
  onDone,
  className,
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
}) {
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const run = async () => {
    if (running) return;
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
        showToast(data.message ?? data.error ?? "No se pudo ejecutar el agente.", "error");
      } else if (data.runId) {
        const result = await pollAgentRun(clientId, data.runId);
        if (result.status === "DONE") {
          showToast(`Listo — ${summarizeRun(result)}`, "success");
          onDone?.();
        } else if (result.status === "ERROR") {
          showToast("El agente falló durante la ejecución.", "error");
        } else {
          showToast("Sigue corriendo — revisá en unos minutos.", "error");
        }
      } else {
        showToast(`Listo — ${summarizeRun(data)}`, "success");
        onDone?.();
      }
    } catch {
      showToast("Error de conexión.", "error");
    }
    setRunning(false);
  };

  return (
    <>
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

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
