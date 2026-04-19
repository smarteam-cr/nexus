"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AgentModalState {
  stage: number;
  stepIndex: number;
  stepLabel: string;
  agentId?: string;
}

interface WorkspaceContextValue {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  agentModal: AgentModalState | null;
  openAgentModal: (state: AgentModalState) => void;
  closeAgentModal: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  agentModal: null,
  openAgentModal: () => {},
  closeAgentModal: () => {},
});

export function WorkspaceProvider({
  initialProjectId,
  children,
}: {
  initialProjectId: string | null;
  children: ReactNode;
}) {
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [agentModal, setAgentModal] = useState<AgentModalState | null>(null);

  // Cuando el initialProjectId cambia (ej: después de un router.refresh() post-sync),
  // seleccionar automáticamente el primer proyecto si no hay ninguno activo.
  useEffect(() => {
    if (initialProjectId && !activeProjectId) {
      setActiveProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  const openAgentModal = useCallback((state: AgentModalState) => {
    setAgentModal(state);
  }, []);

  const closeAgentModal = useCallback(() => {
    setAgentModal(null);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ activeProjectId, setActiveProjectId, agentModal, openAgentModal, closeAgentModal }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
