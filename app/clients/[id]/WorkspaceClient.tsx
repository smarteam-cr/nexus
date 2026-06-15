"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import { invalidateGps } from "@/lib/clients/gps-cache";
import ClientInfoPanel from "@/components/clients/ClientInfoPanel";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";
import ClientProcesosPanel from "@/components/clients/ClientProcesosPanel";

const STRATEGY_TAB_ID = "__strategy__";
const PROCESOS_TAB_ID = "__procesos__";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  projectType?: string | null;
  serviceType?: string | null;
  tags?: string[];
  hubspotServiceId?: string | null;
}

// ── Main workspace component ─────────────────────────────────────────────────

export default function WorkspaceClient({
  clientId,
  projects,
  hasHubspot,
  strategyProjectId,
  strategyCanvasId,
}: {
  clientId: string;
  projects: ProjectSummary[];
  hasHubspot: boolean;
  strategyProjectId: string;
  strategyCanvasId: string;
}) {
  const router = useRouter();
  const syncedRef = useRef(false);
  const { bumpGpsRefresh } = useWorkspace();

  // Sincronización automática al entrar al cliente (silenciosa, en background)
  useEffect(() => {
    if (!hasHubspot || syncedRef.current) return;
    syncedRef.current = true;

    fetch(`/api/clients/${clientId}/sync-projects`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.created || data.updated) {
          router.refresh();
        }
      })
      .catch(() => {});
  }, [clientId, hasHubspot]);

  // Auto-sync de Google Meet en background — descubre transcripts/Docs nuevos
  // sin que el usuario tenga que disparar nada. El endpoint tiene cooldown
  // de 20 min, así que no spamea si recargás múltiples clientes seguidos.
  // Si descubre sesiones/transcripts nuevos, bumpea la señal para que el GPS se
  // refresque (única condición de recarga del widget — no recarga al cambiar de tab).
  useEffect(() => {
    fetch("/api/integrations/google/auto-sync", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.skipped && ((d.sync?.synced ?? 0) > 0 || (d.enrich?.enriched ?? 0) > 0)) {
          invalidateGps(); // limpia el cache → el GPS montado refetchea y los no montados también al remontar
          bumpGpsRefresh();
        }
      })
      .catch(() => {});
  }, [bumpGpsRefresh]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      <div className="flex-1 overflow-y-auto">
        <ProjectSection
          clientId={clientId}
          projects={projects}
          strategyProjectId={strategyProjectId}
          strategyCanvasId={strategyCanvasId}
        />
      </div>
    </div>
  );
}

// ── Project Section (tabs + canvas) ──────────────────────────────────────────

function ProjectSection({
  clientId,
  projects,
  strategyProjectId,
  strategyCanvasId,
}: {
  clientId: string;
  projects: ProjectSummary[];
  strategyProjectId: string;
  strategyCanvasId: string;
}) {
  const { activeProjectId, setActiveProjectId } = useWorkspace();

  const isStrategy = activeProjectId === STRATEGY_TAB_ID;
  const isProcesos = activeProjectId === PROCESOS_TAB_ID;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6 flex items-center gap-1 overflow-x-auto">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-brand text-white"
                  : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
              }`}
            >
              {p.name}
            </button>
          );
        })}

        {/* Procesos — pestaña top-level del cliente. Muestra la sección "procesos"
            del canvas de Información del cliente (mismo storage, superficie dedicada). */}
        <button
          onClick={() => setActiveProjectId(PROCESOS_TAB_ID)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isProcesos
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Procesos
        </button>

        {/* Información del cliente — siempre al final. Internamente sigue siendo
            el Project con serviceType=__strategy__ (mismo storage; cambia el
            label visible y el contenido del panel). */}
        <button
          onClick={() => setActiveProjectId(STRATEGY_TAB_ID)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isStrategy
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Información del cliente
        </button>
      </div>

      {/* Content */}
      {isStrategy ? (
        <ClientInfoPanel
          key={STRATEGY_TAB_ID}
          projectId={strategyProjectId}
          canvasId={strategyCanvasId}
        />
      ) : isProcesos ? (
        <ClientProcesosPanel
          key={PROCESOS_TAB_ID}
          clientId={clientId}
          projectId={strategyProjectId}
          canvasId={strategyCanvasId}
        />
      ) : activeProjectId && activeProject ? (
        <ProjectCanvasPanel
          key={activeProjectId}
          projectId={activeProjectId}
          tags={activeProject.tags}
          serviceType={activeProject.serviceType}
        />
      ) : null}
    </div>
  );
}
