"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Badge, Spinner } from "@/components/ui";

interface Agent {
  id: string;
  name: string;
}

interface AgentRunModalProps {
  agent: Agent;
  clientId: string;
  stage: number;
  step: number;
  onClose: () => void;
}

export default function AgentRunModal({
  agent,
  clientId,
  stage,
  step,
  onClose,
}: AgentRunModalProps) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function runAgent() {
      try {
        const res = await fetch(`/api/agents/${agent.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, stage, step }),
        });

        if (!res.ok) {
          setStatus("error");
          setOutput("Error al iniciar el agente. Verifica que esté activo.");
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          const chunk = decoder.decode(value, { stream: true });
          setOutput((prev) => prev + chunk);
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        }

        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setOutput((prev) => prev + "\n\n[Error de conexión]");
        }
      }
    }

    runAgent();
    return () => { cancelled = true; };
  }, [agent.id, clientId, stage, step]);

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "running") onClose();
      }}
    >
      <div className="w-full max-w-2xl flex flex-col rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{agent.name}</p>
              <p className="text-xs text-gray-500">
                {status === "running" && "Generando respuesta..."}
                {status === "done"    && "Respuesta completa"}
                {status === "error"   && "Error en la ejecución"}
              </p>
            </div>
          </div>

          {status === "running" && <Spinner size="md" color="border-brand" />}
          {status === "done"    && <Badge variant="success" dot>Listo</Badge>}
          {status === "error"   && <Badge variant="destructive">Error</Badge>}
        </div>

        {/* Output */}
        <div ref={outputRef} className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {output ? (
            <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
              {output}
            </pre>
          ) : (
            <div className="flex items-center gap-2 text-gray-600 text-sm">
              <Spinner size="sm" />
              Iniciando agente...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-800 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={handleCopy} disabled={!output}>
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">Copiado</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar al portapapeles
              </>
            )}
          </Button>

          <Button variant="secondary" size="sm" onClick={onClose} disabled={status === "running"}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
