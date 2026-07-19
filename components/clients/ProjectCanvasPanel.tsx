"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import SendToCanvasMenu from "./SendToCanvasMenu";
import ProjectGPS from "./ProjectGPS";
import SectionDiscoveryModal from "./SectionDiscoveryModal";
import HubBadge from "@/components/ui/HubBadge";
import SectionBlockList from "@/components/canvas/SectionBlockList";
import CanvasLinearView from "@/components/canvas/CanvasLinearView";
import KickoffLanding from "@/components/canvas/KickoffLanding";
import KickoffWorkspace from "@/components/canvas/KickoffWorkspace";
import DesarrolloWorkspace from "@/components/canvas/DesarrolloWorkspace";
import { UnreviewedSessionsChip } from "./ProjectSessionsReview";
import CronogramaCanvas from "@/components/canvas/CronogramaCanvas";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { ExternalAccessButton } from "./ExternalAccessPanel";
import ProjectHandoffSection from "./ProjectHandoffSection";
import ProjectLifecyclePanel from "@/components/lifecycle/ProjectLifecyclePanel";
import { useWorkspace } from "./WorkspaceContext";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-shimmer" /> }
);

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Canvas types ────────────────────────────────────────────────────────────

interface CanvasMeta {
  id: string;
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProjectCanvasPanel({
  projectId,
  tags,
  serviceType,
}: {
  projectId: string;
  tags?: string[];
  serviceType?: string | null;
}) {
  const params = useParams();
  const clientId = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasFromUrl = searchParams.get("canvas");
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ sectionKey: string; index: number } | null>(null);
  const dragCounterRef = useRef(0);
  const [modalSectionKey, setModalSectionKey] = useState<string | null>(null);
  const [modalHighlightCardId, setModalHighlightCardId] = useState<string | null>(null);
  const [processingSession, setProcessingSession] = useState(false);
  const [sessionResult, setSessionResult] = useState<{ cards: CanvasCard[]; sessionTitle: string } | null>(null);
  const [unprocessedSessions, setUnprocessedSessions] = useState(0);

  // Multi-canvas state
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  // Se incrementa al terminar una corrida de agente desde el CTA → remonta el canvas
  // activo (key) para que muestre los bloques nuevos sin recargar la página.
  const [agentNonce, setAgentNonce] = useState(0);
  // Para refrescar el widget del proyecto (ProjectGPS + pills de setup) al generar un canvas.
  const { bumpGpsRefresh, canvasRefreshSignal } = useWorkspace();
  const [canvasDropdownOpen, setCanvasDropdownOpen] = useState(false);
  const [addingSectionName, setAddingSectionName] = useState<string | null>(null);
  const canvasDropdownRef = useRef<HTMLDivElement>(null);
  // Slot en el header para los CTAs del Cronograma (Pedir cambio con IA / Guardar
  // cambios). CronogramaCanvas los renderiza acá vía portal → quedan a la par de
  // "Acceso activo" sin tener que levantar su estado del asistente.
  const [cronogramaSlot, setCronogramaSlot] = useState<HTMLDivElement | null>(null);

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId) ?? canvases.find((c) => c.isDefault) ?? canvases[0] ?? null;
  // El render se ramifica por NOMBRE, no por isDefault (Handoff es el "home" pero
  // NO es el canvas de cards). isResumenCanvas gobierna solo la UI legacy del Resumen
  // (cards + GPS), que se retira en la fase final.
  const isResumenCanvas = activeCanvas?.name === "Resumen";

  // Update URL when canvas changes (no page reload)
  const switchCanvas = useCallback((canvasId: string) => {
    setActiveCanvasId(canvasId);
    setLoading(true);
    const url = new URL(window.location.href);
    const target = canvases.find((c) => c.id === canvasId);
    if (target?.isDefault) {
      url.searchParams.delete("canvas");
    } else {
      url.searchParams.set("canvas", canvasId);
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [canvases, router]);

  // `canvasFromUrl` en un ref (no en las deps de `refetchCanvases`): `switchCanvas`
  // reescribe el `?canvas=` en cada click de tab, así que si el callback dependiera
  // de ese valor cambiaría de identidad en cada click → el effect de abajo dispararía
  // un refetch innecesario por cada cambio de tab. El ref deja leer el valor vigente
  // sin atarle la identidad del callback.
  const canvasFromUrlRef = useRef(canvasFromUrl);
  useEffect(() => { canvasFromUrlRef.current = canvasFromUrl; }, [canvasFromUrl]);

  // Fetch (o REFETCH) la lista de canvases. PRESERVA la selección activa: al
  // refrescar (ej: el handoff auto-creó "Desarrollo") no queremos saltar de canvas.
  // Solo elige uno si aún no hay activo (primer load), respetando el ?canvas de la URL.
  const refetchCanvases = useCallback(() => {
    return fetch(`/api/projects/${projectId}/canvases`)
      .then((r) => r.json())
      .then((d) => {
        const list: CanvasMeta[] = d.canvases ?? [];
        setCanvases(list);
        setActiveCanvasId((prev) => {
          // Selección vigente que sigue existiendo → se mantiene.
          if (prev && list.some((c) => c.id === prev)) return prev;
          if (list.length === 0) return prev;
          const fromUrl = canvasFromUrlRef.current ? list.find((c) => c.id === canvasFromUrlRef.current) : null;
          return fromUrl ? fromUrl.id : list[0].id;
        });
      })
      .catch(() => {});
  }, [projectId]);

  // Primer load + refetch cuando la señal genérica de canvases bumpea (canvas
  // auto-creado por un agente). La señal es el punto de escalabilidad: cualquier
  // flujo que cree/borre un canvas la bumpea y el panel se re-sincroniza sin recargar.
  useEffect(() => {
    void refetchCanvases();
  }, [refetchCanvases, canvasRefreshSignal]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (canvasDropdownRef.current && !canvasDropdownRef.current.contains(e.target as Node)) {
        setCanvasDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addSection = async () => {
    if (!addingSectionName?.trim() || !activeCanvasId) return;
    const label = addingSectionName.trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const canvas = canvases.find((c) => c.id === activeCanvasId);
    if (!canvas) return;
    const updatedSections = [...(canvas.sections ?? []), { key, label }];
    await fetch(`/api/projects/${projectId}/canvases/${activeCanvasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: updatedSections }),
    });
    setCanvases((prev) =>
      prev.map((c) => (c.id === activeCanvasId ? { ...c, sections: updatedSections } : c))
    );
    setAddingSectionName(null);
    fetchCanvasCards();
  };

  // Check for unprocessed sessions
  useEffect(() => {
    fetch(`/api/projects/${projectId}/process-session`)
      .then((r) => r.json())
      .then((d) => setUnprocessedSessions(d.unprocessed ?? 0))
      .catch(() => {});
  }, [projectId]);

  const processSession = async () => {
    setProcessingSession(true);
    setSessionResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/process-session`, { method: "POST" });
      const data = await res.json();
      if (data.cards?.length > 0) {
        setSessionResult({ cards: data.cards, sessionTitle: data.sessionTitle });
        setUnprocessedSessions((p) => Math.max(0, p - data.sessionsProcessed));
      }
    } catch { /* ignore */ }
    setProcessingSession(false);
  };

  // Card fetch + polling only for default canvas (non-default uses SectionBlockList)
  const fetchCanvasCards = useCallback(async () => {
    if (!activeCanvasId || !isResumenCanvas) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/canvas-cards`);
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, activeCanvasId, isResumenCanvas]);

  const canvasesLoaded = canvases.length > 0;
  useEffect(() => {
    if (canvasesLoaded && isResumenCanvas) fetchCanvasCards();
    if (canvasesLoaded && !isResumenCanvas) setLoading(false);
  }, [fetchCanvasCards, canvasesLoaded, isResumenCanvas]);

  const lastDraftCount = useRef(0);
  const fetchRef = useRef(fetchCanvasCards);
  fetchRef.current = fetchCanvasCards;
  useEffect(() => {
    if (!activeCanvasId || !isResumenCanvas) return;
    const interval = setInterval(() => {
      fetch(`/api/projects/${projectId}/canvas-cards`)
        .then((r) => r.json())
        .then((data) => {
          const allCards = (data.sections ?? []).flatMap((s: { cards: Array<{ canvasStatus: string }> }) => s.cards);
          const newDrafts = allCards.filter((c: { canvasStatus: string }) => c.canvasStatus === "draft").length;
          if (newDrafts > lastDraftCount.current) {
            fetchRef.current();
          }
          lastDraftCount.current = newDrafts;
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId, activeCanvasId, isResumenCanvas]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Drag & Drop handlers ─────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDragCardId(cardId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
    // Make the drag ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragCardId(null);
    setDragOverTarget(null);
    dragCounterRef.current = 0;
  };

  const handleDragOverCard = (e: React.DragEvent, sectionKey: string, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget({ sectionKey, index });
  };

  const handleDragOverSection = (e: React.DragEvent, sectionKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // If dragging over empty section or below all cards
    const section = sections.find((s) => s.key === sectionKey);
    setDragOverTarget({ sectionKey, index: section?.cards.length ?? 0 });
  };

  const handleDrop = async (e: React.DragEvent, sectionKey: string, index: number) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || dragCardId;
    if (!cardId) return;

    setDragCardId(null);
    setDragOverTarget(null);

    // Optimistic update
    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, cards: [...s.cards] }));
      // Find and remove the card from its current section
      let movedCard: CanvasCard | null = null;
      for (const s of next) {
        const idx = s.cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          movedCard = s.cards[idx];
          s.cards.splice(idx, 1);
          break;
        }
      }
      if (!movedCard) return prev;
      // Insert at new position
      const targetSection = next.find((s) => s.key === sectionKey);
      if (targetSection) {
        targetSection.cards.splice(index, 0, movedCard);
      }
      return next;
    });

    // Persist to server
    await fetch(`/api/projects/${projectId}/canvas-cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, toSection: sectionKey, toIndex: index }),
    }).catch(() => fetchCanvasCards()); // Rollback on error
  };

  const removeFromCanvas = async (cardId: string) => {
    // Optimistic update
    setSections((prev) =>
      prev.map((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }))
    );

    await fetch(`/api/projects/${projectId}/canvas-cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    }).catch(() => fetchCanvasCards());
  };

  // Accept/reject draft cards
  const handleDraftAction = async (cardId: string, action: "accept" | "reject") => {
    if (action === "accept") {
      // Optimistic: change status to confirmed
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          cards: s.cards.map((c) =>
            c.id === cardId ? { ...c, canvasStatus: "confirmed" as const } : c
          ),
        }))
      );
    } else {
      // Optimistic: remove from canvas
      setSections((prev) =>
        prev.map((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }))
      );
    }

    await fetch(`/api/cards/${cardId}/canvas-status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => fetchCanvasCards());
  };

  // Count drafts for notification
  const draftCount = sections.reduce(
    (sum, s) => sum + s.cards.filter((c) => c.canvasStatus === "draft").length, 0
  );

  const totalCards = sections.reduce((sum, s) => sum + s.cards.length, 0);

  if (loading) {
    return (
      <div className="px-6 py-8 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Widget del proyecto — SIEMPRE visible en la cabecera (antes vivía dentro
          del canvas Resumen). Última/próxima sesión, estado actual, pendientes. */}
      <ProjectGPS projectId={projectId} clientId={clientId} />

      {/* Handoff por-proyecto — sección dedicada siempre visible (estado + generar + doc). */}
      <ProjectHandoffSection projectId={projectId} clientId={clientId} />

      {/* Ciclo de vida — etapa efectiva + validaciones de salida + modalidad de adopción.
          El id es el destino de las alarmas de etapa del panel "Qué hacer acá" del cronograma:
          los gates para cerrarlas viven acá, en esta misma página. */}
      <div id="proyecto-etapa" className="scroll-mt-24">
        <ProjectLifecyclePanel projectId={projectId} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            {/* Canvas selector dropdown */}
            <div className="relative" ref={canvasDropdownRef}>
              <button
                onClick={() => setCanvasDropdownOpen(!canvasDropdownOpen)}
                className="flex items-center gap-2 text-xl font-bold text-white hover:text-gray-300 transition-colors"
              >
                {activeCanvas?.name ?? "Resumen del servicio"}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${canvasDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {canvasDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-1">
                  {canvases.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        switchCanvas(c.id);
                        setCanvasDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        c.id === activeCanvasId
                          ? "bg-brand/10 text-brand font-semibold"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isResumenCanvas && <HubBadge tags={tags} serviceType={serviceType} size="sm" />}
            {/* CTA por-canvas: ejecuta el agente primario del canvas, anclado junto al
                nombre (reemplaza el pop-up). Handoff/Cronograma tienen su propio CTA. */}
            {!isResumenCanvas && activeCanvas && CANVAS_PRIMARY_AGENT[activeCanvas.name] && (
              <CanvasAgentButton
                clientId={clientId}
                projectId={projectId}
                agentId={CANVAS_PRIMARY_AGENT[activeCanvas.name].agentId}
                label={CANVAS_PRIMARY_AGENT[activeCanvas.name].label}
                async={CANVAS_PRIMARY_AGENT[activeCanvas.name].async}
                onDone={() => { setAgentNonce((n) => n + 1); bumpGpsRefresh(); }}
              />
            )}
            {/* CTA principal del Cronograma (Generar cronograma / Chequear avance) — A LA PAR DEL
                NOMBRE, igual que el CanvasAgentButton de los demás canvases. Lo inyecta
                CronogramaCanvas por portal (conoce phases/tasks/published). */}
            {activeCanvas?.name === "Cronograma" && (
              <div ref={setCronogramaSlot} className="flex items-center gap-2" />
            )}
            {/* Aviso (nunca bloqueo): en clientes multi-proyecto, links de IA sin revisar
                pueden mezclar contexto de otro proyecto en el handoff/kickoff. */}
            {!isResumenCanvas &&
              (activeCanvas?.name === "Handoff" || activeCanvas?.name === "Kickoff") && (
                <UnreviewedSessionsChip projectId={projectId} />
              )}
          </div>
          {isResumenCanvas && (
            <p className="text-sm text-gray-400 mt-0.5">
              {totalCards > 0
                ? `${totalCards} card${totalCards !== 1 ? "s" : ""} en el canvas`
                : "Ejecuta agentes y envía resultados aquí"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Acceso del cliente externo (token + contraseña) — PROJECT-LEVEL:
              las mismas credenciales destraban todas las superficies externas
              (kickoff, cronograma), por eso vive acá y no en un canvas. */}
          <ExternalAccessButton projectId={projectId} />
          {/* Export PDF — siempre disponible (default y custom canvas) */}
          <a
            href={`/print/canvas/${clientId}/${isResumenCanvas ? "default" : (activeCanvasId ?? "default")}?print=1&projectId=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
            title="Abre una vista imprimible para guardar como PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Exportar PDF
          </a>

          {isResumenCanvas && (<>
          <button
            onClick={processSession}
            disabled={processingSession || unprocessedSessions === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
          >
            <svg className={`w-3.5 h-3.5 ${processingSession ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            {processingSession ? "Procesando..." : "Procesar sesión"}
            {unprocessedSessions > 0 && !processingSession && (
              <span className="w-4 h-4 flex items-center justify-center rounded-full bg-brand text-white text-[9px] font-bold">
                {unprocessedSessions}
              </span>
            )}
          </button>
          </>)}
        </div>
      </div>

      {/* Session processing results — default canvas only */}
      {isResumenCanvas && sessionResult && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-700">
              Sesión procesada: {sessionResult.sessionTitle}
            </p>
            <button
              onClick={() => setSessionResult(null)}
              className="text-violet-400 hover:text-violet-600 text-xs"
            >
              Cerrar
            </button>
          </div>
          <p className="text-[10px] text-violet-500">
            {sessionResult.cards.length} card{sessionResult.cards.length !== 1 ? "s" : ""} generados — usa el botón &quot;Canvas&quot; en cada card para enviarlo al canvas
          </p>
          <div className="space-y-2">
            {sessionResult.cards.map((card) => (
              <div key={card.id} className="rounded-xl border border-violet-800/30 bg-gray-900 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-white">{card.title}</h4>
                  <SendToCanvasMenu cardId={card.id} />
                </div>
                <div className="text-xs text-gray-300 leading-relaxed prose prose-xs prose-invert max-w-none">
                  <ReactMarkdown>{card.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handoff: vista lineal (lectura/curación del CSE, sin grilla) */}
      {!isResumenCanvas && activeCanvas?.name === "Handoff" && activeCanvasId && (
        <CanvasLinearView projectId={projectId} canvasId={activeCanvasId} />
      )}

      {/* Kickoff: landing (Camino C) editable in-situ por el CSE.
          El div rompe el padding del panel (px-6 py-8 space-y-6) para que las
          secciones del landing sean full-bleed dentro del scroll container. */}
      {!isResumenCanvas && activeCanvas?.name === "Kickoff" && activeCanvasId && (
        // Publicar/ocultar el kickoff vive en el pop-up "Acceso del cliente"
        // (toolbar del proyecto), junto al resto de la visibilidad por superficie.
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          {/* agentNonce remonta el landing al terminar una corrida del CTA → refetch.
              FLIP: el editor NUEVO sobre el motor LandingView (drag&drop + edición tipada)
              es el DEFAULT. El renderer VIEJO queda como escape con `?kve=old` (rollback
              puntual; el fallback tolerante del motor ya pinta la prosa markdown heredada). */}
          {searchParams.get("kve") === "old" ? (
            <KickoffLanding key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} editable />
          ) : (
            <KickoffWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          )}
        </div>
      )}

      {/* Desarrollo: requerimiento técnico editable in-situ (mismo motor que el Kickoff,
          sin staging: la vista externa lee el canvas vivo). El canvas es on-demand — solo
          aparece si el handoff detectó trabajo técnico (o se regenera con el botón). */}
      {!isResumenCanvas && activeCanvas?.name === "Desarrollo" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <DesarrolloWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} clientId={clientId} canvasId={activeCanvasId} />
        </div>
      )}

      {/* Cronograma: Gantt + editor del ProjectTimeline (fases/tareas/semanas).
          Fuente única — el Kickoff lo refleja read-only. clientId habilita el
          disparo del agente de detalle (POST /api/clients/[clientId]/analyze). */}
      {activeCanvas?.name === "Cronograma" && (
        // agentNonce remonta el canvas al terminar el CTA de avance → muestra el banner
        <CronogramaCanvas key={`cronograma-${agentNonce}`} projectId={projectId} clientId={clientId} headerSlot={cronogramaSlot} />
      )}

      {/* Resto de canvases custom: grilla de bloques (Diagnóstico, Planificación, …) */}
      {!isResumenCanvas && activeCanvas?.name !== "Handoff" && activeCanvas?.name !== "Kickoff" && activeCanvas?.name !== "Desarrollo" && activeCanvas?.name !== "Cronograma" && activeCanvasId && (
        // agentNonce remonta la grilla al terminar una corrida del CTA → refetch
        <SectionBlockList key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
      )}

      {/* ── Resumen — LEGACY / RETIRADO (código muerto) ─────────────────────
          El canvas "Resumen" se elimina vía scripts/migrate-canvas-reorg.ts, así
          que `isResumenCanvas` queda SIEMPRE en false y TODO este bloque (grilla
          masonry de cards + las effects de canvas-cards + sus handlers) queda
          MUERTO: no se renderiza ni se ejecuta. Se deja gateado para no arriesgar
          una cirugía grande en este round; la limpieza completa del subsistema de
          cards en ProjectCanvasPanel queda como FOLLOW-UP. ── */}
      {isResumenCanvas && (<>
      {/* Banner de borradores pendientes */}
      {draftCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50 text-amber-300">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            {draftCount} {draftCount === 1 ? "card nuevo" : "cards nuevos"} del agente — revisa y acepta o rechaza
          </span>
          <button
            onClick={() => {
              // Accept all drafts
              sections.forEach((s) => s.cards.forEach((c) => {
                if (c.canvasStatus === "draft") handleDraftAction(c.id, "accept");
              }));
            }}
            className="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 px-2 py-1 rounded hover:bg-amber-100"
          >
            Aceptar todos
          </button>
        </div>
      )}

      {/* Secciones — layout masonry 2 columnas */}
      <div className="columns-1 lg:columns-2 gap-4 space-y-4">
        {sections.map((section) => {
          const isCollapsed = collapsedSections.has(section.key);
          const isEmpty = section.cards.length === 0;
          const isDragTarget = dragCardId && dragOverTarget?.sectionKey === section.key;

          return (
            <div
              key={section.key}
              className={`rounded-2xl border transition-all break-inside-avoid mb-4 ${
                isDragTarget
                  ? "border-brand/40 bg-brand/5 shadow-md"
                  : isEmpty
                  ? "border-dashed border-gray-700 bg-gray-900"
                  : "border-gray-800 bg-gray-900 shadow-sm"
              }`}
              onDragOver={(e) => handleDragOverSection(e, section.key)}
              onDrop={(e) => handleDrop(e, section.key, section.cards.length)}
            >
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/50 transition-colors rounded-t-2xl"
              >
                <span className="text-base">{SECTION_ICONS[section.key] ?? "📌"}</span>
                <h3 className="text-base font-bold text-white flex-1">{section.label}</h3>
                {!isEmpty && (
                  <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                    {section.cards.length}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Section content */}
              {!isCollapsed && (
                <div className="px-5 pb-4">
                  {isEmpty && !isDragTarget ? (
                    <p className="text-sm text-gray-300 italic py-2">
                      Sin cards — ejecuta agentes y envía resultados aquí
                    </p>
                  ) : isEmpty && isDragTarget ? (
                    <div className="py-4 border-2 border-dashed border-brand/30 rounded-xl flex items-center justify-center">
                      <p className="text-sm text-brand/60">Soltar aquí</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {section.cards.map((card, idx) => {
                        const isDropTarget = dragOverTarget?.sectionKey === section.key && dragOverTarget?.index === idx;
                        return (
                          <div key={card.id}>
                            {/* Drop indicator line */}
                            {isDropTarget && dragCardId !== card.id && (
                              <div className="h-0.5 bg-brand rounded-full mx-2 mb-1" />
                            )}
                            <CanvasCardItem
                              card={card}
                              clientId={clientId}
                              isDragging={dragCardId === card.id}
                              onDragStart={(e) => handleDragStart(e, card.id)}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleDragOverCard(e, section.key, idx)}
                              onRemove={() => removeFromCanvas(card.id)}
                              onAcceptDraft={() => handleDraftAction(card.id, "accept")}
                              onRejectDraft={() => handleDraftAction(card.id, "reject")}
                              isUpdate={!!card.parentCardId && card.canvasStatus === "draft"}
                              onDiagramSave={fetchCanvasCards}
                              onTitleClick={() => {
                                setModalSectionKey(section.key);
                                setModalHighlightCardId(card.id);
                              }}
                            />
                          </div>
                        );
                      })}
                      {/* Drop target at end */}
                      {dragCardId && dragOverTarget?.sectionKey === section.key && dragOverTarget?.index === section.cards.length && (
                        <div className="h-0.5 bg-brand rounded-full mx-2 mt-1" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Section Discovery Modal */}
      {modalSectionKey && (
        <SectionDiscoveryModal
          sectionKey={modalSectionKey}
          sections={sections}
          highlightCardId={modalHighlightCardId}
          clientId={clientId}
          projectId={projectId}
          onClose={() => { setModalSectionKey(null); setModalHighlightCardId(null); }}
          onAcceptDraft={(id) => handleDraftAction(id, "accept")}
          onRejectDraft={(id) => handleDraftAction(id, "reject")}
          onRemoveCard={removeFromCanvas}
          onCardCreated={fetchCanvasCards}
          onDiagramSave={fetchCanvasCards}
        />
      )}
      </>)}
    </div>
  );
}

// ── Card item ────────────────────────────────────────────────────────────────

function CanvasCardItem({
  card,
  clientId,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onRemove,
  onAcceptDraft,
  onRejectDraft,
  isUpdate,
  onDiagramSave,
  onTitleClick,
}: {
  card: CanvasCard;
  clientId: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemove: () => void;
  onAcceptDraft?: () => void;
  onRejectDraft?: () => void;
  isUpdate?: boolean;
  onDiagramSave?: () => void;
  onTitleClick?: () => void;
}) {
  const isDraft = card.canvasStatus === "draft";
  const isUpdateDraft = isDraft && isUpdate;
  const [published, setPublished] = useState(card.publishedToClient);
  const [showPublishedEditor, setShowPublishedEditor] = useState(false);
  const [pubContent, setPubContent] = useState(card.publishedContent ?? "");
  const [savingPub, setSavingPub] = useState(false);

  const togglePublish = async () => {
    const next = !published;
    setPublished(next);
    await fetch(`/api/cards/${card.id}/publish`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: next }),
    }).catch(() => setPublished(!next));
  };

  const savePublishedContent = async () => {
    setSavingPub(true);
    await fetch(`/api/cards/${card.id}/publish`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishedContent: pubContent }),
    }).catch(() => {});
    setSavingPub(false);
    setShowPublishedEditor(false);
  };

  const DragHandle = () => (
    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
    </svg>
  );

  const PublishButton = () => (
    <button
      onClick={togglePublish}
      className={`p-1 rounded transition-colors ${
        published
          ? "text-green-500 bg-green-900/20 hover:bg-green-900/30"
          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800 opacity-0 group-hover:opacity-100"
      }`}
      title={published ? "Visible para cliente — clic para ocultar" : "Publicar para cliente"}
    >
      <svg className="w-3.5 h-3.5" fill={published ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={published ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );

  const RemoveButton = () => (
    <button
      onClick={onRemove}
      className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
      title="Quitar del canvas"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );

  const PublishedBadge = () => published ? (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 font-medium cursor-pointer hover:bg-green-100"
      onClick={() => setShowPublishedEditor(!showPublishedEditor)}
      title="Clic para editar versión del cliente"
    >
      👁 Cliente
    </span>
  ) : null;

  const PublishedContentEditor = () => published && showPublishedEditor ? (
    <div className="mt-2 p-3 rounded-lg bg-green-50 border border-green-200 space-y-2">
      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">
        Versión para el cliente
      </p>
      <textarea
        value={pubContent}
        onChange={(e) => setPubContent(e.target.value)}
        placeholder="Escribe una versión suavizada del contenido... (vacío = se usa el original)"
        rows={3}
        className="w-full px-3 py-2 text-xs bg-white border border-green-200 rounded-lg text-gray-700 focus:outline-none focus:border-green-400 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={savePublishedContent}
          disabled={savingPub}
          className="px-3 py-1 text-[10px] font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
        >
          {savingPub ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={() => setShowPublishedEditor(false)}
          className="px-3 py-1 text-[10px] font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : null;

  // FLOWCHART card
  if (card.cardType === "FLOWCHART" && card.diagramData) {
    const diagram = card.diagramData as { nodes?: unknown[]; edges?: unknown[] };
    if (diagram.nodes && diagram.edges) {
      return (
        <div
          onDragOver={onDragOver}
          className={`rounded-xl border overflow-hidden group transition-opacity ${
            isDraft ? "border-amber-700/50 border-dashed bg-amber-900/10" : published ? "border-green-700/50" : "border-gray-800"
          } ${isDragging ? "opacity-40" : ""}`}
        >
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className={`px-4 py-2 border-b flex items-center gap-2 cursor-grab active:cursor-grabbing ${isDraft ? "bg-amber-900/10 border-amber-700/30" : "bg-gray-800 border-gray-800"}`}
          >
            <DragHandle />
            <h4 className="text-sm font-semibold text-white flex-1 cursor-pointer hover:text-brand transition-colors" onClick={onTitleClick}>{card.title}</h4>
            {isDraft && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isUpdateDraft ? "text-blue-400 bg-blue-900/30" : "text-amber-400 bg-amber-900/30"}`}>{isUpdateDraft ? "UPDATE" : "BORRADOR"}</span>}
            {isDraft ? (
              <>
                <button onClick={onAcceptDraft} className="p-1 rounded text-green-500 hover:bg-green-900/30" title="Aceptar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                <button onClick={onRejectDraft} className="p-1 rounded text-red-400 hover:bg-red-900/30" title="Rechazar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </>
            ) : (
              <>
                <PublishedBadge />
                <PublishButton />
                <RemoveButton />
              </>
            )}
          </div>
          {card.content && (
            <div className="px-4 py-2 text-xs text-gray-300 leading-relaxed prose prose-xs prose-invert max-w-none border-b border-gray-800">
              <ReactMarkdown>{card.content}</ReactMarkdown>
            </div>
          )}
          <div className="h-[350px]">
            <FlowchartViewer
              data={{
                title: card.title,
                description: card.content,
                nodes: diagram.nodes as Array<{ id: string; type: string; label: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string; position?: { x: number; y: number } }>,
                edges: diagram.edges as Array<{ id?: string; source: string; target: string; label?: string; edgeType?: "yes" | "no" | "default"; sourceHandle?: string; targetHandle?: string; strokeColor?: string; dashed?: boolean }>,
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
          <PublishedContentEditor />
        </div>
      );
    }
  }

  // TEXT card
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      className={`rounded-xl border p-4 hover:border-gray-700 transition-all group cursor-grab active:cursor-grabbing ${
        isDraft ? "border-amber-700/50 border-dashed bg-amber-900/10" : published ? "border-green-700/50 bg-green-900/10" : "border-gray-800"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <DragHandle />
        <h4 className="text-sm font-semibold text-white flex-1 cursor-pointer hover:text-brand transition-colors" onClick={onTitleClick}>{card.title}</h4>
        {isDraft && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isUpdateDraft ? "text-blue-400 bg-blue-900/30" : "text-amber-400 bg-amber-900/30"}`}>{isUpdateDraft ? "UPDATE" : "BORRADOR"}</span>}
        {isDraft ? (
          <>
            <button onClick={onAcceptDraft} className="p-1 rounded text-green-500 hover:bg-green-900/30" title="Aceptar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
            <button onClick={onRejectDraft} className="p-1 rounded text-red-400 hover:bg-red-900/30" title="Rechazar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </>
        ) : (
          <>
            {card.source === "AGENT" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-900/30 text-violet-400 border border-violet-700/30 font-medium">
                Agente
              </span>
            )}
            <PublishedBadge />
            <PublishButton />
            <RemoveButton />
          </>
        )}
      </div>
      {card.content ? (
        <div className="text-sm text-gray-300 leading-relaxed prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{card.content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-gray-300 italic">Sin contenido</p>
      )}
      <PublishedContentEditor />
    </div>
  );
}
