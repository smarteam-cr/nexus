"use client";

import { useState, useEffect } from "react";
import { pollAgentRun } from "@/lib/clients/poll-agent-run";

interface Props {
  clientId: string;
  projectId: string;
  stage: number;
  stepIndex: number;
  stepLabel?: string;
  stepKeywords?: string[];
}

function formatRelative(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `hace ${days}d`;
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export default function SubstepAgentButton({ clientId, projectId, stage, stepIndex, stepLabel, stepKeywords }: Props) {
  const [agentName, setAgentName] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Auto-detectar agente + último run para este stage+step
  useEffect(() => {
    fetch(`/api/clients/${clientId}/analyze?stage=${stage}&step=${stepIndex}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.agentConfigured && data.agentName) {
          setAgentName(data.agentName);
        }
        if (data.run?.createdAt) {
          setLastRunAt(data.run.createdAt);
        }
      })
      .catch(() => {});
  }, [clientId, stage, stepIndex]);

  // Escuchar eventos del botón del empty state en ClientContextCards
  useEffect(() => {
    const onStart = (e: Event) => {
      const ev = e as CustomEvent<{ clientId: string }>;
      if (ev.detail?.clientId !== clientId) return;
      setRunning(true);
    };
    const onDone = (e: Event) => {
      const ev = e as CustomEvent<{ clientId: string; run: { createdAt: string } | null }>;
      if (ev.detail?.clientId !== clientId) return;
      if (ev.detail.run?.createdAt) setLastRunAt(ev.detail.run.createdAt);
      setRunning(false);
    };
    const onEnd = (e: Event) => {
      const ev = e as CustomEvent<{ clientId: string }>;
      if (ev.detail?.clientId !== clientId) return;
      setRunning(false);
    };
    window.addEventListener("analyze-start", onStart);
    window.addEventListener("analyze-done", onDone);
    window.addEventListener("analyze-end", onEnd);
    return () => {
      window.removeEventListener("analyze-start", onStart);
      window.removeEventListener("analyze-done", onDone);
      window.removeEventListener("analyze-end", onEnd);
    };
  }, [clientId]);

  if (!agentName) return null;

  const handleRun = async () => {
    // analyze-start activa running=true via el listener
    window.dispatchEvent(new CustomEvent("analyze-start", { detail: { clientId } }));
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          step: stepIndex,
          stepLabel: stepLabel ?? null,
          sessionKeywords: stepKeywords ?? [],
          projectId,
        }),
      });
      let data = res.ok ? await res.json().catch(() => ({})) : {};
      // Si el agente corre en background (pesado, p.ej. mapeo), el server devuelve
      // { runId }: polleamos hasta DONE/ERROR y reconstruimos el payload del evento.
      if (res.ok && data.runId) {
        const result = await pollAgentRun(clientId, data.runId);
        data = {
          cards: result.cards ?? [],
          flowchart: result.flowchart ?? null,
          flowcharts: result.flowcharts ?? null,
          run: result.status === "DONE" ? { id: result.id, createdAt: result.createdAt } : null,
        };
      }
      // analyze-done desactiva running=false y actualiza lastRunAt via el listener
      window.dispatchEvent(
        new CustomEvent("analyze-done", {
          detail: {
            clientId,
            cards: data.cards ?? [],
            flowchart: data.flowchart ?? null,
            flowcharts: data.flowcharts ?? null,
            run: data.run ?? null,
          },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("analyze-done", { detail: { clientId, cards: [], run: null } })
      );
    } finally {
      window.dispatchEvent(new CustomEvent("analyze-end", { detail: { clientId } }));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Timestamp del último run */}
      {lastRunAt && !running && (
        <span className="text-xs text-gray-600 hidden sm:block" title={new Date(lastRunAt).toLocaleString("es-ES")}>
          {formatRelative(lastRunAt)}
        </span>
      )}

      <button
        onClick={handleRun}
        disabled={running}
        title={`Ejecutar agente: ${agentName}`}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2.5 py-1 rounded-lg hover:bg-brand/5 border border-transparent hover:border-brand/20"
      >
        <svg
          className={`w-3 h-3 ${running ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {running ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          )}
        </svg>
        {running ? "Ejecutando…" : "Ejecutar agente"}
      </button>
    </div>
  );
}
