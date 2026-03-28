"use client";

import ClientHeaderPopovers from "./ClientHeaderPopovers";
import { useWorkspace } from "./WorkspaceContext";

/**
 * Wrapper for the layout. Reads activeProjectId from WorkspaceContext
 * so the sidebar tabs (Sesiones, Docs, Deal) know which project to query.
 */
export default function WorkspaceHeaderPopovers(
  props: Omit<React.ComponentProps<typeof ClientHeaderPopovers>, "workspaceProjectId">
) {
  const { activeProjectId } = useWorkspace();
  return <ClientHeaderPopovers {...props} workspaceProjectId={activeProjectId} />;
}
