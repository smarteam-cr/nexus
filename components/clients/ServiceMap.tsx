"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import { Sparkles, Search, Pencil, FileText, BarChart2, Zap, ChevronDown, Map } from "lucide-react";
import type { StepKind } from "@/lib/steps";

interface Props {
  clientId: string;
  projectId: string;
  serviceType: string | null;
  currentStage: number;
  currentStep: number;
  currentStepLabel: string;
  hasHubspot: boolean;
}

const STEP_ICONS: Record<StepKind, typeof Sparkles> = {
  "context-only": Sparkles,
  audit: Search,
  note: Pencil,
  documents: FileText,
  portal: BarChart2,
  implementation: Zap,
};

export default function ServiceMap({
  clientId,
  projectId,
  serviceType,
  currentStage,
  currentStep,
  currentStepLabel,
  hasHubspot,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const stageSteps = getStageSteps(serviceType);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const navigateTo = (stage: number, step: number) => {
    router.push(`/clients/${clientId}/projects/${projectId}/stage/${stage}?step=${step}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger: breadcrumb showing current position */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors border border-gray-200 hover:border-gray-300"
      >
        <Map className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-gray-400">Etapa {currentStage}:</span>
        <span className="text-gray-700">{currentStepLabel}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown drawer */}
      {open && (
        <>
          <div className="absolute top-full left-0 mt-2 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/50">
            <div className="p-3 border-b border-gray-800">
              <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">Mapa del servicio</p>
            </div>

            <div className="p-2">
              {[1, 2, 3].map((stageNum) => {
                const steps = stageSteps[stageNum] ?? [];
                const filteredSteps = steps.filter(
                  (s) => !(stageNum === 1 && s.type.kind === "audit" && !hasHubspot)
                );
                const isCurrentStage = stageNum === currentStage;

                return (
                  <div key={stageNum} className="mb-1">
                    {/* Stage header */}
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                      isCurrentStage ? "text-brand-light" : "text-gray-500"
                    }`}>
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-2xs mr-2 ${
                        isCurrentStage
                          ? "bg-brand-soft text-brand-dark border border-brand/30"
                          : "border border-gray-700 text-gray-600"
                      }`}>
                        {stageNum}
                      </span>
                      Etapa {stageNum}: {STAGE_LABELS[stageNum]}
                    </div>

                    {/* Steps */}
                    <ul className="ml-2">
                      {filteredSteps.map((step, i) => {
                        const isActive = isCurrentStage && i === currentStep;
                        const Icon = STEP_ICONS[step.type.kind] ?? Sparkles;

                        return (
                          <li key={i}>
                            <button
                              onClick={() => navigateTo(stageNum, i)}
                              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                isActive
                                  ? "bg-gray-800 text-white font-medium"
                                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-2xs flex-shrink-0 ${
                                isActive
                                  ? "bg-brand-soft border-brand/30 text-brand-dark"
                                  : "border-gray-700 text-gray-600"
                              }`}>
                                {i + 1}
                              </span>
                              <span className="flex-1 text-left truncate">{step.shortLabel}</span>
                              <Icon className={`w-3 h-3 flex-shrink-0 ${isActive ? "text-gray-400" : "text-gray-600"}`} strokeWidth={1.75} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
