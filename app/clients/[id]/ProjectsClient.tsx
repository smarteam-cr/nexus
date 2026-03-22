"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, ChevronRight, Clock } from "lucide-react";

interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: Date | string;
  _count: { stageNotes: number; contextCards: number; documents: number };
}

interface Props {
  clientId: string;
  initialProjects: Project[];
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  completed: "Completado",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function ProjectsClient({ clientId, initialProjects }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json() as { project: Project };
      const created = { ...data.project, _count: { stageNotes: 0, contextCards: 0, documents: 0 } };
      setProjects((prev) => [...prev, created]);
      setNewName("");
      setShowForm(false);
      // Navegar directo al nuevo proyecto
      router.push(`/clients/${clientId}/projects/${data.project.id}/stage/1`);
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-brand-light/70" />
          <h2 className="text-sm font-semibold text-gray-300">Proyectos</h2>
          {projects.length > 0 && (
            <span className="text-2xs text-gray-600">({projects.length})</span>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand-light hover:bg-brand/20 text-xs font-medium transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo proyecto
        </button>
      </div>

      {/* Formulario de creación inline */}
      {showForm && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-gray-800/60 border border-gray-700">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createProject();
              if (e.key === "Escape") { setShowForm(false); setNewName(""); }
            }}
            placeholder="Nombre del proyecto…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600"
          />
          <button
            onClick={createProject}
            disabled={!newName.trim() || creating}
            className="px-3 py-1 rounded-md bg-brand text-white text-xs font-medium disabled:opacity-40 hover:bg-brand/90 transition-colors"
          >
            {creating ? "Creando…" : "Crear"}
          </button>
          <button
            onClick={() => { setShowForm(false); setNewName(""); }}
            className="px-2 py-1 rounded-md text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Lista de proyectos */}
      {projects.length === 0 && !showForm ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <FolderOpen className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-1">Sin proyectos aún</p>
          <p className="text-xs text-gray-600 mb-4">
            Crea el primer proyecto para comenzar el proceso con este cliente.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-brand-light hover:text-brand-light/80 transition-colors"
          >
            + Crear primer proyecto
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => {
            const totalItems = project._count.stageNotes + project._count.contextCards + project._count.documents;
            return (
              <Link
                key={project.id}
                href={`/clients/${clientId}/projects/${project.id}/stage/1`}
                className="flex items-center gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/70 transition-all group"
              >
                {/* Icono */}
                <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-4 h-4 text-brand-light" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-brand-light transition-colors">
                    {project.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-2xs text-gray-500">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDate(project.createdAt)}
                    </span>
                    {totalItems > 0 && (
                      <span className="text-2xs text-gray-600">
                        {totalItems} {totalItems === 1 ? "elemento" : "elementos"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Etapas */}
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {["D", "M", "A"].map((label, i) => (
                    <span
                      key={i}
                      className="w-5 h-5 rounded-full border border-gray-700 text-gray-600 text-2xs font-semibold flex items-center justify-center"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {/* Status badge */}
                <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[project.status] ?? STATUS_COLORS.active}`}>
                  {STATUS_LABELS[project.status] ?? project.status}
                </span>

                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
