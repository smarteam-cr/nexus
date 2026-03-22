"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import AgentRunModal from "./AgentRunModal";
import { RefreshCw } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  status: string;
  associatedStages: number[];
}

interface ReAnalyzeButtonProps {
  clientId: string;
  stage: number;
}

export default function ReAnalyzeButton({ clientId, stage }: ReAnalyzeButtonProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch(`/api/agents?stage=${stage}`)
      .then((r) => r.json())
      .then((data: Agent[]) => {
        const active = data.filter((a) => a.status === "ACTIVE");
        if (active.length > 0) setAgent(active[0]);
      })
      .catch(() => {});
  }, [stage]);

  if (!agent) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowModal(true)}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Re-analizar
      </Button>

      {showModal && (
        <AgentRunModal
          agent={agent}
          clientId={clientId}
          stage={stage}
          step={0}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
