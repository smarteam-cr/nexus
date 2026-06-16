"use client";

import { useState, useEffect } from "react";
import ClientContextCards from "./ClientContextCards";
import { useToast } from "@/components/ui/Toast";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AnalysisRun {
  id: string;
  createdAt: string;
  status: string;
  step?: number | null;
  agent?: { name: string } | null;
}

interface SectionInfo {
  sectionLabel:    string;
  agentId:         string;
  agentName:       string;
  agentOutputType: "CARDS" | "FLOWCHART" | "CARDS_AND_FLOWCHARTS";
  lastRun:         AnalysisRun | null;
  runs:            AnalysisRun[];
}

interface Props {
  clientId:      string;
  projectId:     string;
  stage:         number;
  stepIndex:     number;
  stepLabel?:    string;
  stepKeywords?: string[];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function StepSections({
  clientId, projectId, stage, stepIndex, stepLabel, stepKeywords,
}: Props) {
  const toast = useToast();
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    setSections([]);
    fetch(`/api/clients/${clientId}/analyze?stage=${stage}&step=${stepIndex}`)
      .then((r) => r.json())
      .then((data) => setSections(data.sections ?? []))
      .catch(() => toast.error("No se pudieron cargar las secciones de este paso."))
      .finally(() => setLoading(false));
  }, [clientId, stage, stepIndex, toast]);

  if (loading) {
    return <SectionSkeleton />;
  }

  // Sin agentes configurados: banner informativo + anotaciones manuales
  if (sections.length === 0) {
    return (
      <div className="space-y-6">
        <NoAgentsBanner />
        <ManualAnnotationsPanel clientId={clientId} projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <ClientContextCards
          key={`${section.agentId}-${stepIndex}`}
          clientId={clientId}
          projectId={projectId}
          stage={stage}
          stepIndex={stepIndex}
          stepLabel={stepLabel}
          stepKeywords={stepKeywords}
          sectionLabel={section.sectionLabel}
          agentId={section.agentId}
          agentName={section.agentName}
          agentOutputType={section.agentOutputType}
          initialLastRun={section.lastRun}
          initialRuns={section.runs}
        />
      ))}

      {/* Anotaciones manuales removidas — se usan cards con tag CSE en su lugar */}
    </div>
  );
}

// ── Panel de anotaciones manuales ─────────────────────────────────────────────

// ── Banner cuando no hay agentes configurados ────────────────────────────────

function NoAgentsBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Sin agentes configurados</h3>
      <p className="text-xs text-gray-500 max-w-sm mb-4">
        No hay agentes activos para esta subetapa. Configura agentes para habilitar el análisis automático, o agrega contexto manualmente.
      </p>
      <a
        href="/agents"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-light transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Configurar agentes
      </a>
    </div>
  );
}

// ── Panel de anotaciones manuales ─────────────────────────────────────────────

interface ManualCard {
  id: string;
  title: string;
  content: string;
  order: number;
  source: "HUMAN";
  createdAt: string;
  updatedAt: string;
}

function ManualAnnotationsPanel({ clientId, projectId }: { clientId: string; projectId: string }) {
  const [cards, setCards]       = useState<ManualCard[]>([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [title, setTitle]       = useState("");
  const [content, setContent]   = useState("");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/context-cards?noRun=true`)
      .then((r) => r.json())
      .then((data) => setCards(Array.isArray(data) ? data : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  // No renderizar si no hay cards y no se está agregando (panel silencioso)
  if (!loading && cards.length === 0 && !adding) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar anotación manual
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/context-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:   title.trim() || "Anotación",
        content: content.trim(),
        order:   cards.length,
      }),
    });
    if (res.ok) {
      const card = await res.json();
      setCards((prev) => [...prev, card]);
      setTitle("");
      setContent("");
      setAdding(false);
    }
    setSaving(false);
  };

  return (
    <div className="border-t border-gray-800/60 pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Anotaciones manuales
        </span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-gray-600 hover:text-brand-light transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar
          </button>
        )}
      </div>

      {/* Cards existentes */}
      {cards.length > 0 && (
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance] mb-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="break-inside-avoid mb-4 rounded-2xl bg-white border border-gray-100 p-4 shadow-sm"
            >
              <p className="text-xs font-semibold text-gray-700 mb-1">{card.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{card.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Formulario de nueva anotación */}
      {adding && (
        <div className="rounded-2xl border border-dashed border-gray-700 p-4 space-y-2 bg-gray-900/30">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full text-xs bg-transparent border-b border-gray-800 pb-1 text-gray-300 placeholder-gray-600 outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe la anotación…"
            rows={3}
            className="w-full text-xs bg-transparent text-gray-300 placeholder-gray-600 outline-none resize-none"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="text-xs px-3 py-1 rounded-lg bg-brand/10 border border-brand/20 text-brand-light hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => { setAdding(false); setTitle(""); setContent(""); }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div
            className="h-2.5 w-36 rounded-full skeleton-shimmer"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="break-inside-avoid mb-4 h-28 rounded-2xl skeleton-shimmer"
                style={{ animationDelay: `${i * 0.1 + j * 0.07}s` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
