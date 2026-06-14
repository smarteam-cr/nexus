"use client";

import { useState, useEffect, useRef } from "react";
import { AGENT_GROUPS, type AgentGroupDef } from "@/lib/agent-groups";
import { pollAgentRun, summarizeRun } from "@/lib/clients/poll-agent-run";
import { useWorkspace } from "./WorkspaceContext";

interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  agentGroup: string | null;
  groupOrder: number;
  agentType: string;
  status: string;
  outputType: string;
  associatedStages: number[];
  associatedStep: number | null;
  sectionLabel: string | null;
  _count?: { runs: number };
}

interface Props {
  clientId: string;
  projectId: string | null;
}

export default function AgentPanel({ clientId, projectId: propProjectId }: Props) {
  const { activeProjectId } = useWorkspace();
  const projectId = activeProjectId ?? propProjectId;
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Timer while agent runs
  useEffect(() => {
    if (runningAgentId) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [runningAgentId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data.filter((a: AgentSummary) => a.status === "ACTIVE" && a.agentType === "SECTION")))
      .finally(() => setLoading(false));
  }, [open]);

  const grouped = AGENT_GROUPS.map((group) => ({
    ...group,
    agents: agents.filter((a) => a.agentGroup === group.key),
  }));

  const handleExecuteAgent = async (agent: AgentSummary) => {
    if (!projectId || runningAgentId) return;

    setRunningAgentId(agent.id);

    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: agent.associatedStages?.[0] ?? 1,
          step: agent.associatedStep ?? 0,
          stepLabel: agent.sectionLabel ?? agent.name,
          sectionLabel: agent.sectionLabel ?? agent.name,
          agentId: agent.id,
          projectId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setToast({ message: data.message ?? data.error ?? "Error al ejecutar el agente", type: "error" });
      } else if (data.runId) {
        // Corre en background (agente pesado, p.ej. mapeo CARDS_AND_FLOWCHARTS):
        // polleamos hasta DONE/ERROR. El botón sigue en "Ejecutando… m:ss" mientras tanto.
        const result = await pollAgentRun(clientId, data.runId);
        if (result.status === "DONE") {
          setToast({ message: `${agent.name} completado — ${summarizeRun(result)}`, type: "success" });
        } else if (result.status === "ERROR") {
          setToast({ message: `${agent.name} falló durante la ejecución`, type: "error" });
        } else {
          setToast({ message: `${agent.name} sigue corriendo — revisá en unos minutos`, type: "error" });
        }
      } else {
        setToast({ message: `${agent.name} completado — ${summarizeRun(data)}`, type: "success" });
      }
    } catch {
      setToast({ message: "Error de conexión", type: "error" });
    }

    setRunningAgentId(null);

    // Auto-dismiss toast after 4s
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          runningAgentId
            ? "bg-amber-900/20 text-amber-400 border-amber-700/50 animate-pulse"
            : open
            ? "bg-brand/10 text-brand border-brand/20"
            : "text-gray-400 hover:text-gray-300 border-gray-700 hover:border-gray-600 hover:bg-gray-800"
        }`}
      >
        {runningAgentId ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
        {runningAgentId ? `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}` : "Agentes"}
      </button>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-200 ${
          toast.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[600px] max-h-[70vh] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-white">Agentes disponibles</h3>
                <p className="text-xs text-gray-400 mt-0.5">Selecciona un agente para ejecutar</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-300 hover:bg-gray-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Groups */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="text-center py-8 text-sm text-gray-400">Cargando agentes...</div>
              ) : (
                grouped.map((group) => (
                  <GroupSection
                    key={group.key}
                    group={group}
                    agents={group.agents}
                    onExecute={handleExecuteAgent}
                    hasProject={!!projectId}
                    runningAgentId={runningAgentId}
                    elapsed={elapsed}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function GroupSection({
  group,
  agents,
  onExecute,
  hasProject,
  runningAgentId,
  elapsed,
}: {
  group: AgentGroupDef;
  agents: AgentSummary[];
  onExecute: (agent: AgentSummary) => void;
  hasProject: boolean;
  runningAgentId: string | null;
  elapsed: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{group.icon}</span>
        <div>
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{group.label}</h4>
          <p className="text-[10px] text-gray-400">{group.description}</p>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="px-3 py-2 rounded-lg bg-gray-800 border border-dashed border-gray-700">
          <p className="text-xs text-gray-400 italic">Próximamente</p>
        </div>
      ) : (
        <div className="space-y-1">
          {agents.map((agent) => {
            const isRunning = runningAgentId === agent.id;
            const isDisabled = !hasProject || !!runningAgentId;

            return (
              <button
                key={agent.id}
                onClick={() => !isDisabled && onExecute(agent)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  isRunning
                    ? "bg-amber-900/20 border border-amber-700/50"
                    : isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-800 cursor-pointer"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isRunning ? "bg-amber-900/30 border border-amber-700/30" : "bg-brand/5 border border-brand/10"
                }`}>
                  {isRunning ? (
                    <svg className="w-3.5 h-3.5 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{agent.name}</p>
                  {isRunning ? (
                    <p className="text-[11px] text-amber-600 font-medium">Ejecutando... {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</p>
                  ) : agent.description ? (
                    <p className="text-[11px] text-gray-400 truncate">{agent.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!isRunning && agent.outputType === "CARDS_AND_FLOWCHARTS" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-100">+ diagramas</span>
                  )}
                  {!isRunning && (
                    <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
