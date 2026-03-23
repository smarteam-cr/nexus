"use client";

import { useParams, useSearchParams } from "next/navigation";
import ServiceMap from "./ServiceMap";
import { getStageSteps } from "@/lib/steps";

interface Props {
  clientId: string;
  hasHubspot: boolean;
  serviceType: string | null;
}

/**
 * Wrapper client-side del ServiceMap que lee stage/step de la URL.
 * Se renderiza solo cuando estamos dentro de una ruta de stage.
 */
export default function ServiceMapHeader({ clientId, hasHubspot, serviceType }: Props) {
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId as string | undefined;
  const stageNum = params?.stageNum as string | undefined;

  // Solo mostrar si estamos en una ruta de stage
  if (!projectId || !stageNum) return null;

  const stage = parseInt(stageNum);
  if (![1, 2, 3].includes(stage)) return null;

  const stepParam = searchParams?.get("step") ?? "0";
  const stepIndex = Math.max(0, parseInt(stepParam));

  const stageSteps = getStageSteps(serviceType);
  const steps = stageSteps[stage]?.filter(
    (s) => !(stage === 1 && s.type.kind === "audit" && !hasHubspot)
  ) ?? [];

  const safeStepIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex];

  if (!currentStep) return null;

  return (
    <>
      <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
      <ServiceMap
        clientId={clientId}
        projectId={projectId}
        serviceType={serviceType}
        currentStage={stage}
        currentStep={safeStepIndex}
        currentStepLabel={currentStep.shortLabel}
        hasHubspot={hasHubspot}
      />
    </>
  );
}
