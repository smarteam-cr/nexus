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
import KickoffWorkspace from "@/components/canvas/KickoffWorkspace";
import DesarrolloWorkspace from "@/components/canvas/DesarrolloWorkspace";
import ExploracionWorkspace from "@/components/canvas/ExploracionWorkspace";
import DiagnosticoWorkspace from "@/components/canvas/DiagnosticoWorkspace";
import PlanificacionWorkspace from "@/components/canvas/PlanificacionWorkspace";
import ImplementacionWorkspace from "@/components/canvas/ImplementacionWorkspace";
import { UnreviewedSessionsChip } from "./ProjectSessionsReview";
import CronogramaCanvas from "@/components/canvas/CronogramaCanvas";
import CanvasBoundary from "./CanvasBoundary";
import PrintDocButton from "@/components/print/PrintDocButton";
import CanvasAgentButton from "@/components/clients/CanvasAgentButton";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { slugForCanvas } from "@/lib/pieces/registry";
import { buildPieceRows, type RowState } from "@/lib/flow/dropdown-rows";
import { AVISO_DESACTUALIZADA, AVISO_DESACTUALIZADA_LARGO } from "@/lib/pieces/piece-staleness";
import { pieceReadiness } from "@/lib/flow/piece-readiness";
import { ExternalAccessButton } from "./ExternalAccessPanel";
import ProjectHandoffSection from "./ProjectHandoffSection";
import { WorkspaceSkeleton } from "./skeletons";
import ProjectLifecyclePanel from "@/components/lifecycle/ProjectLifecyclePanel";
import { useWorkspace } from "./WorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { readCanvasCache, writeCanvasCache } from "@/lib/clients/canvas-cache";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-64 rounded-xl border border-line skeleton-shimmer" /> }
);

/**
 * Canvases que tienen su PROPIO renderer más abajo (motor de landing, Gantt o vista
 * lineal). La grilla genérica `SectionBlockList` los excluye: si un canvas con renderer
 * propio no está en este set, se pinta DOS VECES — el suyo arriba y la grilla debajo.
 * Es exactamente lo que le pasó a Exploración, y por eso esto es un set y no una cadena
 * de `&&`: sumar un canvas nuevo con renderer propio obliga a mirar acá.
 *
 * Va por SLUG de pieza (lib/pieces/registry), no por nombre visible: renombrar
 * "Desarrollo" a "Requerimientos técnicos" no puede dejar un canvas pintado dos veces.
 */
const CANVAS_CON_RENDERER_PROPIO = new Set([
  "handoff",
  "kickoff",
  "tech-requirements",
  "exploration",
  "diagnosis",
  "planning",
  "implementation",
  "timeline",
]);

/** Cómo se lee de un vistazo el estado de una pieza en el desplegable. */
const ESTADO_PIEZA: Record<RowState, { glifo: string; hint: string }> = {
  generada:    { glifo: "✓", hint: "Generada" },
  vacia:       { glifo: "○", hint: "Todavía sin contenido — entrá y generala" },
  por_activar: { glifo: "+", hint: "Este proyecto todavía no la tiene" },
};

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
  /** Identidad de la pieza (lib/pieces/registry). null en canvases custom del CSE. */
  slug: string | null;
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
  /**
   * ¿Alguien escribió acá de verdad? Ojo: NO es "tiene algún bloque" — crear una pieza
   * ya siembra los bloques curados (el cierre), así que ese criterio daba "generada"
   * sobre documentos vacíos. El criterio único vive en lib/pieces/piece-content.ts y lo
   * informan tanto el listado como el seed server-side, para que el primer pintado no
   * mienta. Sigue opcional porque los canvases del Business Case no lo traen.
   */
  hasContent?: boolean;
  /** El handoff corrió después de escribirse este documento (lib/pieces/piece-staleness.ts). */
  stale?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProjectCanvasPanel({
  projectId,
  tags,
  serviceType,
  initialCanvases,
}: {
  projectId: string;
  tags?: string[];
  serviceType?: string | null;
  /** Canvases sembrados server-side (page.tsx) para el proyecto inicial. */
  initialCanvases?: CanvasMeta[] | null;
}) {
  const params = useParams();
  const clientId = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasFromUrl = searchParams.get("canvas");

  // Siembra del primer paint: props del server (carga inicial) o cache de módulo
  // (revisitas al cambiar de tab). Con siembra, el panel NO pinta el WorkspaceSkeleton
  // — antes re-fetcheaba /canvases al montar y el usuario veía el skeleton DOS veces
  // (el del loading.tsx del route y este). useState perezoso: se resuelve UNA vez por
  // montaje y nunca se re-setea (el refetch de fondo escribe `canvases` directo).
  const [seeded] = useState<CanvasMeta[] | null>(() =>
    initialCanvases && initialCanvases.length > 0
      ? initialCanvases
      : (readCanvasCache<CanvasMeta[]>(projectId)?.data ?? null),
  );

  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [loading, setLoading] = useState(!seeded);
  /** ¿Ya volvió la consulta de la lista de canvases? (con éxito o con error). Es lo que
   *  destraba el esqueleto — no que la lista traiga algo. */
  const [listLoaded, setListLoaded] = useState(!!seeded);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ sectionKey: string; index: number } | null>(null);
  const dragCounterRef = useRef(0);
  const [modalSectionKey, setModalSectionKey] = useState<string | null>(null);
  const [modalHighlightCardId, setModalHighlightCardId] = useState<string | null>(null);
  const [processingSession, setProcessingSession] = useState(false);
  const [sessionResult, setSessionResult] = useState<{ cards: CanvasCard[]; sessionTitle: string } | null>(null);
  const [unprocessedSessions, setUnprocessedSessions] = useState(0);

  // Multi-canvas state (sembrado si hay seed; el refetch de fondo revalida igual)
  const [canvases, setCanvases] = useState<CanvasMeta[]>(seeded ?? []);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(() => {
    if (!seeded) return null;
    const fromUrl = canvasFromUrl ? seeded.find((c) => c.id === canvasFromUrl) : null;
    return (fromUrl ?? seeded[0])?.id ?? null;
  });
  // Se incrementa al terminar una corrida de agente desde el CTA → remonta el canvas
  // activo (key) para que muestre los bloques nuevos sin recargar la página.
  const [agentNonce, setAgentNonce] = useState(0);
  // Para refrescar el widget del proyecto (ProjectGPS + pills de setup) al generar un canvas.
  const { bumpGpsRefresh, canvasRefreshSignal } = useWorkspace();
  const toast = useToast();
  const [canvasDropdownOpen, setCanvasDropdownOpen] = useState(false);
  const [addingSectionName, setAddingSectionName] = useState<string | null>(null);
  const canvasDropdownRef = useRef<HTMLDivElement>(null);
  /* Slot en el header para los CTAs de un canvas que necesita ESTADO PROPIO para decidir
     qué botón mostrar. El canvas los renderiza acá por portal y quedan junto al nombre, en
     el mismo lugar que el `CanvasAgentButton` que este panel monta para los demás.
     Existe porque `CANVAS_PRIMARY_AGENT` solo alcanza para un botón fijo: el Cronograma
     alterna entre "Generar cronograma" y "Chequear avance" según tenga tareas, y Desarrollo
     necesita saber si la auto-generación posterior al handoff sigue en curso para no
     disparar dos veces. Era exclusivo del Cronograma; dejarlo así obligó a Desarrollo a
     armarse una segunda barra debajo del nombre, que es el defecto que esto corrige. */
  const [canvasHeaderSlot, setCanvasHeaderSlot] = useState<HTMLDivElement | null>(null);

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId) ?? canvases.find((c) => c.isDefault) ?? canvases[0] ?? null;
  // El render se ramifica por NOMBRE, no por isDefault (Handoff es el "home" pero
  // NO es el canvas de cards). isResumenCanvas gobierna solo la UI legacy del Resumen
  // (cards + GPS), que se retira en la fase final.
  const isResumenCanvas = activeCanvas?.name === "Resumen";
  // Identidad de la PIEZA activa. `slugForCanvas` cae al nombre visible solo si el
  // canvas todavía no tiene slug (canvas viejo sin backfillear): así el renderer no
  // depende del rótulo, que es justo lo que se va a renombrar.
  const activeSlug = activeCanvas ? slugForCanvas(activeCanvas) : null;
  // Las filas del desplegable salen del FLUJO (lib/flow), no de la lista de canvases.
  const pieceRows = buildPieceRows(canvases);
  // Qué piezas ya tienen algo escrito — lo mira `pieceReadiness` para avisar cuando a una
  // pieza le faltan sus pasos previos.
  const piezasConContenido = pieceRows.filter((r) => r.state === "generada").map((r) => r.slug);
  // Update URL when canvas changes (no page reload)
  const switchCanvas = useCallback((canvasId: string) => {
    // Clickear el canvas que YA está activo colgaba la pantalla: `setActiveCanvasId`
    // hace bail-out con el mismo valor, pero `setLoading(true)` sí re-renderiza, y el
    // efecto que apaga el loading no vuelve a correr porque ninguna de sus deps cambió
    // → esqueleto hasta desmontar. El dropdown no filtra el activo, así que es un click
    // a un dedo de distancia.
    if (canvasId === activeCanvasId) return;
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
  }, [canvases, router, activeCanvasId]);

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
      .catch(() => {})
      // Pase lo que pase, la consulta terminó. Antes el loading colgaba de
      // `canvases.length > 0`: con la lista vacía —o con este `.catch` comiéndose un
      // error de red— la pantalla quedaba en esqueleto PARA SIEMPRE, sin timeout y sin
      // forma de recuperarse. Y a partir de F2 la lista puede quedar vacía a propósito.
      .finally(() => setListLoaded(true));
  }, [projectId]);

  const [activando, setActivando] = useState<string | null>(null);

  /**
   * Activar una pieza desde el `+`. Crea el documento VACÍO y lleva ahí: generar es un
   * segundo clic a propósito — disparar un agente sin que nadie lo pida gasta tokens y,
   * sobre una pieza que ya tuviera contenido, lo pisaría.
   */
  const activarPieza = useCallback(async (slug: string) => {
    setActivando(slug);
    try {
      const res = await fetch(`/api/projects/${projectId}/pieces/${slug}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "No se pudo activar la pieza.");
        return;
      }
      await refetchCanvases();
      switchCanvas(data.canvasId);
      setCanvasDropdownOpen(false);
      if (data.outcome === "reactivada") {
        toast.info(`${data.label} vuelve a estar activa — su contenido sigue ahí.`);
      }
    } catch {
      toast.error("No se pudo activar la pieza.");
    } finally {
      setActivando(null);
    }
  }, [projectId, refetchCanvases, switchCanvas, toast]);

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
      .catch(() => {})
      // Pase lo que pase, la consulta terminó. Antes el loading colgaba de
      // `canvases.length > 0`: con la lista vacía —o con este `.catch` comiéndose un
      // error de red— la pantalla quedaba en esqueleto PARA SIEMPRE, sin timeout y sin
      // forma de recuperarse. Y a partir de F2 la lista puede quedar vacía a propósito.
      .finally(() => setListLoaded(true));
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

  useEffect(() => {
    if (!listLoaded) return;
    if (isResumenCanvas) fetchCanvasCards();
    else setLoading(false);
  }, [fetchCanvasCards, listLoaded, isResumenCanvas]);

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

  // La MISMA pieza que pinta app/(shell)/clients/[id]/loading.tsx: el RSC y este gate
  // client-side se ven uno tras otro, así que tienen que hablar el mismo vocabulario.
  if (loading) return <WorkspaceSkeleton />;

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
                {activeCanvas?.name ?? (canvases.length === 0 ? "Sin piezas" : "Resumen del servicio")}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${canvasDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {canvasDropdownOpen && (
                /* El desplegable es el MAPA DEL FLUJO, no la lista de lo que existe: las
                   7 piezas del recorrido, tenga el proyecto las que tenga. Cada fila:
                   estado (dot) · nombre · aviso si no aplica (texto visible, no un hover)
                   · CTA a la derecha con jerarquía — Generar sólido (la acción natural
                   siguiente), Regenerar y Activar fantasma (pisan trabajo o son
                   secundarias). Fila = contenedor + DOS botones: anidar botones es HTML
                   inválido y el click del CTA burbujearía hasta cambiar de canvas. */
                <div className="absolute left-0 top-full mt-1.5 z-50 w-96 bg-surface border border-line rounded-2xl shadow-2xl p-1.5">
                  {pieceRows.map((row) => {
                    const activa = row.canvasId !== null && row.canvasId === activeCanvasId;
                    // ¿Esta pieza le corresponde a este proyecto, y están sus pasos
                    // previos? Nunca bloquea: informa. (lib/flow/piece-readiness)
                    const readiness = pieceReadiness(row.slug, {
                      tags: tags ?? [],
                      piezasConContenido,
                    });
                    return (
                      <div
                        key={row.slug}
                        className={`group flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl transition-colors ${
                          activa ? "bg-brand/10" : "hover:bg-surface-hover"
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (!row.canvasId) {
                              void activarPieza(row.slug);
                              return;
                            }
                            switchCanvas(row.canvasId);
                            setCanvasDropdownOpen(false);
                          }}
                          disabled={activando !== null}
                          className="flex-1 min-w-0 flex items-center gap-2.5 text-left disabled:opacity-60"
                          title={ESTADO_PIEZA[row.state].hint}
                        >
                          {/* Estado como dot: verde generada · ámbar vacía · hueco por activar. */}
                          <span aria-hidden className="w-2 shrink-0 flex justify-center">
                            {activando === row.slug ? (
                              <span className="w-2 h-2 rounded-full border border-brand border-t-transparent animate-spin" />
                            ) : (
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  row.state === "generada"
                                    ? "bg-emerald-400"
                                    : row.state === "vacia"
                                      ? "bg-amber-400"
                                      : "border border-line"
                                }`}
                              />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm ${
                                activa
                                  ? "text-brand font-semibold"
                                  : row.canvasId
                                    ? "text-fg"
                                    : "text-fg-muted"
                              }`}
                            >
                              {row.label}
                            </span>
                            {/* El aviso COMPRIMIDO y legible ("Sin tag X" / "Antes: Y").
                                La frase completa no cabe en una fila y truncarla la
                                volvía ilegible — vive en el tooltip. */}
                            {readiness.shortReason && (
                              <span
                                className="block text-xs leading-snug text-amber-600"
                                title={readiness.reason ?? undefined}
                              >
                                {readiness.shortReason}
                              </span>
                            )}
                            {/* El handoff corrió después de escribirse el documento. El
                                encadenado ya NO lo reescribe solo (borraba ediciones a
                                mano), así que sin este renglón el único rastro era un log
                                del servidor y el CSE creía que estaba al día. */}
                            {row.stale && !readiness.shortReason && (
                              <span
                                className="block text-xs leading-snug text-amber-600"
                                title={AVISO_DESACTUALIZADA_LARGO}
                              >
                                {AVISO_DESACTUALIZADA}
                              </span>
                            )}
                          </span>
                        </button>
                        {row.agent && row.canvasId ? (
                          <CanvasAgentButton
                            clientId={clientId}
                            projectId={projectId}
                            agentId={row.agent.agentId}
                            label={row.state === "generada" ? "Regenerar" : "Generar"}
                            async={row.agent.async}
                            appearance={row.state === "generada" ? "ghost" : "primary"}
                            className="shrink-0"
                            onDone={() => {
                              setAgentNonce((n) => n + 1);
                              bumpGpsRefresh();
                              void refetchCanvases();
                            }}
                          />
                        ) : !row.canvasId ? (
                          <button
                            onClick={() => void activarPieza(row.slug)}
                            disabled={activando !== null}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-fg-muted border border-line hover:text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
                          >
                            {activando === row.slug ? "Activando…" : "Activar"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {isResumenCanvas && <HubBadge tags={tags} serviceType={serviceType} size="sm" />}
            {/* CTA por-canvas: ejecuta el agente primario del canvas, anclado junto al
                nombre (reemplaza el pop-up). Handoff/Cronograma tienen su propio CTA. */}
            {!isResumenCanvas && activeCanvas && CANVAS_PRIMARY_AGENT[activeSlug ?? ""] && (
              <CanvasAgentButton
                clientId={clientId}
                projectId={projectId}
                agentId={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].agentId}
                label={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].label}
                async={CANVAS_PRIMARY_AGENT[activeSlug ?? ""].async}
                /* Mismo cierre que el CTA de la fila del desplegable, incluido el refetch:
                   sin él, generar desde acá dejaba la fila en ámbar con "Generar" y las
                   piezas siguientes avisando "Antes: …" sobre algo que ya estaba hecho.
                   El documento se veía bien y el mapa del flujo mentía hasta recargar. */
                onDone={() => {
                  setAgentNonce((n) => n + 1);
                  bumpGpsRefresh();
                  void refetchCanvases();
                }}
              />
            )}
            {/* CTAs de los canvas que se los inyectan por portal (Cronograma y Desarrollo) —
                A LA PAR DEL NOMBRE, en el mismo lugar que el CanvasAgentButton de los demás. */}
            {(activeSlug === "timeline" || activeSlug === "tech-requirements") && (
              <div ref={setCanvasHeaderSlot} className="flex items-center gap-2" />
            )}
            {/* Aviso (nunca bloqueo): en clientes multi-proyecto, links de IA sin revisar
                pueden mezclar contexto de otro proyecto en el handoff/kickoff. */}
            {!isResumenCanvas &&
              (activeSlug === "handoff" || activeSlug === "kickoff") && (
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
          {/* Export PDF. Qué camino toma lo decide el REGISTRO de impresión leyendo la
              pieza del canvas activo, no un `if` acá: las piezas del motor bajan el PDF con
              el diseño del documento, y todo lo demás —Resumen, handoff, cronograma, los
              canvas a medida— sigue con la vista imprimible de siempre. */}
          <PrintDocButton
            projectId={projectId}
            activeSlug={isResumenCanvas ? null : (activeSlug ?? null)}
            canvasHref={`/print/canvas/${clientId}/${isResumenCanvas ? "default" : (activeCanvasId ?? "default")}?print=1&projectId=${projectId}`}
          />

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
      {!isResumenCanvas && activeSlug === "handoff" && activeCanvasId && (
        <CanvasBoundary label="el Handoff">
          <CanvasLinearView projectId={projectId} canvasId={activeCanvasId} />
        </CanvasBoundary>
      )}

      {/* Kickoff: landing (Camino C) editable in-situ por el CSE.
          El div rompe el padding del panel (px-6 py-8 space-y-6) para que las
          secciones del landing sean full-bleed dentro del scroll container. */}
      {!isResumenCanvas && activeSlug === "kickoff" && activeCanvasId && (
        // Publicar/ocultar el kickoff vive en el pop-up "Acceso del cliente"
        // (toolbar del proyecto), junto al resto de la visibilidad por superficie.
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          {/* agentNonce remonta el landing al terminar una corrida del CTA → refetch.
              Editor sobre el motor LandingView (drag&drop + edición tipada); el fallback
              tolerante del motor pinta la prosa markdown heredada. El renderer viejo
              (KickoffLanding) y su escape `?kve=old` se borraron en la Ola 4 del plan
              de puestos — rollback de esa ola = git revert. */}
          <CanvasBoundary label="el Kickoff">
            <KickoffWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Desarrollo: requerimiento técnico editable in-situ (mismo motor que el Kickoff,
          sin staging: la vista externa lee el canvas vivo). El canvas es on-demand — solo
          aparece si el handoff detectó trabajo técnico (o se regenera con el botón). */}
      {!isResumenCanvas && activeSlug === "tech-requirements" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el canvas de Desarrollo">
            <DesarrolloWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} clientId={clientId} canvasId={activeCanvasId} headerSlot={canvasHeaderSlot} />
          </CanvasBoundary>
        </div>
      )}

      {/* Exploración: guía INTERNA de descubrimiento del negocio (mismo motor, paleta gris).
          Canvas de primera clase como Kickoff: vive en el dropdown y su agente se dispara
          desde el header (CANVAS_PRIMARY_AGENT). NO tiene vista externa ni publicación. */}
      {/* Implementación: la guía de construcción del CSE (motor de landings, interna).
          El margen negativo es OBLIGATORIO en todo canvas del motor: anula el px-6 py-8
          del panel para que las bandas de sección lleguen a los bordes. Sin él, el hero
          y el cierre —que llevan fondo propio— quedan recortados con calles a los lados. */}
      {!isResumenCanvas && activeSlug === "implementation" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="la implementación">
            <ImplementacionWorkspace key={`implementacion-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Planificación: el plan que aprueba el cliente (motor de landings, interno). */}
      {!isResumenCanvas && activeSlug === "planning" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="la planificación">
            <PlanificacionWorkspace key={`planificacion-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Diagnóstico: informe de rendimiento para el cliente (motor de landings). Es el
          que más lo necesita: se proyecta en la sesión con el cliente. */}
      {!isResumenCanvas && activeSlug === "diagnosis" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el diagnóstico">
            <DiagnosticoWorkspace key={`diagnostico-${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {!isResumenCanvas && activeSlug === "exploration" && activeCanvasId && (
        <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
          <CanvasBoundary label="el canvas de Exploración">
            <ExploracionWorkspace key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
          </CanvasBoundary>
        </div>
      )}

      {/* Cronograma: Gantt + editor del ProjectTimeline (fases/tareas/semanas).
          Fuente única — el Kickoff lo refleja read-only. clientId habilita el
          disparo del agente de detalle (POST /api/clients/[clientId]/analyze). */}
      {activeSlug === "timeline" && (
        // agentNonce remonta el canvas al terminar el CTA de avance → muestra el banner
        <CanvasBoundary label="el Cronograma">
          <CronogramaCanvas key={`cronograma-${agentNonce}`} projectId={projectId} clientId={clientId} headerSlot={canvasHeaderSlot} />
        </CanvasBoundary>
      )}

      {/* Resto de canvases custom: grilla de bloques (Diagnóstico, Planificación, …).
          Los que tienen renderer PROPIO se excluyen por `CANVAS_CON_RENDERER_PROPIO`:
          si uno falta ahí, su canvas se pinta DOS veces (el motor arriba y esta grilla
          abajo). Pasó con Exploración — por eso es un set con nombre y no otra `&&`. */}
      {!isResumenCanvas && !CANVAS_CON_RENDERER_PROPIO.has(activeSlug ?? "") && activeCanvasId && (
        // agentNonce remonta la grilla al terminar una corrida del CTA → refetch
        <CanvasBoundary label="este canvas">
          <SectionBlockList key={`${activeCanvasId}-${agentNonce}`} projectId={projectId} canvasId={activeCanvasId} />
        </CanvasBoundary>
      )}

      {/* Sin ninguna pieza activa. Antes este caso no existía en la UI: la pantalla se
          quedaba en esqueleto para siempre (el loading colgaba de que la lista trajera
          algo). Ahora es un estado con nombre — y a partir del interruptor de piezas
          puede darse a propósito, no solo por un error. */}
      {canvases.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm font-medium text-fg">Este proyecto no tiene piezas activas.</p>
          <p className="mt-1 text-sm text-fg-muted">
            El handoff y el cronograma siguen arriba. Para trabajar el contenido del proyecto,
            activá una pieza.
          </p>
        </div>
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
