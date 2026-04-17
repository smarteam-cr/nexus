"use client";

import dynamic from "next/dynamic";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer"),
  { ssr: false, loading: () => <div className="h-64 bg-gray-50 rounded-xl animate-pulse" /> }
);

export function SharedFlowchart({ data }: { data: Parameters<typeof FlowchartViewer>[0]["data"] }) {
  return <FlowchartViewer data={data} />;
}
