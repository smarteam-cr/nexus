"use client";

import dynamic from "next/dynamic";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer"),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-shimmer" /> }
);

export function SharedFlowchart({ data }: { data: Parameters<typeof FlowchartViewer>[0]["data"] }) {
  return <FlowchartViewer data={data} />;
}
