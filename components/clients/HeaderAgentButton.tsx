"use client";

import { useParams } from "next/navigation";
import AgentPanel from "./AgentPanel";

/**
 * Reads clientId from props, projectId from URL or default prop.
 */
export default function HeaderAgentButton({
  clientId,
  defaultProjectId,
}: {
  clientId: string;
  defaultProjectId?: string | null;
}) {
  const params = useParams();
  const projectIdFromUrl = params?.projectId as string | undefined;
  const projectId = projectIdFromUrl ?? defaultProjectId ?? null;

  return <AgentPanel clientId={clientId} projectId={projectId} />;
}
