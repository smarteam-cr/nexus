"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";

const PROJECT_SECTIONS = [
  { key: "objetivo_alcance", label: "Objetivo y alcance", icon: "🎯" },
  { key: "hipotesis_recomendaciones", label: "Hipótesis y recomendaciones", icon: "💡" },
  { key: "procesos", label: "Procesos", icon: "⚙️" },
  { key: "plan_implementacion", label: "Plan de implementación", icon: "📋" },
  { key: "documentos", label: "Documentos", icon: "📄" },
];

const CLIENT_SECTIONS = [
  { key: "perfil", label: "Perfil de empresa", icon: "🏢" },
  { key: "stakeholders", label: "Stakeholders", icon: "👥" },
  { key: "herramientas", label: "Herramientas", icon: "🔧" },
  { key: "contexto_comercial", label: "Contexto comercial", icon: "💼" },
  { key: "madurez", label: "Madurez tecnológica", icon: "📊" },
  { key: "retos_estrategicos", label: "Retos estratégicos", icon: "🎯" },
  { key: "escala_rendimiento", label: "Escala de rendimiento", icon: "📈" },
  { key: "oportunidades_futuras", label: "Oportunidades futuras", icon: "🚀" },
];

interface ProjectOption {
  id: string;
  name: string;
  tags: string[];
  serviceType: string | null;
}

interface Props {
  cardId: string;
  clientId?: string;
  currentProjectId?: string;
}

export default function SendToCanvasMenu({ cardId, clientId, currentProjectId }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inCanvas, setInCanvas] = useState(false);
  const [canvasSection, setCanvasSection] = useState<string | null>(null);
  const [suggestedSection, setSuggestedSection] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProjectId ?? null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if already in canvas + get suggested section
  useEffect(() => {
    fetch(`/api/cards/${cardId}/send-to-canvas`)
      .then((r) => r.json())
      .then((data) => {
        setInCanvas(data.inCanvas);
        setCanvasSection(data.section);
        setSuggestedSection(data.suggestedSection ?? null);
      })
      .catch(() => {});
  }, [cardId]);

  // Fetch client projects when menu opens (for cross-project send)
  useEffect(() => {
    if (!open || !clientId) return;
    fetch(`/api/clients/${clientId}/projects`)
      .then((r) => r.json())
      .then((data) => {
        const projs = (data.projects ?? data) as ProjectOption[];
        setProjects(projs);
        if (!selectedProjectId && projs.length > 0) {
          setSelectedProjectId(currentProjectId ?? projs[0].id);
        }
      })
      .catch(() => toast.error("No se pudieron cargar los proyectos del cliente."));
  }, [open, clientId, currentProjectId, selectedProjectId, toast]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const send = async (target: "project" | "client", section: string) => {
    setSending(true);
    try {
      const body: Record<string, string> = { target, section };
      // Cross-project: send targetProjectId if different from current
      if (target === "project" && selectedProjectId && selectedProjectId !== currentProjectId) {
        body.targetProjectId = selectedProjectId;
      }
      const res = await fetch(`/api/cards/${cardId}/send-to-canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.status === 409) {
        setFeedback("Ya está en el canvas");
        setInCanvas(true);
        setCanvasSection(data.section);
      } else if (res.ok) {
        if (target === "project") {
          setFeedback("Enviado al canvas");
          setInCanvas(true);
          setCanvasSection(section);
        } else {
          setFeedback("Sugerencia enviada");
        }
      } else {
        setFeedback(data.error ?? "Error");
      }
    } catch {
      setFeedback("Error de conexión");
    }
    setSending(false);
    setOpen(false);
    setTimeout(() => setFeedback(null), 2500);
  };

  // Already in canvas — show static badge
  if (inCanvas) {
    const sectionLabel = PROJECT_SECTIONS.find((s) => s.key === canvasSection)?.label ?? canvasSection;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-green-50 text-green-600 border border-green-200"
        title={`En canvas: ${sectionLabel}`}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        En canvas
      </span>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Feedback toast */}
      {feedback && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-gray-900 text-white text-[10px] font-medium whitespace-nowrap shadow-lg animate-in fade-in duration-200">
          {feedback}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        disabled={sending}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all disabled:opacity-50"
        title="Enviar al canvas"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        Canvas
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Project selector — only if multiple projects */}
          {projects.length > 1 && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Proyecto destino</p>
              <div className="flex flex-wrap gap-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                      selectedProjectId === p.id
                        ? "bg-brand/10 text-brand border-brand/20"
                        : "text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Canvas de proyecto */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
              {projects.length > 1 ? `Sección del canvas` : `Canvas de proyecto`}
            </p>
          </div>
          {/* Sección sugerida primero si existe */}
          {suggestedSection && (
            <button
              onClick={() => send("project", suggestedSection)}
              disabled={sending}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-medium transition-colors disabled:opacity-50"
            >
              <span className="text-sm">{PROJECT_SECTIONS.find(s => s.key === suggestedSection)?.icon ?? "📌"}</span>
              {PROJECT_SECTIONS.find(s => s.key === suggestedSection)?.label ?? suggestedSection}
              <span className="ml-auto text-[9px] text-blue-400 font-normal">Sugerido</span>
            </button>
          )}
          {PROJECT_SECTIONS.filter(s => s.key !== suggestedSection).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => send("project", key)}
              disabled={sending}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              <span className="text-sm">{icon}</span>
              {label}
            </button>
          ))}

          {/* Canvas de empresa */}
          <div className="px-3 py-2 bg-gray-50 border-t border-b border-gray-100">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Canvas de empresa</p>
          </div>
          {CLIENT_SECTIONS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => send("client", key)}
              disabled={sending}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              <span className="text-sm">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
