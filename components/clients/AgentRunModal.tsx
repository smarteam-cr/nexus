"use client";

import { useEffect, useState } from "react";
import StepSections from "./StepSections";

interface Props {
  clientId: string;
  projectId: string;
  stage: number;
  stepIndex: number;
  stepLabel: string;
  agentId?: string;
  onClose: () => void;
}

export default function AgentRunModal({
  clientId,
  projectId,
  stage,
  stepIndex,
  stepLabel,
  onClose,
}: Props) {
  const [hasRunning, setHasRunning] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Poll for running agents
  useEffect(() => {
    const check = () => {
      fetch(`/api/clients/${clientId}/analyze?stage=${stage}&step=${stepIndex}`)
        .then((r) => r.json())
        .then((data) => {
          const sections = data.sections ?? [];
          const running = sections.some((s: { lastRun?: { status: string } | null }) =>
            s.lastRun?.status === "RUNNING"
          );
          setHasRunning(running);
        })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [clientId, stage, stepIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[90vw] h-[85vh] max-w-[1200px] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{stepLabel}</span>
            {hasRunning && (
              <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ejecutando agente...
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Cerrar (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content — StepSections hace su propio fetch */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <StepSections
            clientId={clientId}
            projectId={projectId}
            stage={stage}
            stepIndex={stepIndex}
            stepLabel={stepLabel}
          />
        </div>
      </div>
    </div>
  );
}
