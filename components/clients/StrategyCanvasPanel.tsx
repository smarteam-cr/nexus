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
    <div className="px-6 py-4 space-y-4">
      <SectionBlockList projectId={projectId} canvasId={canvasId} />
    </div>
  );
}
