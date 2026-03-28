"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-64 bg-gray-50 rounded-xl animate-pulse" /> }
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
  const [addingCard, setAddingCard] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Scroll to highlighted card
  useEffect(() => {
    if (highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }
  }, []);

  // Fetch suggestions (off-canvas cards from agents)
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

  const confirmedCards = section.cards.filter((c) => c.canvasStatus === "confirmed");
  const draftCards = section.cards.filter((c) => c.canvasStatus === "draft");
  const icon = SECTION_ICONS[sectionKey] ?? "📄";

  // Card clickeada y sus sugerencias contextuales
  const clickedCard = highlightCardId ? section.cards.find((c) => c.id === highlightCardId) : null;
  const otherCards = section.cards.filter((c) => c.id !== highlightCardId);

  // Filtrar suggestions por relatedCard (match por título de la card clickeada)
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
  const otherSuggestions = suggestions.filter((s) => !contextualSuggestions.includes(s));

  // Add suggestion to canvas
  const handleAddSuggestion = async (card: SuggestionCard) => {
    setAddingSuggestion(card.id);
    try {
      await fetch(`/api/projects/${projectId}/canvas-cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          toSection: sectionKey,
          toIndex: section.cards.length,
        }),
      });
      // Remove from suggestions list
      setSuggestions((prev) => prev.filter((s) => s.id !== card.id));
      onCardCreated();
    } catch { /* silent */ }
    setAddingSuggestion(null);
  };

  // Create new manual card
  const handleAddCard = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/context-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent }),
      });
      const card = await res.json();
      if (!res.ok) throw new Error(card.error);

      await fetch(`/api/projects/${projectId}/canvas-cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          toSection: sectionKey,
          toIndex: section.cards.length,
        }),
      });

      setNewTitle("");
      setNewContent("");
      setAddingCard(false);
      onCardCreated();
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-[94vw] max-w-[1200px] h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
            <span className="text-xl">{icon}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900">{section.label}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-green-600 font-medium">{confirmedCards.length} en canvas</span>
                {draftCards.length > 0 && (
                  <span className="text-amber-600 ml-2">{draftCards.length} borrador{draftCards.length !== 1 ? "es" : ""}</span>
                )}
                {suggestions.length > 0 && (
                  <span className="text-violet-500 ml-2">{suggestions.length} sugerencia{suggestions.length !== 1 ? "s" : ""}</span>
                )}
              </p>
            </div>

            <button
              onClick={() => setAddingCard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar card
            </button>

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

            {/* Add card form */}
            {addingCard && (
              <div className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/5 p-4 space-y-3 mb-6">
                <input
                  autoFocus
                  placeholder="Título de la card"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddCard()}
                />
                <textarea
                  placeholder="Contenido (soporta **markdown**)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCard}
                    disabled={!newTitle.trim() || saving}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    onClick={() => { setAddingCard(false); setNewTitle(""); setNewContent(""); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* ── Card clickeada (prominente) ── */}
            {clickedCard && (
              <div className="mb-6" ref={highlightRef}>
                <CanvasCardInModal
                  card={clickedCard}
                  clientId={clientId}
                  onAcceptDraft={clickedCard.canvasStatus === "draft" ? () => onAcceptDraft(clickedCard.id) : undefined}
                  onRejectDraft={clickedCard.canvasStatus === "draft" ? () => onRejectDraft(clickedCard.id) : undefined}
                  onRemove={() => onRemoveCard(clickedCard.id)}
                  onDiagramSave={onDiagramSave}
                />
              </div>
            )}

            {/* ── Sugerencias contextuales (relacionadas a la card clickeada) ── */}
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

            {/* ── Otras cards de la sección ── */}
            {otherCards.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Otras cards en {section.label}</h3>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="columns-1 md:columns-2 gap-4 [column-fill:_balance]">
                  {otherCards.map((card) => (
                    <div key={card.id} className="break-inside-avoid mb-4">
                      <CanvasCardInModal
                        card={card}
                        clientId={clientId}
                        onAcceptDraft={card.canvasStatus === "draft" ? () => onAcceptDraft(card.id) : undefined}
                        onRejectDraft={card.canvasStatus === "draft" ? () => onRejectDraft(card.id) : undefined}
                        onRemove={() => onRemoveCard(card.id)}
                        onDiagramSave={onDiagramSave}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Otras sugerencias ── */}
            {!loadingSuggestions && otherSuggestions.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Otras sugerencias</h3>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="columns-1 md:columns-2 gap-4 [column-fill:_balance]">
                  {otherSuggestions.map((card) => (
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

            {/* Empty state */}
            {section.cards.length === 0 && suggestions.length === 0 && !addingCard && !loadingSuggestions && (
              <div className="text-center py-16 text-sm text-gray-400">
                <p>No hay cards en esta sección ni sugerencias de agentes.</p>
                <button
                  onClick={() => setAddingCard(true)}
                  className="mt-2 text-brand hover:underline"
                >
                  Agregar la primera card
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Canvas Card (already on canvas) ─────────────────────────────────────────

function CanvasCardInModal({
  card,
  clientId,
  onAcceptDraft,
  onRejectDraft,
  onRemove,
  onDiagramSave,
}: {
  card: CanvasCard;
  clientId: string;
  onAcceptDraft?: () => void;
  onRejectDraft?: () => void;
  onRemove: () => void;
  onDiagramSave?: () => void;
}) {
  const isDraft = card.canvasStatus === "draft";
  const isUpdate = isDraft && !!card.parentCardId;

  return (
    <div className={`group rounded-xl border transition-colors ${
      isDraft
        ? "border-amber-300 border-dashed bg-amber-50/30"
        : "border-gray-200 bg-white hover:border-gray-300"
    }`}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        {/* Green dot = on canvas */}
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
        <h4 className="text-sm font-semibold text-gray-800 flex-1 leading-tight">{card.title}</h4>

        {isDraft && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            isUpdate ? "text-blue-600 bg-blue-100" : "text-amber-600 bg-amber-100"
          }`}>
            {isUpdate ? "UPDATE" : "BORRADOR"}
          </span>
        )}

        {card.source === "AGENT" && !isDraft && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 border border-violet-100 font-medium flex-shrink-0">
            Agente
          </span>
        )}

        {isDraft ? (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={onAcceptDraft} className="p-1 rounded text-green-600 hover:bg-green-50" title="Aceptar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </button>
            <button onClick={onRejectDraft} className="p-1 rounded text-red-500 hover:bg-red-50" title="Rechazar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <button onClick={onRemove} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title="Quitar del canvas">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Content */}
      {card.cardType === "FLOWCHART" && card.diagramData ? (
        <>
          {card.content && (
            <div className="px-4 py-2 text-xs text-gray-600 leading-relaxed prose prose-xs prose-gray max-w-none border-t border-gray-100">
              <ReactMarkdown>{card.content}</ReactMarkdown>
            </div>
          )}
          <div className="h-[350px] border-t border-gray-100">
            <FlowchartViewer
              data={{
                title: card.title,
                description: card.content,
                nodes: (card.diagramData as { nodes: unknown[] }).nodes as Array<{ id: string; type: string; label: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string; position?: { x: number; y: number } }>,
                edges: (card.diagramData as { edges: unknown[] }).edges as Array<{ id?: string; source: string; target: string; label?: string; edgeType?: "yes" | "no" | "default"; sourceHandle?: string; targetHandle?: string; strokeColor?: string; dashed?: boolean }>,
              }}
              onSave={async (updated) => {
                await fetch(`/api/clients/${clientId}/context-cards/${card.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    diagramData: { nodes: updated.nodes, edges: updated.edges },
                    title: updated.title ?? card.title,
                    content: updated.description ?? card.content,
                  }),
                });
                onDiagramSave?.();
              }}
            />
          </div>
        </>
      ) : card.content ? (
        <div className="px-4 py-2.5 text-xs text-gray-600 leading-relaxed prose prose-xs prose-gray max-w-none border-t border-gray-100">
          <ReactMarkdown>{card.content}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}

// ── Suggestion Card (off-canvas, from agents) ───────────────────────────────

function SuggestionCardItem({
  card,
  onAdd,
  adding,
}: {
  card: SuggestionCard;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="group rounded-xl border border-dashed border-violet-200 bg-violet-50/30 hover:border-violet-300 transition-colors">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
        <h4 className="text-sm font-medium text-gray-700 flex-1 leading-tight">{card.title}</h4>

        {card.agentName && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium flex-shrink-0 truncate max-w-[120px]">
            {card.agentName}
          </span>
        )}

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

      {/* Content preview */}
      {card.content && (
        <div className="px-4 py-2 text-xs text-gray-500 leading-relaxed prose prose-xs prose-gray max-w-none border-t border-violet-100">
          <ReactMarkdown>{card.content.length > 300 ? card.content.slice(0, 300) + "..." : card.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
