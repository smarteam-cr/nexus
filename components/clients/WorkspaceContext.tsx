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
  /** Contador que bumpea cuando hay que refrescar el GPS (ej: sesión nueva detectada). */
  gpsRefreshSignal: number;
  bumpGpsRefresh: () => void;
  /** Contador que bumpea al generar el handoff → el cronograma (si está vacío) recarga sus fases. */
  timelineRefreshSignal: number;
  bumpTimelineRefresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  agentModal: null,
  openAgentModal: () => {},
  closeAgentModal: () => {},
  gpsRefreshSignal: 0,
  bumpGpsRefresh: () => {},
  timelineRefreshSignal: 0,
  bumpTimelineRefresh: () => {},
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
  const [gpsRefreshSignal, setGpsRefreshSignal] = useState(0);
  const [timelineRefreshSignal, setTimelineRefreshSignal] = useState(0);

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

  const bumpGpsRefresh = useCallback(() => setGpsRefreshSignal((n) => n + 1), []);
  const bumpTimelineRefresh = useCallback(() => setTimelineRefreshSignal((n) => n + 1), []);

  return (
    <WorkspaceContext.Provider
      value={{ activeProjectId, setActiveProjectId, agentModal, openAgentModal, closeAgentModal, gpsRefreshSignal, bumpGpsRefresh, timelineRefreshSignal, bumpTimelineRefresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
