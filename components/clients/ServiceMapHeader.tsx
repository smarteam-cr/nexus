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
 * Se muestra siempre que hay un projectId (tanto en canvas como en stage).
 */
export default function ServiceMapHeader({ clientId, hasHubspot, serviceType }: Props) {
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId as string | undefined;
  const stageNum = params?.stageNum as string | undefined;

  if (!projectId) return null;

  // Si estamos en una ruta de stage, usar esos valores; sino defaults
  const stage = stageNum ? parseInt(stageNum) : null;
  const stepParam = searchParams?.get("step") ?? "0";
  const stepIndex = Math.max(0, parseInt(stepParam));

  const stageSteps = getStageSteps(serviceType);

  // Para el label del step actual (si estamos en un stage)
  let currentStepLabel = "Mapa del servicio";
  let safeStepIndex = 0;
  let safeStage = 1;

  if (stage && [1, 2, 3].includes(stage)) {
    safeStage = stage;
    const steps = stageSteps[stage]?.filter(
      (s) => !(stage === 1 && s.type.kind === "audit" && !hasHubspot)
    ) ?? [];
    safeStepIndex = Math.min(stepIndex, steps.length - 1);
    const currentStep = steps[safeStepIndex];
    if (currentStep) currentStepLabel = currentStep.shortLabel;
  }

  return (
    <>
      <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
      <ServiceMap
        clientId={clientId}
        projectId={projectId}
        serviceType={serviceType}
        currentStage={safeStage}
        currentStep={safeStepIndex}
        currentStepLabel={stage ? currentStepLabel : "Mapa del servicio"}
        hasHubspot={hasHubspot}
      />
    </>
  );
}
