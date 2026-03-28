"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";
import SendToCanvasMenu from "./SendToCanvasMenu";

// Importar FlowchartViewer dinámicamente (depende de @xyflow/react que es client-only)
const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer"),
  {
    loading: () => (
      <div className="h-[600px] flex items-center justify-center text-sm text-gray-400 animate-pulse">
        Cargando diagrama…
      </div>
    ),
    ssr: false,
  }
);

interface ContextCard {
  id: string;
  title: string;
  content: string;
  order: number;
  source: "AGENT" | "HUMAN" | "MODIFIED";
  cardType?: "TEXT" | "FLOWCHART" | "CHART";
  diagramData?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface AnalysisRun {
  id: string;
  createdAt: string;
  status: string;
  step?: number | null;
  agent?: { name: string } | null;
}

interface Props {
  clientId: string;
  projectId?: string;
  stage: number;
  stepLabel?: string;
  stepKeywords?: string[];
  stepIndex?: number;
  // Multi-sección
  sectionLabel?: string;
  agentId?: string;
  agentName?: string;
  agentOutputType?: "CARDS" | "FLOWCHART" | "CARDS_AND_FLOWCHARTS" | null;
  initialLastRun?: AnalysisRun | null;
  initialRuns?: AnalysisRun[];
}

export default function ClientContextCards({
  clientId,
  projectId,
  stage,
  stepLabel,
  stepKeywords,
  stepIndex,
  sectionLabel,
  agentId,
  agentName,
  agentOutputType: propAgentOutputType,
  initialLastRun,
  initialRuns,
}: Props) {

  // ── Estado global del componente ─────────────────────────────────────────────
  const [loadingRuns, setLoadingRuns]     = useState(true);
  const [analyzing, setAnalyzing]         = useState(false);
  const [lastRun, setLastRun]             = useState<AnalysisRun | null>(initialLastRun ?? null);
  const [runs, setRuns]                   = useState<AnalysisRun[]>(initialRuns ?? []);
  const [agentAvailable, setAgentAvailable] = useState(!!agentId);
  const [analyzeError, setAnalyzeError]   = useState<string | null>(null);
  const agentOutputType                   = propAgentOutputType ?? null;
  const [flowchart, setFlowchart]         = useState<FlowchartData | null>(null);
  const [flowcharts, setFlowcharts]       = useState<FlowchartData[]>([]);
  const [runCards, setRunCards]           = useState<ContextCard[]>([]);
  const [historyRun, setHistoryRun]       = useState<{
    run: AnalysisRun;
    cards: { title: string; content: string; source?: ContextCard["source"] }[];
    outputType?: string;
    flowchart?: FlowchartData | null;
    flowcharts?: FlowchartData[];
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [addingCard, setAddingCard]       = useState(false);
  const [newTitle, setNewTitle]           = useState("");
  const [newContent, setNewContent]       = useState("");
  const [saving, setSaving]               = useState(false);
  const newContentRef                     = useRef<HTMLTextAreaElement>(null);

  // ── Efecto: cargar contenido al montar ────────────────────────────────────────
  // Si hay un lastRun, carga sus cards/flowcharts via /analyze/:id.
  // Si no hay agente configurado, carga las cards manuales (HUMAN, sin run).
  useEffect(() => {
    setFlowchart(null);
    setFlowcharts([]);
    setRunCards([]);

    // Sin agente → cargar anotaciones manuales (sin run)
    if (!agentId) {
      setLoadingRuns(true);
      fetch(`/api/clients/${clientId}/context-cards?noRun=true`)
        .then((r) => r.json())
        .then((data) => setRunCards(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingRuns(false));
      return;
    }

    // Con agente pero sin run previo → nada que cargar
    if (!lastRun?.id) {
      setLoadingRuns(false);
      return;
    }

    // Con agente y run previo → cargar contenido del run
    setLoadingRuns(true);
    fetch(`/api/clients/${clientId}/analyze/${lastRun.id}`)
      .then((r) => r.json())
      .then((rd) => {
        if (rd.cards?.length)      setRunCards(rd.cards);
        if (rd.flowchart)          setFlowchart(rd.flowchart);
        if (rd.flowcharts?.length) setFlowcharts(rd.flowcharts);
      })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, agentId, lastRun?.id]);

  // Focus textarea al abrir el formulario de nueva card
  useEffect(() => {
    if (addingCard) {
      setTimeout(() => newContentRef.current?.focus(), 50);
    }
  }, [addingCard]);

  // ── Ejecutar agente ───────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          step:            stepIndex ?? 0,
          stepLabel:       stepLabel ?? null,
          sessionKeywords: stepKeywords ?? [],
          sectionLabel:    sectionLabel ?? null,
          agentId:         agentId ?? null,
          projectId:       projectId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.error === "NO_AGENT_CONFIGURED") {
        setAgentAvailable(false);
        return;
      }

      if (data.error) {
        setAnalyzeError(data.message ?? "Error al ejecutar el agente.");
        return;
      }

      if (Array.isArray(data.cards) && data.cards.length > 0) {
        setRunCards(data.cards);
      }
      if (data.flowchart)          setFlowchart(data.flowchart);
      if (data.flowcharts?.length) setFlowcharts(data.flowcharts);
      if (data.run) {
        setLastRun(data.run);
        setRuns((prev) => [data.run, ...prev.filter((r) => r.id !== data.run!.id)]);
      }
    } catch {
      setAnalyzeError("Error de conexión. Verifica tu red e intenta de nuevo.");
    } finally {
      setAnalyzing(false);
    }
  }, [clientId, stage, stepLabel, stepKeywords, stepIndex, sectionLabel, agentId]);

  // ── Añadir card manual ────────────────────────────────────────────────────────
  const handleAddCard = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/context-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:      newTitle.trim() || "Anotación",
        content:    newContent.trim(),
        order:      runCards.length,
        agentRunId: lastRun?.id ?? null,
      }),
    });
    if (res.ok) {
      const card = await res.json();
      setRunCards((prev) => [...prev, card]);
      setNewTitle("");
      setNewContent("");
      setAddingCard(false);
    }
    setSaving(false);
  };

  const handleUpdateRunCard = (updatedCard: ContextCard) => {
    setRunCards((prev) => prev.map((c) => (c.id === updatedCard.id ? updatedCard : c)));
  };

  const handleDeleteRunCard = async (cardId: string) => {
    await fetch(`/api/clients/${clientId}/context-cards/${cardId}`, { method: "DELETE" });
    setRunCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  // ── Historial ─────────────────────────────────────────────────────────────────
  const handleOpenHistory = async (run: AnalysisRun) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze/${run.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRun({
          run,
          cards:     data.cards ?? [],
          outputType: data.outputType ?? "CARDS",
          flowchart:  data.flowchart ?? null,
          flowcharts: data.flowcharts ?? [],
        });
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  // ── Guardar flowchart editado ─────────────────────────────────────────────────
  const handleSaveFlowchart = useCallback(async (updated: FlowchartData, index: number) => {
    if (!lastRun?.id) return;
    const updatedList = flowcharts.map((fc, i) => (i === index ? updated : fc));
    setFlowcharts(updatedList);
    await fetch(`/api/clients/${clientId}/analyze/${lastRun.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowcharts: updatedList }),
    });
  }, [clientId, lastRun, flowcharts]);

  // ── Derivados de UI ───────────────────────────────────────────────────────────
  const displayLabel = sectionLabel ?? "Contexto del cliente";
  const hasContent   = runCards.length > 0 || flowcharts.length > 0 || (agentOutputType === "FLOWCHART" && !!flowchart);

  return (
    <div className="mb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-brand/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
            {displayLabel}
          </span>
          {runCards.length > 0 && (
            <span className="text-2xs text-gray-700 ml-0.5">({runCards.length})</span>
          )}
        </div>

        {/* Acciones del header */}
        <div className="flex items-center gap-1">
          {/* Botón ejecutar / re-ejecutar agente */}
          {agentAvailable && !analyzing && (
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-light transition-colors px-2 py-1 rounded hover:bg-brand/5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {hasContent ? "Re-ejecutar" : `Ejecutar: ${agentName ?? "Agente"}`}
            </button>
          )}
          {analyzing && (
            <span className="flex items-center gap-1 text-xs text-brand-light px-2 py-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Ejecutando…
            </span>
          )}
          {/* Botón agregar anotación (solo cuando ya hay contenido y es tipo CARDS) */}
          {!addingCard && hasContent && agentOutputType !== "FLOWCHART" && (
            <button
              onClick={() => setAddingCard(true)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-light transition-colors px-2 py-1 rounded hover:bg-brand/5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar
            </button>
          )}
        </div>
      </div>

      {/* ── Error de ejecución ── */}
      {analyzeError && hasContent && (
        <div className="mx-1 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {analyzeError}
          <button onClick={() => setAnalyzeError(null)} className="ml-auto text-red-500 hover:text-red-300">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Skeleton unificado: cualquier tipo de output ── */}
      {(analyzing || loadingRuns) && (
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
          {([
            { tw: "40%",  lines: ["100%","85%","75%","100%","70%","90%","100%","60%"] },
            { tw: "50%",  lines: ["100%","78%","100%","55%"] },
            { tw: "40%",  lines: ["100%","92%","75%","80%","100%","68%"] },
            { tw: "60%",  lines: ["100%","88%","100%","72%","95%","100%","50%","83%","100%","65%"] },
            { tw: "33%",  lines: ["100%","75%","100%"] },
            { tw: "40%",  lines: ["100%","82%","60%","100%","77%"] },
            { tw: "50%",  lines: ["100%","90%","75%","100%","58%","86%","100%"] },
          ]).map((card, i) => (
            <div key={i} className="break-inside-avoid mb-4 rounded-2xl bg-white border border-gray-100 p-5">
              <div
                className="h-3 rounded-full mb-4 skeleton-shimmer"
                style={{ width: card.tw, animationDelay: `${i * 0.07}s` }}
              />
              <div className="space-y-2.5">
                {card.lines.map((w, j) => (
                  <div
                    key={j}
                    className="h-2 rounded-full skeleton-shimmer"
                    style={{ width: w, animationDelay: `${(i * 0.07 + j * 0.05).toFixed(2)}s` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Flowchart único (FLOWCHART) ── */}
      {!analyzing && agentOutputType === "FLOWCHART" && flowchart && (
        <div className="mb-6">
          <FlowchartViewer
            data={flowchart}
            onSave={lastRun?.id ? async (updated) => {
              setFlowchart(updated);
              await fetch(`/api/clients/${clientId}/analyze/${lastRun!.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ flowchart: updated }),
              });
            } : undefined}
          />
        </div>
      )}

      {/* ── CARDS_AND_FLOWCHARTS: cards del run + diagramas ── */}
      {!analyzing && agentOutputType === "CARDS_AND_FLOWCHARTS" && (runCards.length > 0 || flowcharts.length > 0 || addingCard) && (
        <div>
          {/* Cards de texto del run (editables) */}
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance] mb-8">
            {runCards.filter((c) => c.cardType !== "FLOWCHART" && c.cardType !== "CHART").map((card) => (
              <ContextCardItem
                key={card.id}
                card={card}
                clientId={clientId}
                projectId={projectId}
                onUpdate={handleUpdateRunCard}
                onDelete={() => handleDeleteRunCard(card.id)}
              />
            ))}
            {/* Formulario inline para nueva anotación */}
            {addingCard ? (
              <div className="break-inside-avoid mb-4 rounded-2xl bg-white shadow-sm border-2 border-brand/40 p-5">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setAddingCard(false); setNewTitle(""); setNewContent(""); } }}
                  placeholder="Título (opcional)"
                  className="w-full mb-3 bg-transparent border-b-2 border-gray-200 focus:border-brand text-gray-900 text-sm font-bold pb-1.5 focus:outline-none transition-colors placeholder-gray-300"
                />
                <textarea
                  ref={newContentRef}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setAddingCard(false); setNewTitle(""); setNewContent(""); }
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleAddCard(); }
                  }}
                  placeholder="Escribe la anotación… (⌘↵ para guardar)"
                  rows={5}
                  className="w-full bg-transparent text-gray-600 text-xs leading-relaxed resize-none focus:outline-none placeholder-gray-300"
                />
                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => { setAddingCard(false); setNewTitle(""); setNewContent(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 transition-colors">Cancelar</button>
                  <button onClick={handleAddCard} disabled={!newContent.trim() || saving} className="text-xs px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-40 text-white font-medium transition-colors">
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCard(true)}
                className="break-inside-avoid mb-4 w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand/50 hover:bg-brand/5 transition-all duration-150 p-5 flex flex-col items-center justify-center gap-2 min-h-[80px] group"
              >
                <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-brand/10 flex items-center justify-center transition-colors">
                  <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-light transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-xs text-gray-400 group-hover:text-brand-light transition-colors font-medium">Agregar anotación</span>
              </button>
            )}
          </div>
          {/* Flowcharts */}
          {flowcharts.length > 0 && (
            <div className="space-y-8">
              {/* Header de diagramas */}
              <div className="flex items-center gap-1.5 pb-2 border-b border-gray-800/50">
                <svg className="w-3.5 h-3.5 text-brand/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
                  Diagramas de proceso
                </span>
                <span className="text-2xs text-gray-700">
                  ({flowcharts.length})
                </span>
              </div>
              {/* Todos los flowcharts apilados */}
              {flowcharts.map((fc, idx) => {
                // Find the matching FLOWCHART card for this diagram (by title or order)
                const flowchartCards = runCards.filter((c) => c.cardType === "FLOWCHART");
                const matchingCard = flowchartCards[idx];
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      {fc.title && (
                        <p className="text-xs font-semibold text-gray-400">
                          {idx + 1}. {fc.title}
                        </p>
                      )}
                      {/* SendToCanvasMenu removed — flowcharts auto-populate canvas as drafts */}
                    </div>
                    {fc.description && (
                      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                        {fc.description}
                      </p>
                    )}
                    <FlowchartViewer
                      data={fc}
                      onSave={(updated) => handleSaveFlowchart(updated, idx)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Error de ejecución ── */}
      {analyzeError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs leading-relaxed flex items-start gap-2">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {analyzeError}
        </div>
      )}

      {/* ── Masonry grid (CARDS o sin agente) ── */}
      {!analyzing && !loadingRuns && agentOutputType !== "FLOWCHART" && agentOutputType !== "CARDS_AND_FLOWCHARTS" && (runCards.length > 0 || addingCard) && (
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
          {runCards.map((card) => (
            <ContextCardItem
              key={card.id}
              card={card}
              clientId={clientId}
              projectId={projectId}
              onUpdate={handleUpdateRunCard}
              onDelete={() => handleDeleteRunCard(card.id)}
            />
          ))}

          {/* Nueva anotación — inline en el masonry */}
          {addingCard ? (
            <div className="break-inside-avoid mb-4 rounded-2xl bg-white shadow-sm border-2 border-brand/40 p-5">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingCard(false);
                    setNewTitle("");
                    setNewContent("");
                  }
                }}
                placeholder="Título (opcional)"
                className="w-full mb-3 bg-transparent border-b-2 border-gray-200 focus:border-brand text-gray-900 text-sm font-bold pb-1.5 focus:outline-none transition-colors placeholder-gray-300"
              />
              <textarea
                ref={newContentRef}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingCard(false);
                    setNewTitle("");
                    setNewContent("");
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleAddCard();
                  }
                }}
                placeholder="Escribe la anotación… (⌘↵ para guardar)"
                rows={5}
                className="w-full bg-transparent text-gray-600 text-xs leading-relaxed resize-none focus:outline-none placeholder-gray-300"
              />
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    setAddingCard(false);
                    setNewTitle("");
                    setNewContent("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddCard}
                  disabled={!newContent.trim() || saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-40 text-white font-medium transition-colors"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            /* Ghost card — siempre visible al final del masonry */
            <button
              onClick={() => setAddingCard(true)}
              className="break-inside-avoid mb-4 w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand/50 hover:bg-brand/5 transition-all duration-150 p-5 flex flex-col items-center justify-center gap-2 min-h-[80px] group"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 group-hover:bg-brand/10 flex items-center justify-center transition-colors">
                <svg
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-light transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <span className="text-xs text-gray-400 group-hover:text-brand-light transition-colors font-medium">
                Agregar anotación
              </span>
            </button>
          )}
        </div>
      )}


      {/* ── Histórico de ejecuciones ── */}
      {!loadingRuns && runs.length > 1 && (
        <div className="mt-4 pt-3 border-t border-gray-800/50 flex items-center gap-2">
          <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">
            Histórico
          </span>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {runs.map((run, idx) => (
              <button
                key={run.id}
                onClick={() => handleOpenHistory(run)}
                disabled={loadingHistory}
                title={`${run.agent?.name ?? "Agente"} — ${new Date(run.createdAt).toLocaleString("es-ES")}`}
                className={`shrink-0 flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                  idx === 0
                    ? "border-brand/40 text-brand/80 bg-brand/5 hover:bg-brand/10"
                    : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  run.step === 0 ? "bg-sky-400" :
                  run.step === 1 ? "bg-violet-400" :
                  "bg-gray-400"
                }`} />
                <span className="font-medium">{run.agent?.name ?? "Agente"}</span>
                <span className="opacity-50">·</span>
                <span>
                  {new Date(run.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric", month: "short",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal historial ── */}
      {historyRun && (
        <HistoryModal
          run={historyRun.run}
          cards={historyRun.cards}
          outputType={historyRun.outputType}
          flowchart={historyRun.flowchart}
          flowcharts={historyRun.flowcharts}
          clientId={clientId}
          onClose={() => setHistoryRun(null)}
          onArchived={(runId) => {
            setRuns((prev) => prev.filter((r) => r.id !== runId));
            setHistoryRun(null);
          }}
        />
      )}
    </div>
  );
}

// ── Modal de historial ─────────────────────────────────────────────────────────

function HistoryModal({
  run,
  cards,
  outputType,
  flowchart,
  flowcharts,
  clientId,
  onClose,
  onArchived,
}: {
  run: AnalysisRun;
  cards: { title: string; content: string; source?: ContextCard["source"] }[];
  outputType?: string;
  flowchart?: FlowchartData | null;
  flowcharts?: FlowchartData[];
  clientId: string;
  onClose: () => void;
  onArchived: (runId: string) => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analyze/${run.id}`, {
        method: "PATCH",
      });
      if (res.ok) {
        onArchived(run.id);
        onClose();
      }
    } finally {
      setArchiving(false);
      setConfirmArchive(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {run.agent?.name ?? "Análisis del pasado"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(run.createdAt).toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Archivar */}
            {confirmArchive ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">¿Archivar esta ejecución?</span>
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {archiving ? "Archivando…" : "Sí, archivar"}
                </button>
                <button
                  onClick={() => setConfirmArchive(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmArchive(true)}
                title="Archivar ejecución"
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12v4m4-4v4" />
                </svg>
                Archivar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Contenido — scrollable */}
        <div className="overflow-y-auto p-6">
          {outputType === "FLOWCHART" ? (
            flowchart ? (
              <FlowchartViewer data={flowchart} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Sin diagrama disponible.</p>
            )
          ) : outputType === "CARDS_AND_FLOWCHARTS" ? (
            <>
              {cards.length > 0 && (
                <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance] mb-8">
                  {cards.map((card, i) => (
                    <div key={i} className="break-inside-avoid mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-bold text-gray-800 mb-2">{card.title}</p>
                      <div className="space-y-1">
                        {card.content.split("\n").filter(Boolean).map((line, j) => {
                          const bullet = line.match(/^[\*\-]\s+(.+)$/);
                          if (bullet) {
                            return (
                              <div key={j} className="flex items-start gap-1.5">
                                <span className="shrink-0 mt-[6px] w-1 h-1 rounded-full bg-gray-400" />
                                <span className="text-xs text-gray-600 leading-relaxed">{renderInline(bullet[1])}</span>
                              </div>
                            );
                          }
                          return <p key={j} className="text-xs text-gray-600 leading-relaxed">{renderInline(line)}</p>;
                        })}
                      </div>
                      {card.source && (
                        <div className="mt-3 pt-2 border-t border-gray-200/60">
                          <CardSourceBadge source={card.source} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(flowcharts ?? []).length > 0 && (
                <div className="space-y-8">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Diagramas de proceso</p>
                  {(flowcharts ?? []).map((fc, idx) => (
                    <div key={idx}>
                      {fc.title && <p className="text-xs font-semibold text-gray-700 mb-3">{fc.title}</p>}
                      <FlowchartViewer data={fc} />
                    </div>
                  ))}
                </div>
              )}
              {cards.length === 0 && (flowcharts ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Sin contenido registrado en este análisis.</p>
              )}
            </>
          ) : cards.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin contenido registrado en este análisis.</p>
          ) : (
            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
              {cards.map((card, i) => (
                <div key={i} className="break-inside-avoid mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold text-gray-800 mb-2">{card.title}</p>
                  <div className="space-y-1">
                    {card.content.split("\n").filter(Boolean).map((line, j) => {
                      const bullet = line.match(/^[\*\-]\s+(.+)$/);
                      if (bullet) {
                        return (
                          <div key={j} className="flex items-start gap-1.5">
                            <span className="shrink-0 mt-[6px] w-1 h-1 rounded-full bg-gray-400" />
                            <span className="text-xs text-gray-600 leading-relaxed">{renderInline(bullet[1])}</span>
                          </div>
                        );
                      }
                      return (
                        <p key={j} className="text-xs text-gray-600 leading-relaxed">
                          {renderInline(line)}
                        </p>
                      );
                    })}
                  </div>
                  {card.source && (
                    <div className="mt-3 pt-2 border-t border-gray-200/60">
                      <CardSourceBadge source={card.source} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Badge de fuente de la card ─────────────────────────────────────────────────

function CardSourceBadge({ source }: { source: ContextCard["source"] }) {
  if (source === "AGENT") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-400/80 bg-violet-500/8 border border-violet-400/20 rounded-full px-2 py-0.5">
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Agente
      </span>
    );
  }
  if (source === "MODIFIED") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400/80 bg-amber-500/8 border border-amber-400/20 rounded-full px-2 py-0.5">
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Modificado
      </span>
    );
  }
  // HUMAN
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400/80 bg-sky-500/8 border border-sky-400/20 rounded-full px-2 py-0.5">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      CSE
    </span>
  );
}

// ── Card individual ────────────────────────────────────────────────────────────

// Número de líneas de contenido antes de colapsar la card
const COLLAPSE_THRESHOLD = 3;

function ContextCardItem({
  card,
  clientId,
  projectId,
  onUpdate,
  onDelete,
}: {
  card: ContextCard;
  clientId: string;
  projectId?: string;
  onUpdate: (card: ContextCard) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [expanded, setExpanded] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineCount = content.split("\n").length;
  const isLong = lineCount > COLLAPSE_THRESHOLD;

  const scheduleContentSave = (val: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSavingContent(true);
    saveTimeout.current = setTimeout(async () => {
      const res = await fetch(
        `/api/clients/${clientId}/context-cards/${card.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: val }),
        }
      );
      if (res.ok) onUpdate(await res.json());
      setSavingContent(false);
    }, 800);
  };

  const saveTitle = async () => {
    setEditingTitle(false);
    if (title.trim() === card.title) return;
    const res = await fetch(
      `/api/clients/${clientId}/context-cards/${card.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      }
    );
    if (res.ok) onUpdate(await res.json());
  };

  return (
    <div className="break-inside-avoid mb-4 group rounded-2xl bg-white shadow-sm hover:shadow-md transition-all duration-150 border border-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3">
        {editingTitle ? (
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setTitle(card.title);
                setEditingTitle(false);
              }
            }}
            className="flex-1 bg-transparent border-b-2 border-brand text-gray-900 text-sm font-bold pb-0.5 focus:outline-none"
          />
        ) : (
          <p
            className="flex-1 text-sm font-bold text-gray-900 leading-snug cursor-text select-text"
            onDoubleClick={() => setEditingTitle(true)}
            title="Doble clic para editar título"
          >
            {card.title}
          </p>
        )}

        {/* Acciones — visibles al hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
          {savingContent && (
            <span className="text-[9px] text-gray-400 mr-1">•</span>
          )}
          <button
            onClick={() => {
              setEditing(!editing);
              setExpanded(true); // Al editar, siempre expandir
            }}
            title="Editar contenido"
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          {/* SendToCanvasMenu removed — cards auto-populate canvas as drafts */}
          <button
            onClick={onDelete}
            title="Eliminar"
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-5 pb-3">
        {editing ? (
          <textarea
            autoFocus
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              scheduleContentSave(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={() => setEditing(false)}
            rows={Math.max(5, content.split("\n").length + 2)}
            className="w-full bg-gray-50 border border-gray-200 focus:border-brand rounded-xl px-3 py-2.5 text-gray-700 text-xs leading-relaxed resize-none focus:outline-none transition-colors"
          />
        ) : (
          <>
            <CardContent
              content={content}
              collapsed={isLong && !expanded}
              onClick={() => {
                setEditing(true);
                setExpanded(true);
              }}
            />
            {/* Ver más / Ver menos */}
            {isLong && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="mt-2 text-xs text-brand/70 hover:text-brand-light transition-colors font-medium"
              >
                {expanded ? "Ver menos ↑" : `Ver más (${lineCount} líneas) ↓`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer: badge de fuente */}
      <div className="px-5 pb-4 flex items-center gap-1.5">
        <CardSourceBadge source={card.source} />
      </div>
    </div>
  );
}

// ── Inline markdown: convierte **bold** en <strong> ───────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        if (
          (part.startsWith("**") && part.endsWith("**")) ||
          (part.startsWith("__") && part.endsWith("__"))
        ) {
          return (
            <strong key={i} className="font-semibold text-gray-800">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
}

// ── Renderizador de contenido con soporte básico de bullets ───────────────────

const MAX_VISIBLE_LINES = 2;

function CardContent({
  content,
  collapsed,
  onClick,
}: {
  content: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  if (!content.trim()) {
    return (
      <p
        className="text-xs text-gray-300 italic cursor-text"
        onClick={onClick}
        title="Clic para editar"
      >
        Sin contenido — clic para editar
      </p>
    );
  }

  const allLines = content.split("\n").filter((l) => l.trim());
  const lines = collapsed ? allLines.slice(0, MAX_VISIBLE_LINES) : allLines;

  return (
    <div
      className="cursor-text space-y-1"
      onClick={onClick}
      title="Clic para editar"
    >
      {lines.map((line, i) => {
        // Bullet point: "* texto" o "- texto"
        const bulletMatch = line.match(/^[\*\-]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span className={`text-xs text-gray-600 leading-relaxed ${collapsed ? "line-clamp-1" : ""}`}>
                {renderInline(bulletMatch[1])}
              </span>
            </div>
          );
        }
        // Texto normal
        return (
          <p key={i} className={`text-xs text-gray-600 leading-relaxed ${collapsed ? "line-clamp-1" : ""}`}>
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}
