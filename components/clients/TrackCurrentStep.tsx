"use client";

import { useEffect } from "react";

export default function TrackCurrentStep({
  projectId,
  stage,
  step,
}: {
  projectId: string;
  stage: number;
  step: number;
}) {
  useEffect(() => {
    fetch(`/api/projects/${projectId}/current-step`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, step }),
    }).catch(() => {});
  }, [projectId, stage, step]);

  return null;
}
