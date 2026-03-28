"use client";

import { type ReactNode } from "react";
import { WorkspaceProvider } from "./WorkspaceContext";

/**
 * Shell que envuelve todo el contenido del cliente.
 * Provee WorkspaceContext al layout y page.
 */
export default function WorkspaceShell({
  clientId: _clientId,
  initialProjectId,
  children,
}: {
  clientId: string;
  initialProjectId: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceProvider initialProjectId={initialProjectId}>
      {children}
    </WorkspaceProvider>
  );
}
