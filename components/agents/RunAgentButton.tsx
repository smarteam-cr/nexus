"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import AgentRunModal from "./AgentRunModal";

interface Agent {
  id: string;
  name: string;
  status: string;
  associatedStages: number[];
}

interface RunAgentButtonProps {
  clientId: string;
  stage: number;
  step: number;
}

const PlayIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export default function RunAgentButton({ clientId, stage, step }: RunAgentButtonProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [modalAgent, setModalAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetch(`/api/agents?stage=${stage}`)
      .then((r) => r.json())
      .then((data: Agent[]) => setAgents(data.filter((a) => a.status === "ACTIVE")))
      .catch(() => {});
  }, [stage]);

  if (agents.length === 0) return null;

  function runAgent(agent: Agent) {
    setModalAgent(agent);
    setShowDropdown(false);
  }

  return (
    <>
      {agents.length === 1 ? (
        <Button variant="ghost" size="sm" onClick={() => runAgent(agents[0])}>
          <PlayIcon />
          Correr agente: {agents[0].name}
        </Button>
      ) : (
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setShowDropdown((v) => !v)}>
            <PlayIcon />
            Correr agente
            <ChevronIcon />
          </Button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-xl bg-gray-900 border border-gray-800 shadow-xl overflow-hidden">
                <p className="px-3 py-2 text-2xs font-semibold text-gray-600 uppercase tracking-widest border-b border-gray-800">
                  Selecciona un agente
                </p>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => runAgent(agent)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-300 truncate">{agent.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {modalAgent && (
        <AgentRunModal
          agent={modalAgent}
          clientId={clientId}
          stage={stage}
          step={step}
          onClose={() => setModalAgent(null)}
        />
      )}
    </>
  );
}
