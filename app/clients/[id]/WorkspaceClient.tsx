"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import ClientCanvasPanel from "@/components/clients/ClientCanvasPanel";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";

const STRATEGY_TAB_ID = "__strategy__";

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
}: {
  clientId: string;
  projects: ProjectSummary[];
  hasHubspot: boolean;
}) {
  const router = useRouter();
  const syncedRef = useRef(false);

  // Sincronización automática al entrar al cliente (silenciosa, en background)
  useEffect(() => {
    if (!hasHubspot || syncedRef.current) return;
    syncedRef.current = true;

    fetch(`/api/clients/${clientId}/sync-services`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.created || data.updated) {
          router.refresh();
        }
      })
      .catch(() => {});
  }, [clientId, hasHubspot]);

  return (
    <div className="flex flex-col bg-white" style={{ height: "calc(100vh - 57px)" }}>
      <div className="flex-1 overflow-y-auto">
        <ProjectSection clientId={clientId} projects={projects} />
      </div>
    </div>
  );
}

// ── Project Section (tabs + canvas) ──────────────────────────────────────────

function ProjectSection({
  clientId,
  projects,
}: {
  clientId: string;
  projects: ProjectSummary[];
}) {
  const { activeProjectId, setActiveProjectId } = useWorkspace();

  const isStrategy = activeProjectId === STRATEGY_TAB_ID;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-100 px-6 flex items-center gap-1 overflow-x-auto">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          const shortName = p.name.replace(/\s*-\s*[^-]+$/, "").trim() || p.name;
          return (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-brand text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
              }`}
            >
              {shortName}
            </button>
          );
        })}

        {/* Estrategia tab — always last */}
        <button
          onClick={() => setActiveProjectId(STRATEGY_TAB_ID)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isStrategy
              ? "border-brand text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Estrategia
        </button>
      </div>

      {/* Content */}
      {isStrategy ? (
        <div className="px-6 py-4">
          <ClientCanvasPanel clientId={clientId} embedded />
        </div>
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
