"use client";

import SectionBlockList from "@/components/canvas/SectionBlockList";

export default function StrategyCanvasPanel({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  return (
    <SectionBlockList projectId={projectId} canvasId={canvasId} />
  );
}
