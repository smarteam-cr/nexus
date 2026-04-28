"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-shimmer" /> }
);

// ── Types ───────────────────────────────────────────────────────────────────

interface CanvasCard {
  id: string;
  title: string;
  content: string;
  cardType: "TEXT" | "FLOWCHART" | "CHART";
  canvasOrder: number | null;
  canvasStatus: "draft" | "confirmed";
  diagramData: unknown;
  source: "AGENT" | "HUMAN" | "MODIFIED";
  parentCardId: string | null;
  publishedToClient: boolean;
  publishedContent: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SuggestionCard extends CanvasCard {
  agentName?: string;
}

interface CanvasSection {
  key: string;
  label: string;
  cards: CanvasCard[];
}

const SECTION_ICONS: Record<string, string> = {
  objetivo_alcance: "🎯",
  hipotesis_recomendaciones: "💡",
  procesos: "⚙️",
  plan_implementacion: "📋",
};

// ── Suggestion type config ──────────────────────────────────────────────────

const SUGGESTION_TYPES: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  hypothesis: { icon: "💡", label: "Hipótesis",       color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  question:   { icon: "❓", label: "Pregunta",        color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  recommendation: { icon: "📈", label: "Recomendación", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  process:    { icon: "⚙️", label: "Proceso",         color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
};

const DEFAULT_SUGGESTION_TYPE = { icon: "💬", label: "Sugerencia", color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200" };

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  sectionKey: string;
  sections: CanvasSection[];
  highlightCardId: string | null;
  clientId: string;
  projectId: string;
  onClose: () => void;
  onAcceptDraft: (cardId: string) => void;
  onRejectDraft: (cardId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onCardCreated: () => void;
  onDiagramSave: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SectionDiscoveryModal({
  sectionKey,
  sections,
  highlightCardId,
  clientId,
  projectId,
  onClose,
  onAcceptDraft,
  onRejectDraft,
  onRemoveCard,
  onCardCreated,
  onDiagramSave,
}: Props) {
  const section = sections.find((s) => s.key === sectionKey);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  // Editable card state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Feedback form state
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/canvas-cards?include=suggestions`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch { /* silent */ }
    setLoadingSuggestions(false);
  }, [projectId]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  if (!section) return null;

  // Card clickeada
  const clickedCard = highlightCardId ? section.cards.find((c) => c.id === highlightCardId) : null;

  // Filtrar suggestions por relatedCard
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!]/g, "").trim();
  const contextualSuggestions = clickedCard
    ? suggestions.filter((s) => {
        const meta = s.diagramData as { relatedCard?: string } | null;
        if (!meta?.relatedCard) return false;
        const related = normalize(meta.relatedCard);
        const cardTitle = normalize(clickedCard.title);
        return related === cardTitle || cardTitle.includes(related) || related.includes(cardTitle);
      })
    : [];
  // No mostramos "otras sugerencias" — solo las contextuales a la card clickeada

  // Add suggestion to canvas
  const handleAddSuggestion = async (card: SuggestionCard) => {
    setAddingSuggestion(card.id);
    try {
      await fetch(`/api/projects/${projectId}/canvas-cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, toSection: sectionKey, toIndex: section.cards.length }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== card.id));
      onCardCreated();
    } catch { /* silent */ }
    setAddingSuggestion(null);
  };

  // Edit card
  const startEditing = () => {
    if (!clickedCard) return;
    setEditTitle(clickedCard.title);
    setEditContent(clickedCard.content);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!clickedCard || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await fetch(`/api/clients/${clientId}/context-cards/${clickedCard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent }),
      });
      setEditing(false);
      onCardCreated(); // refresh
    } catch { /* silent */ }
    setSavingEdit(false);
  };

  const icon = SECTION_ICONS[sectionKey] ?? "📄";
  const totalSuggestions = contextualSuggestions.length;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-[94vw] max-w-[1200px] h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
            <span className="text-xl">{icon}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900">
                {clickedCard?.title ?? section.label}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalSuggestions > 0 ? (
                  <span className="text-violet-500 font-medium">{totalSuggestions} sugerencia{totalSuggestions !== 1 ? "s" : ""} para explorar</span>
                ) : (
                  <span>Sin sugerencias disponibles</span>
                )}
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">

            {/* ── Card clickeada (expandida, editable) ── */}
            {clickedCard && (
              <div className="mb-6 rounded-xl border border-gray-200 bg-white" ref={highlightRef}>
                <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-800 flex-1">
                    {editing ? (
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-2 py-1 text-sm font-semibold rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    ) : (
                      clickedCard.title
                    )}
                  </h4>

                  {clickedCard.canvasStatus === "draft" ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-amber-600 bg-amber-100 mr-1">BORRADOR</span>
                      <button onClick={() => onAcceptDraft(clickedCard.id)} className="p-1 rounded text-green-600 hover:bg-green-50" title="Aceptar">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button onClick={() => onRejectDraft(clickedCard.id)} className="p-1 rounded text-red-500 hover:bg-red-50" title="Rechazar">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!editing && (
                        <button onClick={startEditing} className="px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                          Editar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                {editing ? (
                  <div className="p-4 space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={savingEdit} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50">
                        {savingEdit ? "Guardando..." : "Guardar"}
                      </button>
                      <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : clickedCard.cardType === "FLOWCHART" && clickedCard.diagramData ? (
                  <>
                    {clickedCard.content && (
                      <div className="px-5 py-3 text-sm text-gray-600 leading-relaxed prose prose-sm prose-gray max-w-none border-b border-gray-100">
                        <ReactMarkdown>{clickedCard.content}</ReactMarkdown>
                      </div>
                    )}
                    <div className="h-[350px]">
                      <FlowchartViewer
                        data={{
                          title: clickedCard.title,
                          description: clickedCard.content,
                          nodes: (clickedCard.diagramData as { nodes: unknown[] }).nodes as Array<{ id: string; type: string; label: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string; position?: { x: number; y: number } }>,
                          edges: (clickedCard.diagramData as { edges: unknown[] }).edges as Array<{ id?: string; source: string; target: string; label?: string; edgeType?: "yes" | "no" | "default"; sourceHandle?: string; targetHandle?: string; strokeColor?: string; dashed?: boolean }>,
                        }}
                        onSave={async (updated) => {
                          await fetch(`/api/clients/${clientId}/context-cards/${clickedCard.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              diagramData: { nodes: updated.nodes, edges: updated.edges },
                              title: updated.title ?? clickedCard.title,
                              content: updated.description ?? clickedCard.content,
                            }),
                          });
                          onDiagramSave();
                        }}
                      />
                    </div>
                  </>
                ) : clickedCard.content ? (
                  <div className="px-5 py-4 text-sm text-gray-600 leading-relaxed prose prose-sm prose-gray max-w-none">
                    <ReactMarkdown>{clickedCard.content}</ReactMarkdown>
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Sugerencias contextuales ── */}
            {contextualSuggestions.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  <h3 className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Explora más sobre esta card</h3>
                  <div className="flex-1 h-px bg-violet-100" />
                </div>
                <div className="columns-1 md:columns-2 gap-4 [column-fill:_balance]">
                  {contextualSuggestions.map((card) => (
                    <div key={card.id} className="break-inside-avoid mb-4">
                      <SuggestionCardItem
                        card={card}
                        onAdd={() => handleAddSuggestion(card)}
                        adding={addingSuggestion === card.id}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingSuggestions && (
              <div className="text-center py-8 text-sm text-gray-400">Cargando sugerencias...</div>
            )}

            {/* ── Empty state: sin sugerencias ── */}
            {!loadingSuggestions && totalSuggestions === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6">
                {feedbackSent ? (
                  <div className="text-center py-4">
                    <span className="text-2xl">✅</span>
                    <p className="text-sm text-gray-600 mt-2 font-medium">Feedback guardado</p>
                    <p className="text-xs text-gray-400 mt-1">Se usará para mejorar los agentes en futuras ejecuciones.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-3">
                      No hay sugerencias para esta card. ¿Qué te gustaría que los agentes exploraran?
                    </p>
                    <textarea
                      placeholder="Ej: Explorar si el cliente tiene un proceso de onboarding post-matrícula que no se mencionó..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none mb-3"
                    />
                    <button
                      onClick={() => {
                        // TODO: Save feedback to DB for agent improvement
                        if (feedbackText.trim()) setFeedbackSent(true);
                      }}
                      disabled={!feedbackText.trim()}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
                    >
                      Enviar sugerencia
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Suggestion Card ─────────────────────────────────────────────────────────

function SuggestionCardItem({
  card,
  onAdd,
  adding,
}: {
  card: SuggestionCard;
  onAdd: () => void;
  adding: boolean;
}) {
  const meta = card.diagramData as { suggestionType?: string } | null;
  const typeKey = meta?.suggestionType ?? "hypothesis";
  const typeConfig = SUGGESTION_TYPES[typeKey] ?? DEFAULT_SUGGESTION_TYPE;

  return (
    <div className={`group rounded-xl border border-dashed ${typeConfig.border} ${typeConfig.bg} hover:shadow-sm transition-all`}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm flex-shrink-0">{typeConfig.icon}</span>
        <h4 className={`text-sm font-medium ${typeConfig.color} flex-1 leading-tight`}>{card.title}</h4>

        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${typeConfig.color} ${typeConfig.bg} border ${typeConfig.border}`}>
          {typeConfig.label}
        </span>

        <button
          onClick={onAdd}
          disabled={adding}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors flex-shrink-0"
          title="Agregar al canvas"
        >
          {adding ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          Agregar
        </button>
      </div>

      {/* Content */}
      {card.content && (
        <div className={`px-4 py-2 text-xs text-gray-600 leading-relaxed prose prose-xs prose-gray max-w-none border-t ${typeConfig.border}`}>
          <ReactMarkdown>{card.content.length > 400 ? card.content.slice(0, 400) + "..." : card.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
