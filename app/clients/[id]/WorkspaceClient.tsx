"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/clients/WorkspaceContext";
import ClientCanvasPanel from "@/components/clients/ClientCanvasPanel";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";
import HubBadge from "@/components/ui/HubBadge";
import ProjectTypeBadge from "@/components/ui/ProjectTypeBadge";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  projectType?: string | null;
  serviceType?: string | null;
  tags?: string[];
}

// ── Main workspace component ─────────────────────────────────────────────────

export default function WorkspaceClient({
  clientId,
  projects,
}: {
  clientId: string;
  projects: ProjectSummary[];
}) {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      <div className="flex-1 overflow-y-auto">
        {/* 1. Canvas de empresa (colapsable) */}
        <CompanyAccordion clientId={clientId} />

        {/* 2. Tabs de proyectos + canvas activo */}
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <ProjectSection projects={projects} />
        )}
      </div>
    </div>
  );
}

// ── Company Canvas Accordion ─────────────────────────────────────────────────

function CompanyAccordion({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Empresa</span>
        </div>
        <span className="text-xs text-gray-400">
          {open ? "Ocultar" : "Ver información de empresa"}
        </span>
      </button>

      {open && (
        <div className="px-6 pb-4">
          <ClientCanvasPanel clientId={clientId} embedded />
        </div>
      )}
    </div>
  );
}

// ── Project Section (tabs + canvas) ──────────────────────────────────────────

function ProjectSection({ projects }: { projects: ProjectSummary[] }) {
  const { activeProjectId, setActiveProjectId } = useWorkspace();

  return (
    <div>
      {/* Tab bar — siempre visible */}
      {projects.length > 0 && (
        <div className="border-b border-gray-100 px-6 flex items-center gap-1 overflow-x-auto">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            // Acortar nombre: quitar sufijo " - NombreCliente"
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
                <HubBadge tags={p.tags} serviceType={p.serviceType} size="xs" />
              </button>
            );
          })}
        </div>
      )}

      {/* Active project canvas */}
      {activeProjectId && (
        <ProjectCanvasPanel key={activeProjectId} projectId={activeProjectId} />
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <p className="text-sm text-gray-500">No hay proyectos aún</p>
      <p className="text-xs text-gray-400 mt-1">Crea un proyecto para empezar a trabajar</p>
    </div>
  );
}
