"use client";

import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  MarkerType,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getLayoutedElements, getNodeDims, computeIntegrationLabelPositions } from "@/lib/flowchart/layout";
import {
  StartEndNode,
  ProcessNode,
  DecisionNode,
  PainNode,
  AnnotationNode,
  TextNode,
  InfoNode,
} from "./nodes";
import {
  PipelineTitleNode,
  ColumnBackgroundNode,
  PipelineStageNode,
  TriggerNode,
  ActionNode,
  FollowUpNode,
  OutcomePositiveNode,
  OutcomeNegativeNode,
  LifecycleChangeNode,
  LeadStatusNode,
} from "./pipeline-nodes";
import { SystemNode } from "./integration-nodes";
import { DataFlowEdge, SelectableSmoothStepEdge } from "./integration-edges";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface FlowchartData {
  title?: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    sublabel?: string;
    owner?: string;
    detail?: string;
    icon?: string;
    pipelineName?: string;
    systemColor?: string;
    // Tamaño de fuente de nodos redimensionables por texto (TextNode/PipelineTitleNode) —
    // sin esto, el resize solo vivía en estado LOCAL del componente: se perdía al recargar
    // y, sobre todo, al duplicar (la copia nace con un componente nuevo → vuelve al default).
    fontSize?: number;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    label?: string;
    edgeType?: "yes" | "no" | "default";
    sourceHandle?: string;
    targetHandle?: string;
    strokeColor?: string;
    dashed?: boolean;
    // Integración (dataflow): posición MANUAL relativa de la etiqueta + semántica de flujo.
    labelT?: number;         // 0..1 a lo largo de la curva (manual)
    labelSide?: -1 | 0 | 1;  // lado imantado (manual)
    direction?: "to" | "bidir";
    syncType?: "realtime" | "batch" | "manual";
    pending?: boolean;       // "[Por confirmar]"
  }>;
}

// Snapshot completo del estado para undo/redo (nodos + aristas)
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

const NODE_TYPES = {
  // Clásicos
  start:              StartEndNode,
  end:                StartEndNode,
  process:            ProcessNode,
  decision:           DecisionNode,
  pain:               PainNode,
  annotation:         AnnotationNode,
  text:               TextNode,
  info:               InfoNode,
  // Pipeline
  pipeline_title:     PipelineTitleNode,
  column_background:  ColumnBackgroundNode,
  pipeline_stage:     PipelineStageNode,
  trigger:            TriggerNode,
  action:             ActionNode,
  follow_up:          FollowUpNode,
  outcome_positive:   OutcomePositiveNode,
  outcome_negative:   OutcomeNegativeNode,
  lifecycle_change:   LifecycleChangeNode,
  lead_status:        LeadStatusNode,
  // Integración (mapa de sistemas)
  system:             SystemNode,
};

const EDGE_TYPES = {
  // Etiqueta de flujo de datos: caja opaca compacta multilínea + arrastrable.
  dataflow: DataFlowEdge,
  // Clásicos/pipeline: sobrescribe el "smoothstep" built-in para que la selección
  // (azul) se vea en la línea — el `style` inline que arma buildGraph no reacciona
  // por sí solo a `selected`.
  smoothstep: SelectableSmoothStepEdge,
};

// ── Toolbar items (agrupados por categoría) ─────────────────────────────────

interface ToolbarItem {
  type: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
}

// Catálogo plano de tipos de nodo que se pueden AGREGAR a mano. Recortado a lo esencial:
// los tipos que solo genera el agente (follow_up, lifecycle_change, lead_status, end) siguen
// renderizando y persistiendo (NODE_TYPES/getCurrentData intactos), pero no se ofrecen acá.
const TOOLBAR_ITEMS: Record<string, ToolbarItem> = {
  start:            { type: "start",            label: "Inicio",    icon: "▶", color: "text-gray-600",   bg: "bg-gray-100 hover:bg-gray-200 border-gray-200" },
  process:          { type: "process",          label: "Proceso",   icon: "□", color: "text-blue-600",   bg: "bg-blue-50 hover:bg-blue-100 border-blue-200" },
  decision:         { type: "decision",         label: "Decisión",  icon: "◇", color: "text-violet-600", bg: "bg-violet-50 hover:bg-violet-100 border-violet-200" },
  pain:             { type: "pain",             label: "Dolor",     icon: "⚠", color: "text-red-600",    bg: "bg-red-50 hover:bg-red-100 border-red-200" },
  annotation:       { type: "annotation",       label: "Nota",      icon: "📝", color: "text-amber-600",  bg: "bg-amber-50 hover:bg-amber-100 border-amber-200" },
  info:             { type: "info",             label: "Resumen",   icon: "📄", color: "text-slate-600",  bg: "bg-slate-50 hover:bg-slate-100 border-slate-200" },
  system:           { type: "system",           label: "Sistema",   icon: "▦", color: "text-slate-600",  bg: "bg-slate-50 hover:bg-slate-100 border-slate-200" },
  pipeline_stage:   { type: "pipeline_stage",   label: "Etapa",     icon: "📋", color: "text-green-700",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
  trigger:          { type: "trigger",          label: "Trigger",   icon: "⚡", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
  action:           { type: "action",           label: "Acción",    icon: "⚙", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
  outcome_positive: { type: "outcome_positive", label: "Avanza",    icon: "✅", color: "text-indigo-600", bg: "bg-indigo-50 hover:bg-indigo-100 border-indigo-200" },
  outcome_negative: { type: "outcome_negative", label: "No avanza", icon: "❌", color: "text-red-600",    bg: "bg-red-50 hover:bg-red-100 border-red-200" },
};

// Grupos ofrecidos según el tipo de diagrama — justo lo necesario, sin mezclar vocabularios
// (integración: 3 · clásico: 5 · pipeline: 8).
const GROUPS_BY_KIND: Record<"integration" | "pipeline" | "classic", { title: string; types: string[] }[]> = {
  integration: [
    { title: "Sistemas",  types: ["system"] },
    { title: "Hallazgos", types: ["pain", "annotation", "info"] },
  ],
  pipeline: [
    { title: "Pipeline",   types: ["pipeline_stage", "trigger", "action", "decision"] },
    { title: "Resultados", types: ["outcome_positive", "outcome_negative"] },
    { title: "Hallazgos",  types: ["pain", "annotation", "info"] },
  ],
  classic: [
    { title: "Flujo",     types: ["start", "process", "decision"] },
    { title: "Hallazgos", types: ["pain", "annotation", "info"] },
  ],
};

const DEFAULT_LABELS: Record<string, string> = {
  start: "Inicio", end: "Fin", process: "Nuevo proceso",
  decision: "¿Decisión?", pain: "Punto de dolor", annotation: "Nota",
  text: "Texto", pipeline_stage: "Nueva etapa", trigger: "Trigger", action: "Acción",
  follow_up: "Seguimiento", outcome_positive: "Avanza", outcome_negative: "No avanza",
  lifecycle_change: "Cambio lifecycle", lead_status: "Estado del lead",
  system: "Nuevo sistema", info: "Resumen del proceso",
};

// ── Componente interno (dentro del Provider) ──────────────────────────────────

// ── Toolbar lateral (estilo Miro) ─────────────────────────────────────────────

function ToolbarSidebar({
  activeTool,
  setActiveTool,
  nodePopupOpen,
  setNodePopupOpen,
  addNode,
  diagramKind,
}: {
  activeTool: "pointer" | "text" | "note" | "add";
  setActiveTool: (tool: "pointer" | "text" | "note" | "add") => void;
  nodePopupOpen: boolean;
  setNodePopupOpen: (open: boolean) => void;
  addNode: (type: string) => void;
  diagramKind: "integration" | "pipeline" | "classic";
}) {
  // Ofrecer solo los tipos de nodo coherentes con el diagrama (no mezclar system con pipeline).
  const visibleGroups = (GROUPS_BY_KIND[diagramKind] ?? GROUPS_BY_KIND.classic)
    .map((g) => ({ title: g.title, items: g.types.map((t) => TOOLBAR_ITEMS[t]).filter(Boolean) }));
  const tools: { id: "pointer" | "text" | "note" | "add"; icon: React.ReactNode; label: string }[] = [
    {
      id: "pointer",
      label: "Seleccionar",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.5 2l12.894 12.894-4.553 1.1 2.236 5.59-2.68 1.073-2.236-5.59-3.76 3.032L4.5 2z" />
        </svg>
      ),
    },
    {
      id: "text",
      label: "Texto libre — clic para agregar",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 4h14a1 1 0 011 1v2a1 1 0 01-2 0V6H13v12h2a1 1 0 010 2H9a1 1 0 010-2h2V6H6v1a1 1 0 01-2 0V5a1 1 0 011-1z" />
        </svg>
      ),
    },
    {
      id: "note",
      label: "Nota — clic para agregar",
      icon: (
        // Nota adhesiva con esquina doblada
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 4a1 1 0 011-1h14a1 1 0 011 1v10l-6 6H5a1 1 0 01-1-1V4z" />
          <path d="M14 20v-5a1 1 0 011-1h5" fill="none" stroke="white" strokeWidth={1.6} />
        </svg>
      ),
    },
    {
      id: "add",
      label: "Agregar nodo",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" stroke="white" strokeWidth={2} strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-3 z-20">
      <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg p-1 flex flex-col gap-0.5">
        {tools.map((tool) => (
          <div key={tool.id} className="relative">
            <button
              onClick={() => {
                if (tool.id === "add") {
                  setNodePopupOpen(!nodePopupOpen);
                  setActiveTool("add");
                } else if (tool.id === "text") {
                  addNode("text");
                  setActiveTool("pointer");
                  setNodePopupOpen(false);
                } else if (tool.id === "note") {
                  addNode("annotation");
                  setActiveTool("pointer");
                  setNodePopupOpen(false);
                } else {
                  setActiveTool(tool.id);
                  setNodePopupOpen(false);
                }
              }}
              title={tool.label}
              className={`p-2.5 rounded-lg transition-all ${
                activeTool === tool.id
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {tool.icon}
            </button>

            {/* Node type popup */}
            {tool.id === "add" && nodePopupOpen && (
              <div className="absolute left-full top-0 ml-2 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-[180px] max-h-[400px] overflow-y-auto">
                {visibleGroups.map((group) => (
                  <div key={group.title} className="mb-1.5">
                    <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider px-2">{group.title}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.type}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/reactflow-type", item.type);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => {
                            addNode(item.type as FlowchartData["nodes"][0]["type"]);
                            setNodePopupOpen(false);
                            setActiveTool("pointer");
                          }}
                          title={`Agregar: ${item.label} (clic o arrastrá al lienzo)`}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-grab active:cursor-grabbing ${item.bg}`}
                        >
                          <span>{item.icon}</span>
                          <span className={item.color}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="mt-1 pt-1.5 border-t border-gray-100 px-2 pb-0.5 text-[9px] leading-snug text-gray-400">
                  Clic: agrega al centro · Arrastrá al lienzo para ubicarlo
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowchartInner({
  data,
  onSave,
}: {
  data: FlowchartData;
  onSave?: (updated: FlowchartData) => Promise<void>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  // Clave por CONTENIDO (no por referencia): quien nos monta (p.ej. `FlowchartBlockView` en
  // BlockRenderer.tsx) arma el objeto `data` inline en cada render, así que cualquier re-render
  // suyo ajeno a este diagrama (p.ej. el que dispara el propio Guardar) nos manda una referencia
  // NUEVA con el mismo contenido. Sin esto, `buildGraph` la tomaba como "cambió" y reconstruía
  // nodos/edges desde cero → React Flow los vuelve a medir → dispara cambios de tipo "dimensions"
  // → el wrapper de onNodesChange los toma por un resize real y reabre "Guardar" solo.
  const dataKey = useMemo(() => JSON.stringify(data), [data]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // NO se infiere "dirty" de eventos genéricos de tipo "dimensions": React Flow los dispara
  // por CUALQUIER re-medición (selección que muestra el NodeResizer, un rebuild de buildGraph,
  // etc.), no solo por un resize real del usuario — eso reabría "Guardar" solo sin ningún
  // cambio real (bug reportado: reaparecía tras arrastrar+guardar, o tras editar+guardar).
  // El resize real de TextNode YA marca dirty explícito al soltar (`onResize`/`makeOnResizeFor`
  // → data.onResize), y el de PipelineTitleNode ni siquiera se persiste (nodo sintético
  // excluido de getCurrentData) — no hay ningún resize legítimo que dependiera de este tracking.
  const [edges, setEdges, rawOnEdgesChange] = useEdgesState<Edge>([]);
  const onEdgesChange = useCallback((changes: Parameters<typeof rawOnEdgesChange>[0]) => {
    rawOnEdgesChange(changes);
    if (changes.some((c: { type: string }) => c.type === "remove")) {
      setIsDirty(true);
    }
  }, [rawOnEdgesChange]);
  // Orientación default del auto-layout inicial (diagramas nuevos sin posiciones guardadas
  // todavía) — ya no es toggleable desde la UI (se quitó el botón de auto-alinear).
  const direction: "TB" | "LR" = "LR";
  const [isDirty, setIsDirty]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<"pointer" | "text" | "note" | "add">("pointer");
  const [nodePopupOpen, setNodePopupOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeEditId, setEdgeEditId] = useState<string | null>(null);
  const [edgeEditLabel, setEdgeEditLabel] = useState("");
  const [edgeEditPos, setEdgeEditPos] = useState<{ x: number; y: number } | null>(null);
  const [canUndo, setCanUndo]   = useState(false);
  const [canRedo, setCanRedo]   = useState(false);

  const rfInstance     = useRef<ReactFlowInstance | null>(null);
  const pendingFitView = useRef(false);

  // Refs para acceso síncrono al estado sin stale closures
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  // Resetear historial al cambiar el diagrama (nueva ejecución / datos distintos)
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setIsDirty(false);
  }, [dataKey]);

  // Captura el estado completo ANTES de un cambio
  const captureSnapshot = useCallback((): HistoryEntry => ({
    nodes: nodesRef.current,
    edges: edgesRef.current,
  }), []);

  const applySnapshot = useCallback((entry: HistoryEntry) => {
    setNodes(entry.nodes);
    setEdges(entry.edges);
  }, [setNodes, setEdges]);

  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(captureSnapshot());
    applySnapshot(entry);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    if (undoStack.current.length === 0) setIsDirty(false);
  }, [captureSnapshot, applySnapshot]);

  const handleRedo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(captureSnapshot());
    applySnapshot(entry);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    setIsDirty(true);
  }, [captureSnapshot, applySnapshot]);

  // ── Duplicar (Ctrl+C / Ctrl+V) ─────────────────────────────────────────────
  // Portapapeles INTERNO del diagrama (un ref, no la Clipboard API del navegador):
  // alcanza para "duplicar" dentro del mismo diagrama —lo que se pidió— y evita permisos/
  // async de la Clipboard API real. Los handlers de edición (onLabelChange/onLabelCommit/
  // onLabelPos) quedan atados al ID del nodo/edge en el momento de crearlos (mismo patrón
  // que `buildGraph`/`addNode`), así que no se pueden copiar tal cual del original — se
  // regeneran acá, atados a los IDs NUEVOS, factorizados aparte para no tocar `buildGraph`
  // (que ya evita a propósito depender de estos closures para no re-crearse en loop).
  const makeOnLabelChangeFor = useCallback(
    (nodeId: string) =>
      (field: "label" | "sublabel" | "owner" | "detail", value: string) => {
        undoStack.current.push(captureSnapshot());
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
        setIsDirty(true);
        setNodes((nds) => nds.map((nd) => (nd.id === nodeId ? { ...nd, data: { ...nd.data, [field]: value } } : nd)));
      },
    [captureSnapshot, setNodes]
  );

  const makeOnEdgeLabelChangeFor = useCallback(
    (edgeId: string) =>
      (value: string) => {
        undoStack.current.push(captureSnapshot());
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
        setIsDirty(true);
        setEdges((eds) => eds.map((ed) => (ed.id === edgeId ? { ...ed, label: value.trim() || undefined } : ed)));
      },
    [captureSnapshot, setEdges]
  );

  const makeOnEdgeLabelPosFor = useCallback(
    (edgeId: string) =>
      (t: number, side: number) => {
        undoStack.current.push(captureSnapshot());
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
        setIsDirty(true);
        setEdges((eds) =>
          eds.map((ed) => (ed.id === edgeId ? { ...ed, data: { ...(ed.data as object), labelT: t, labelSide: side } } : ed))
        );
      },
    [captureSnapshot, setEdges]
  );

  // Commit del tamaño de fuente (TextNode) — espejo de `makeOnResize` dentro de buildGraph;
  // acá también para nodos creados/duplicados en caliente (addNode/handlePaste), que no
  // pasan por buildGraph. Sin undo (mismo criterio que el resize de ancho/alto, que tampoco
  // empuja: son cambios de "dimensions" que React Flow aplica directo).
  const makeOnResizeFor = useCallback(
    (nodeId: string) =>
      (fontSize: number) => {
        setIsDirty(true);
        setNodes((nds) => nds.map((nd) => (nd.id === nodeId ? { ...nd, data: { ...nd.data, fontSize } } : nd)));
      },
    [setNodes]
  );

  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const pasteCountRef = useRef(0);
  const PASTE_OFFSET = 40;

  // Copiar la selección vigente (nodos + los edges ENTRE nodos copiados — un edge hacia
  // un nodo que quedó afuera de la selección no se copia, como en Miro/Figma). Excluye los
  // sintéticos (__pipeline_title/__bg_col_*, no seleccionables por el usuario de verdad).
  const handleCopy = useCallback(() => {
    const selectedNodes = nodesRef.current.filter((n) => n.selected && !n.id.startsWith("__"));
    if (selectedNodes.length === 0) return;
    const ids = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edgesRef.current.filter((e) => ids.has(e.source) && ids.has(e.target));
    clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
    pasteCountRef.current = 0;
  }, []);

  // Pegar = duplicar lo copiado con IDs nuevos + offset en cascada (cada Ctrl+V corre un
  // poco más — como Miro/Figma; se resetea en el próximo Ctrl+C). Los pegados quedan
  // seleccionados (y los demás se deseleccionan), mismo patrón que `addNode`.
  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    pasteCountRef.current += 1;
    const offset = PASTE_OFFSET * pasteCountRef.current;
    const stamp = Date.now();

    const idMap = new Map<string, string>();
    clip.nodes.forEach((n, i) => idMap.set(n.id, `node-${stamp}-${i}`));

    undoStack.current.push(captureSnapshot());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setIsDirty(true);

    const newNodes: Node[] = clip.nodes.map((n) => {
      const newId = idMap.get(n.id)!;
      // Sin `onLabelChange`/`onResize` viejos: quedarían atados al ID original, no al
      // duplicado. `fontSize` (el VALOR) sí queda — viaja en restData como cualquier campo.
      const { onLabelChange: _oldLabel, onResize: _oldResize, ...restData } = (n.data ?? {}) as Record<string, unknown>;
      void _oldLabel; void _oldResize;
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
        data: { ...restData, onLabelChange: makeOnLabelChangeFor(newId), onResize: makeOnResizeFor(newId) },
      };
    });

    const newEdges: Edge[] = clip.edges.map((e, i) => {
      const newId = `edge-${stamp}-${i}`;
      const source = idMap.get(e.source) ?? e.source;
      const target = idMap.get(e.target) ?? e.target;
      const d = (e.data ?? {}) as Record<string, unknown>;
      const isDataflow = e.type === "dataflow";
      return {
        ...e,
        id: newId,
        source,
        target,
        selected: false,
        data: isDataflow
          ? { ...d, onLabelCommit: makeOnEdgeLabelChangeFor(newId), onLabelPos: makeOnEdgeLabelPosFor(newId) }
          : d,
      };
    });

    setNodes((nds) => [...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
  }, [captureSnapshot, setNodes, setEdges, makeOnLabelChangeFor, makeOnResizeFor, makeOnEdgeLabelChangeFor, makeOnEdgeLabelPosFor]);

  // Ctrl+Z / Ctrl+Shift+Z (undo/redo) + Ctrl+C / Ctrl+V (duplicar selección) — igual que
  // Miro. Se ignora si el foco está en un input/textarea (edición de etiqueta en curso) y,
  // para copiar/pegar, si hay texto de verdad seleccionado en la página (no pisar un copy
  // de texto nativo, ej. seleccionar una palabra de una etiqueta sin entrar en edición).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); handleRedo();
      }
      if (!isFullscreen) return;
      const hasTextSelection = !!window.getSelection?.()?.toString();
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !hasTextSelection) {
        e.preventDefault(); handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !hasTextSelection) {
        e.preventDefault(); handlePaste();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, isFullscreen, handleCopy, handlePaste]);

  // ── Construcción del grafo ────────────────────────────────────────────────
  // makeOnLabelChange INSIDE buildGraph para evitar que su referencia entre en
  // el dep-array de buildGraph y provoque re-creaciones / loops.
  const buildGraph = useCallback(
    (dir: "TB" | "LR") => {
      if (!data?.nodes?.length) return;

      const hasSavedPositions = data.nodes.some(
        (n) => n.position != null && (n.position.x !== 0 || n.position.y !== 0)
      );

      // Generador de handler de edición de etiqueta para cada nodo
      const makeOnLabelChange =
        (nodeId: string) =>
        (field: "label" | "sublabel" | "owner" | "detail", value: string) => {
          undoStack.current.push(captureSnapshot());
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setCanUndo(true);
          setCanRedo(false);
          setIsDirty(true);
          setNodes((nds) =>
            nds.map((nd) =>
              nd.id === nodeId ? { ...nd, data: { ...nd.data, [field]: value } } : nd
            )
          );
        };

      // Commit del tamaño de fuente (TextNode) al terminar un resize (onResizeEnd, no en cada
      // frame): sin esto el fontSize solo vivía en estado LOCAL del nodo — se perdía al
      // recargar y, sobre todo, al duplicar (la copia nace con un componente nuevo → default).
      const makeOnResize =
        (nodeId: string) =>
        (fontSize: number) => {
          setIsDirty(true);
          setNodes((nds) =>
            nds.map((nd) => (nd.id === nodeId ? { ...nd, data: { ...nd.data, fontSize } } : nd))
          );
        };

      // Edición inline de etiqueta de edge "dataflow" (mapa de integración): marca dirty + undo,
      // igual que makeOnLabelChange para nodos. Sin esto, el commit no habilitaría "Guardar".
      const makeOnEdgeLabelChange =
        (edgeId: string) =>
        (value: string) => {
          undoStack.current.push(captureSnapshot());
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setCanUndo(true);
          setCanRedo(false);
          setIsDirty(true);
          setEdges((eds) =>
            eds.map((ed) => (ed.id === edgeId ? { ...ed, label: value.trim() || undefined } : ed))
          );
        };

      // Persistir la posición MANUAL (t, side) de una etiqueta dataflow al soltar el drag:
      // escribe en edge.data + dirty + undo (igual patrón que makeOnEdgeLabelChange).
      const makeOnEdgeLabelPos =
        (edgeId: string) =>
        (t: number, side: number) => {
          undoStack.current.push(captureSnapshot());
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setCanUndo(true);
          setCanRedo(false);
          setIsDirty(true);
          setEdges((eds) =>
            eds.map((ed) =>
              ed.id === edgeId ? { ...ed, data: { ...(ed.data as object), labelT: t, labelSide: side } } : ed
            )
          );
        };

      const rawNodes: Node[] = data.nodes.map((n) => {
        // Tolerar nodos en formato react-flow ANIDADO ({ data: { label, … } }) además del
        // plano ({ label, … }): los flowcharts del agente vienen anidados → sin esto los
        // labels salen vacíos (placeholders "Detalle…"/"Descripción…").
        const nd = (n as unknown as {
          data?: { label?: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string; systemColor?: string; fontSize?: number };
        }).data;
        return {
          id:       n.id,
          type:     n.type,
          position: hasSavedPositions ? (n.position ?? { x: 0, y: 0 }) : { x: 0, y: 0 },
          data: {
            label:         n.label ?? nd?.label,
            sublabel:      n.sublabel ?? nd?.sublabel,
            owner:         n.owner ?? nd?.owner,
            detail:        n.detail ?? nd?.detail,
            icon:          n.icon ?? nd?.icon,
            pipelineName:  n.pipelineName ?? nd?.pipelineName,
            systemColor:   n.systemColor ?? nd?.systemColor,
            fontSize:      n.fontSize ?? nd?.fontSize,
            variant:       n.type,
            onLabelChange: makeOnLabelChange(n.id),
            onResize:      makeOnResize(n.id),
          },
        };
      });

      // Build a lookup of node types for smart handle assignment
      const nodeTypeMap = new Map(data.nodes.map((n) => [n.id, n.type]));

      // Agrupar aristas por par NO-ordenado → separar etiquetas de paralelas/bidireccionales.
      const pairKey = (s: string, t: string) => (s < t ? `${s}|${t}` : `${t}|${s}`);
      const pairGroups = new Map<string, string[]>();
      data.edges.forEach((e, i) => {
        const k = pairKey(e.source, e.target);
        const arr = pairGroups.get(k) ?? [];
        arr.push(e.id ?? `e${i}`);
        pairGroups.set(k, arr);
      });

      const rawEdges: Edge[] = data.edges.map((e, i) => {
        // Use saved strokeColor if available, otherwise derive from edgeType
        const color = e.strokeColor || edgeColor(e.edgeType);
        const isDashed = e.dashed ?? (e.edgeType === "yes" || e.edgeType === "no");

        // Smart handle assignment for decision nodes
        let sourceHandle = e.sourceHandle;
        let targetHandle = e.targetHandle;
        const sourceType = nodeTypeMap.get(e.source);

        // Detect if this is a pipeline diagram
        const isPipeline = data.nodes.some((n) =>
          ["pipeline_stage", "trigger", "action", "follow_up", "outcome_positive", "outcome_negative", "lifecycle_change", "lead_status"].includes(n.type ?? "")
        );
        // Mapa de integración (nodos system) → edge "dataflow" (etiqueta sobre la línea,
        // editable y arrastrable), en ambos caminos (con y sin posiciones guardadas).
        const isIntegration = data.nodes.some((n) => n.type === "system");
        // Separar etiquetas de aristas paralelas/bidireccionales del mismo par: offset
        // perpendicular escalonado y simétrico (idx - (n-1)/2). 0 si la arista es única.
        const eid = e.id ?? `e${i}`;
        const group = pairGroups.get(pairKey(e.source, e.target)) ?? [eid];
        const labelShift = isIntegration && group.length > 1 ? group.indexOf(eid) - (group.length - 1) / 2 : 0;

        const targetType = nodeTypeMap.get(e.target);

        if (isPipeline && !sourceHandle) {
          if (sourceType === "decision") {
            // "yes" exits from bottom (main flow down), "no" exits from right (side lane)
            if (e.edgeType === "yes") sourceHandle = "b";
            else if (e.edgeType === "no") sourceHandle = "r";
            else sourceHandle = "b";
          } else if (targetType === "pain" || targetType === "annotation") {
            // Edges to pain/annotation exit from right (lateral connection)
            sourceHandle = "r";
          } else {
            // All other pipeline nodes: default exit from bottom
            sourceHandle = "b";
          }
        }

        // Pipeline targets: pain/annotation enter from left, others from top
        if (isPipeline && !targetHandle) {
          if (targetType === "pain" || targetType === "annotation") {
            targetHandle = "l";
          } else {
            targetHandle = "t";
          }
        }

        return {
        id:           e.id ?? `e${i}`,
        source:       e.source,
        target:       e.target,
        sourceHandle,
        targetHandle,
        label:        e.label,
        type:         isIntegration ? "dataflow" : "smoothstep",
        data:         isIntegration ? {
                        labelShift,
                        labelT:    e.labelT,
                        labelSide: e.labelSide,
                        direction: e.direction,
                        syncType:  e.syncType,
                        pending:   e.pending,
                        onLabelCommit: makeOnEdgeLabelChange(eid),
                        onLabelPos:    makeOnEdgeLabelPos(eid),
                      } : undefined,
        // Integración: el DataFlowEdge dibuja su propia flecha → sin markerEnd (evita <marker> huérfano).
        markerEnd:    isIntegration ? undefined : { type: MarkerType.ArrowClosed, color },
        style:        { stroke: color, strokeWidth: 1.5, ...(isDashed ? { strokeDasharray: "6 3" } : {}) },
        labelStyle:   { fontSize: 10, fontWeight: 600, fill: color },
        labelBgStyle: { fill: "white", fillOpacity: 0.85 },
        };
      });

      // Inyectar onLabelChange a nodos de sistema (títulos de pipeline, etc.)
      const injectEditHandlers = (layoutNodes: Node[]) =>
        layoutNodes.map((n) => {
          if (n.id.startsWith("__pipeline_title")) {
            return { ...n, data: { ...n.data, onLabelChange: makeOnLabelChange(n.id) } };
          }
          return n;
        });

      pendingFitView.current = true;

      // Helper: add title node if diagram has a title and no pipeline_title already exists
      const addTitleNode = (layoutNodes: Node[]): Node[] => {
        if (!data.title) return layoutNodes;
        if (layoutNodes.some((n) => n.id === "__pipeline_title")) return layoutNodes;
        // Find top-left position of all nodes
        let minX = Infinity, minY = Infinity;
        for (const n of layoutNodes) {
          if (n.id.startsWith("__")) continue;
          if (n.position.x < minX) minX = n.position.x;
          if (n.position.y < minY) minY = n.position.y;
        }
        const titleNode: Node = {
          id: "__pipeline_title",
          type: "pipeline_title",
          position: { x: Math.max(0, minX), y: Math.max(0, minY - 50) },
          data: { label: data.title, onLabelChange: makeOnLabelChange("__pipeline_title") },
          style: { zIndex: 0 },
        };
        return [titleNode, ...layoutNodes];
      };

      if (hasSavedPositions) {
        const titled = addTitleNode(rawNodes);
        setNodes(titled);
        // Integración: recomputar el de-overlap de etiquetas desde las posiciones GUARDADAS
        // (getIntegrationLayout no corre en este camino) para que no se tapen. Las manuales
        // (labelT) se excluyen y quedan donde el usuario las puso.
        const isIntegration = data.nodes.some((n) => n.type === "system");
        if (isIntegration) {
          const posMap = computeIntegrationLabelPositions(titled, rawEdges);
          setEdges(rawEdges.map((e) => ({
            ...e,
            data: { ...(e.data as object), labelPos: posMap.get(e.id ?? "") },
          })));
        } else {
          setEdges(rawEdges);
        }
      } else {
        try {
          const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges, dir);
          setNodes(addTitleNode(injectEditHandlers(ln)));
          setEdges(le);
        } catch {
          setNodes(addTitleNode(rawNodes));
          setEdges(rawEdges);
        }
      }
    },
    // `dataKey` (contenido) en vez de `data` (referencia) a propósito — ver comentario en su
    // declaración: evita reconstruir el grafo (y disparar "dimensions" espurios) cuando quien
    // nos monta re-renderiza con un objeto `data` nuevo pero de igual contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey, setNodes, setEdges, captureSnapshot]
  );

  useEffect(() => { buildGraph(direction); }, [buildGraph, direction]);

  // fitView después de buildGraph — Strict Mode safe:
  // pendingFitView.current = false va DENTRO del timeout para que si el cleanup
  // de Strict Mode cancela el timer, la bandera siga en true y el re-setup funcione.
  useEffect(() => {
    if (!pendingFitView.current || !nodes.length) return;
    const timer = setTimeout(() => {
      pendingFitView.current = false;
      rfInstance.current?.fitView({ padding: 0.15, duration: 400 });
    }, 200);
    return () => clearTimeout(timer);
  }, [nodes]);

  // ── Conectar nodos existentes (drag handle → handle) ──────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      undoStack.current.push(captureSnapshot());
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);
      // En un mapa de sistemas, las conexiones nuevas también son "dataflow" (etiqueta sobre
      // la línea), para no romper la coherencia del modelo Miro.
      const isIntegration = nodesRef.current.some((n) => n.type === "system");
      // Id propio + handlers de etiqueta inyectados, para que la posición y el texto de la
      // etiqueta de la arista NUEVA persistan/undo desde el primer arrastre (igual que rawEdges).
      const newEdgeId = `e-${connection.source ?? ""}-${connection.target ?? ""}-${Date.now()}`;
      const pushUndoDirty = () => {
        undoStack.current.push(captureSnapshot());
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
        setIsDirty(true);
      };
      const onLabelCommit = (value: string) => {
        pushUndoDirty();
        setEdges((eds) => eds.map((ed) => (ed.id === newEdgeId ? { ...ed, label: value.trim() || undefined } : ed)));
      };
      const onLabelPos = (t: number, side: number) => {
        pushUndoDirty();
        setEdges((eds) => eds.map((ed) => (ed.id === newEdgeId ? { ...ed, data: { ...(ed.data as object), labelT: t, labelSide: side } } : ed)));
      };
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            ...(isIntegration ? { id: newEdgeId } : {}),
            type:      isIntegration ? "dataflow" : "smoothstep",
            ...(isIntegration ? { data: { labelShift: 0, onLabelCommit, onLabelPos } } : {}),
            markerEnd: isIntegration ? undefined : { type: MarkerType.ArrowClosed, color: "#94a3b8" },
            style:     { stroke: "#94a3b8", strokeWidth: 1.5 },
          },
          eds
        )
      );
      setIsDirty(true);
    },
    [setEdges, captureSnapshot]
  );

  // ── Crear nodo al soltar la línea en canvas vacío (estilo Miro) ────────────
  const connectingNodeId = useRef<string | null>(null);

  const onConnectStart = useCallback(
    (_: unknown, { nodeId }: { nodeId: string | null }) => {
      connectingNodeId.current = nodeId;
    },
    []
  );

  const onConnectEnd = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: MouseEvent | TouchEvent, connectionState: any) => {
      if (connectionState?.isValid) return; // conectó a nodo existente → nada que hacer
      const sourceId = connectingNodeId.current;
      if (!sourceId) return;

      const { clientX, clientY } =
        "changedTouches" in event
          ? event.changedTouches[0]
          : (event as MouseEvent);

      const position = screenToFlowPosition({ x: clientX, y: clientY });
      const id = `node-${Date.now()}`;

      // Guardar snapshot ANTES del cambio
      undoStack.current.push(captureSnapshot());
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);

      // onLabelChange para el nuevo nodo (inline para evitar dependencias externas)
      const onLabelChange =
        (field: "label" | "sublabel" | "owner" | "detail", value: string) => {
          undoStack.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setCanUndo(true);
          setCanRedo(false);
          setIsDirty(true);
          setNodes((nds) =>
            nds.map((nd) =>
              nd.id === id ? { ...nd, data: { ...nd.data, [field]: value } } : nd
            )
          );
        };

      const newNode: Node = {
        id,
        type: "process",
        position: { x: position.x - 120, y: position.y - 20 },
        data: {
          label:         DEFAULT_LABELS.process,
          variant:       "process",
          onLabelChange,
        },
      };

      const newEdge: Edge = {
        id:        `e-${sourceId}-${id}`,
        source:    sourceId,
        target:    id,
        type:      "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        style:     { stroke: "#94a3b8", strokeWidth: 1.5 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes, setEdges, captureSnapshot]
  );

  // ── Snapshot antes de borrar ───────────────────────────────────────────────
  const onBeforeDelete = useCallback(async () => {
    undoStack.current.push(captureSnapshot());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setIsDirty(true);
    return true;
  }, [captureSnapshot]);

  // ── Snap-to-align (guías magnéticas) ─────────────────────────────────────
  const SNAP_THRESHOLD = 8; // px de tolerancia para snap
  const [guidelines, setGuidelines] = useState<Array<{ x?: number; y?: number }>>([]);

  const onNodeDragStart = useCallback(() => {
    undoStack.current.push(captureSnapshot());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [captureSnapshot]);

  const onNodeDrag = useCallback(
    (_: unknown, draggedNode: Node) => {
      const guides: Array<{ x?: number; y?: number }> = [];
      const dragDims = getNodeDims(draggedNode.type ?? "process");
      const dragCX = draggedNode.position.x + dragDims.width / 2;
      const dragCY = draggedNode.position.y + dragDims.height / 2;
      const dragLeft = draggedNode.position.x;
      const dragRight = draggedNode.position.x + dragDims.width;
      const dragTop = draggedNode.position.y;
      const dragBottom = draggedNode.position.y + dragDims.height;

      let snapX: number | null = null;
      let snapY: number | null = null;

      for (const other of nodes) {
        if (other.id === draggedNode.id || other.id.startsWith("__")) continue;
        const otherDims = getNodeDims(other.type ?? "process");
        const otherCX = other.position.x + otherDims.width / 2;
        const otherCY = other.position.y + otherDims.height / 2;
        const otherLeft = other.position.x;
        const otherRight = other.position.x + otherDims.width;
        const otherTop = other.position.y;
        const otherBottom = other.position.y + otherDims.height;

        // Vertical alignment (X axis)
        if (Math.abs(dragCX - otherCX) < SNAP_THRESHOLD) {
          guides.push({ x: otherCX });
          snapX = otherCX - dragDims.width / 2;
        } else if (Math.abs(dragLeft - otherLeft) < SNAP_THRESHOLD) {
          guides.push({ x: otherLeft });
          snapX = otherLeft;
        } else if (Math.abs(dragRight - otherRight) < SNAP_THRESHOLD) {
          guides.push({ x: otherRight });
          snapX = otherRight - dragDims.width;
        }

        // Horizontal alignment (Y axis)
        if (Math.abs(dragCY - otherCY) < SNAP_THRESHOLD) {
          guides.push({ y: otherCY });
          snapY = otherCY - dragDims.height / 2;
        } else if (Math.abs(dragTop - otherTop) < SNAP_THRESHOLD) {
          guides.push({ y: otherTop });
          snapY = otherTop;
        } else if (Math.abs(dragBottom - otherBottom) < SNAP_THRESHOLD) {
          guides.push({ y: otherBottom });
          snapY = otherBottom - dragDims.height;
        }
      }

      setGuidelines(guides);

      // Snap the node position
      if (snapX !== null || snapY !== null) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  position: {
                    x: snapX ?? n.position.x,
                    y: snapY ?? n.position.y,
                  },
                }
              : n
          )
        );
      }
    },
    [nodes, setNodes]
  );

  const onNodeDragStop = useCallback(() => {
    setIsDirty(true);
    setGuidelines([]);
  }, []);

  // ── Edge handlers ──────────────────────────────────────────────────────────
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setEdgeEditId(null);
  }, []);

  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (edge.type === "dataflow") return; // el DataFlowEdge edita su etiqueta inline
    setSelectedEdgeId(edge.id);
    setEdgeEditId(edge.id);
    setEdgeEditLabel(typeof edge.label === "string" ? edge.label : "");
    setEdgeEditPos({ x: event.clientX, y: event.clientY });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeEditId(null);
    setNodePopupOpen(false);
    setActiveTool("pointer"); // el botón "+" no queda resaltado tras cerrar el popup con clic en el lienzo
  }, []);

  const updateEdgeLabel = useCallback((edgeId: string, label: string) => {
    setEdges((eds) => eds.map((e) =>
      e.id === edgeId ? { ...e, label: label || undefined } : e
    ));
    setIsDirty(true);
    setEdgeEditId(null);
  }, [setEdges]);

  const updateEdgeStyle = useCallback((edgeId: string, color: string, dashed: boolean) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== edgeId) return e;
      return {
        ...e,
        style: { ...((e.style as Record<string, unknown>) ?? {}), stroke: color, strokeWidth: 1.5, strokeDasharray: dashed ? "6 3" : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        labelStyle: { ...((e.labelStyle as Record<string, unknown>) ?? {}), fill: color },
      };
    }));
    setIsDirty(true);
  }, [setEdges]);

  // ── Agregar nodo desde el panel ───────────────────────────────────────────
  const addNode = useCallback(
    (type: FlowchartData["nodes"][0]["type"], dropPosition?: { x: number; y: number }) => {
      const id = `node-${Date.now()}`;
      const { width, height } = getNodeDims(type);
      let position = dropPosition ?? { x: 200, y: 200 };
      if (!dropPosition) {
        try {
          // Clic desde el popup: CENTRO exacto del viewport (predecible, sin jitter),
          // centrando la caja con sus dimensiones reales.
          const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
          position = { x: c.x - width / 2, y: c.y - height / 2 };
        } catch { /* usar posición por defecto */ }
        // Anti-apilamiento: si ya hay un nodo casi en el mismo lugar (doble clic en el popup),
        // correr en diagonal hasta un hueco libre.
        const taken = (p: { x: number; y: number }) =>
          nodesRef.current.some((n) => Math.abs(n.position.x - p.x) < 24 && Math.abs(n.position.y - p.y) < 24);
        let guard = 0;
        while (taken(position) && guard < 20) {
          position = { x: position.x + 28, y: position.y + 28 };
          guard++;
        }
      }

      undoStack.current.push(captureSnapshot());
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);

      const onLabelChange =
        (field: "label" | "sublabel" | "owner" | "detail", value: string) => {
          undoStack.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setCanUndo(true);
          setCanRedo(false);
          setIsDirty(true);
          setNodes((nds) =>
            nds.map((nd) =>
              nd.id === id ? { ...nd, data: { ...nd.data, [field]: value } } : nd
            )
          );
        };

      // Nuevo nodo SELECCIONADO (resaltado y listo para arrastrar); deseleccionar el resto.
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id,
          type,
          position,
          selected: true,
          data: {
            label: DEFAULT_LABELS[type] ?? "Nodo",
            ...(type === "system" ? { sublabel: "Sistema" } : {}),
            variant: type,
            onLabelChange,
            onResize: makeOnResizeFor(id),
          },
        } as Node,
      ]);
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes, captureSnapshot, makeOnResizeFor]
  );

  // ── Drop handler para drag desde toolbar ──────────────────────────────────
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type as FlowchartData["nodes"][0]["type"], position);
    },
    [screenToFlowPosition, addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // ── Serializar estado actual para guardar ─────────────────────────────────
  const getCurrentData = useCallback(
    (): FlowchartData => {
      return {
      title:       data.title,
      description: data.description,
      // Canvas vivo: la posición del usuario (drag) SIEMPRE se persiste tal cual, para
      // cualquier tipo de diagrama — incluido pipeline. Antes se descartaba a propósito acá
      // para diagramas pipeline, forzando un re-layout automático en cada carga que pisaba
      // cualquier reubicación manual. `buildGraph` ya sabe usar posiciones guardadas tal cual
      // cuando existen (rama `hasSavedPositions`), así que alcanza con dejar de sabotear el payload.
      nodes: nodes.filter((n) => !n.id.startsWith("__bg_col_") && !n.id.startsWith("__pipeline_")).map((n) => ({
        id:           n.id,
        type:         n.type as string,
        label:        (n.data.label        as string) ?? "",
        sublabel:     (n.data.sublabel     as string | undefined) || undefined,
        owner:        (n.data.owner        as string | undefined) || undefined,
        detail:       (n.data.detail       as string | undefined) || undefined,
        icon:         (n.data.icon         as string | undefined) || undefined,
        pipelineName: (n.data.pipelineName as string | undefined) || undefined,
        systemColor:  (n.data.systemColor  as string | undefined) || undefined,
        fontSize:     (n.data.fontSize     as number | undefined) || undefined,
        position:     n.position,
      })),
      edges: edges.map((e) => {
        const stroke = (e.style as { stroke?: string })?.stroke;
        const dashArray = (e.style as { strokeDasharray?: string })?.strokeDasharray;
        const d = e.data as {
          labelT?: number; labelSide?: number;
          direction?: "to" | "bidir"; syncType?: "realtime" | "batch" | "manual"; pending?: boolean;
        } | undefined;
        return {
          id:           e.id,
          source:       e.source,
          target:       e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          label:        typeof e.label === "string" ? e.label : undefined,
          edgeType:
            stroke === "#22c55e" ? "yes" as const
            : stroke === "#ef4444" ? "no" as const
            : "default" as const,
          strokeColor:  stroke || undefined,
          dashed:       dashArray ? true : undefined,
          // Integración: posición manual de etiqueta + semántica de flujo (round-trip).
          labelT:       typeof d?.labelT === "number" ? d.labelT : undefined,
          labelSide:    typeof d?.labelSide === "number" ? (d.labelSide as -1 | 0 | 1) : undefined,
          direction:    d?.direction,
          syncType:     d?.syncType,
          pending:      d?.pending || undefined,
        };
      }),
      };
    },
    [nodes, edges, data]
  );

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(getCurrentData());
      setIsDirty(false);
      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    } finally {
      setSaving(false);
    }
  }, [onSave, saving, getCurrentData]);

  // Escape en fullscreen + fitView al entrar
  useEffect(() => {
    if (!isFullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", h);
    // Centrar diagrama al entrar a fullscreen (esperar al resize del container)
    const timer = setTimeout(() => {
      rfInstance.current?.fitView({ padding: 0.15, duration: 300 });
    }, 100);
    return () => {
      window.removeEventListener("keydown", h);
      clearTimeout(timer);
    };
  }, [isFullscreen]);

  // ── Render ────────────────────────────────────────────────────────────────
  // Tipo de diagrama actual: decide qué nodos ofrece la toolbar y qué leyenda se muestra.
  const diagramKind: "integration" | "pipeline" | "classic" = nodes.some((n) => n.type === "system")
    ? "integration"
    : nodes.some((n) =>
        ["pipeline_stage", "trigger", "action", "follow_up", "outcome_positive", "outcome_negative", "lifecycle_change", "lead_status"].includes(n.type ?? ""),
      )
      ? "pipeline"
      : "classic";

  const flowContent = (
    <div className="relative w-full h-full">
      {/* Resaltado de selección — UNA sola regla cubre los ~18 tipos de nodo (cajas, texto,
          notas) sin tocar cada componente; React Flow ya agrega la clase `selected` al
          wrapper de cada nodo. El borde/radio queda algo "rectangular" en formas tipo
          píldora (start/end, trigger) — aceptable, mismo criterio que Figma/Miro. */}
      <style>{`
        /* !important: la hoja de estilos de React Flow trae ".selectable:focus/:focus-visible { outline: none }"
           con más especificidad (3 clases) que ".selected" (2 clases) — sin esto, el borde azul solo se ve
           en el instante entre blur y la baja de la clase "selected" (parpadeo al deseleccionar), nunca
           mientras el nodo está realmente seleccionado. */
        .react-flow__node.selected,
        .react-flow__node.selectable.selected:focus,
        .react-flow__node.selectable.selected:focus-visible {
          outline: 2px solid #3b82f6 !important;
          outline-offset: 2px;
          border-radius: 8px;
        }
      `}</style>

      {/* Toolbar lateral izquierda estilo Miro (solo en fullscreen) */}
      {onSave && isFullscreen && (
        <ToolbarSidebar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          nodePopupOpen={nodePopupOpen}
          setNodePopupOpen={setNodePopupOpen}
          addNode={addNode}
          diagramKind={diagramKind}
        />
      )}

      {/* Toolbar derecha: undo/redo, guardar, pantalla completa, dirección */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {isFullscreen && (canUndo || canRedo) && (
          <div className="flex items-center gap-0.5 mr-1 bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={handleUndo} disabled={!canUndo}
              title="Deshacer (Ctrl+Z)"
              className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M3 7H11C12.657 7 14 8.343 14 10C14 11.657 12.657 13 11 13H7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 4L2 7L5 10" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={handleRedo} disabled={!canRedo}
              title="Rehacer (Ctrl+Shift+Z)"
              className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M13 7H5C3.343 7 2 8.343 2 10C2 11.657 3.343 13 5 13H9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M11 4L14 7L11 10" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* `|| saving`: el CTA NO se va al hacer clic — se queda como "Guardando…" hasta que el
            guardado termina, y recién ahí desaparece (isDirty=false). Sin esto, cualquier cosa que
            baje isDirty mientras el PUT está en vuelo (p.ej. un refetch del padre que aterriza en
            el medio) lo hacía desaparecer sin feedback. Vuelve a aparecer solo al modificar algo. */}
        {onSave && (isDirty || saving) && isFullscreen && (
          <button
            onClick={handleSave} disabled={saving}
            title="Guardar cambios"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-brand text-white border-brand/60 hover:bg-brand-light disabled:opacity-60"
          >
            {saving ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            )}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        )}

        <button
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          className="p-1.5 rounded-lg border text-xs transition-colors bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          {isFullscreen ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M5 11L2 14M11 5l3-3M2 10h4V14M10 2h4v4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isFullscreen ? onNodesChange : undefined}
        onEdgesChange={isFullscreen ? onEdgesChange : undefined}
        onConnect={isFullscreen ? onConnect : undefined}
        onConnectStart={isFullscreen ? onConnectStart : undefined}
        onConnectEnd={isFullscreen ? onConnectEnd : undefined}
        onBeforeDelete={isFullscreen ? onBeforeDelete : undefined}
        onNodeDragStart={isFullscreen ? onNodeDragStart : undefined}
        onNodeDrag={isFullscreen ? onNodeDrag : undefined}
        onNodeDragStop={isFullscreen ? onNodeDragStop : undefined}
        onEdgeClick={isFullscreen ? onEdgeClick : undefined}
        onEdgeDoubleClick={isFullscreen ? onEdgeDoubleClick : undefined}
        onPaneClick={isFullscreen ? onPaneClick : undefined}
        edgesFocusable={isFullscreen}
        onDrop={isFullscreen ? onDrop : undefined}
        onDragOver={isFullscreen ? onDragOver : undefined}
        onInit={(instance) => { rfInstance.current = instance; }}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={isFullscreen ? 40 : 0}
        deleteKeyCode={isFullscreen ? ["Delete", "Backspace"] : []}
        multiSelectionKeyCode={isFullscreen ? ["Control", "Meta"] : []}
        selectionOnDrag={false}
        selectionKeyCode={isFullscreen ? ["Control", "Meta"] : []}
        panOnDrag={isFullscreen ? true : [0]}
        nodesDraggable={isFullscreen}
        nodesConnectable={isFullscreen}
        elementsSelectable={isFullscreen}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.1, maxZoom: isFullscreen ? 1.5 : 1.2 }}
        minZoom={0.1}
        maxZoom={isFullscreen ? 2 : 1.6}
        panOnScroll={isFullscreen}
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        preventScrolling={isFullscreen}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        {/* Controles de zoom — también embebido, para leer el diagrama sin fullscreen. */}
        <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm !rounded-xl" />

        {/* Guías de alineación */}
        {guidelines.length > 0 && <SnapGuidelines guidelines={guidelines} />}
      </ReactFlow>

      {/* Edge label edit popup */}
      {edgeEditId && edgeEditPos && isFullscreen && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2"
          style={{ left: edgeEditPos.x - 100, top: edgeEditPos.y - 20 }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); updateEdgeLabel(edgeEditId, edgeEditLabel); }}
            className="flex items-center gap-1.5"
          >
            <input
              autoFocus
              value={edgeEditLabel}
              onChange={(e) => setEdgeEditLabel(e.target.value)}
              placeholder="Etiqueta (ej: Sí, No)..."
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:border-blue-400 focus:outline-none w-36"
            />
            <button type="submit" className="px-2 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600">OK</button>
            <button type="button" onClick={() => setEdgeEditId(null)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">✕</button>
          </form>
        </div>
      )}

      {/* Edge style panel */}
      {selectedEdgeId && !edgeEditId && isFullscreen && (
        <div className="absolute bottom-14 right-3 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] text-gray-600 font-semibold">Conector</span>
            {edges.find((e) => e.id === selectedEdgeId)?.type !== "dataflow" && (
              <button
                onClick={() => {
                  const edge = edges.find((e) => e.id === selectedEdgeId);
                  if (!edge) return;
                  setEdgeEditId(edge.id);
                  setEdgeEditLabel(typeof edge.label === "string" ? edge.label : "");
                  setEdgeEditPos({ x: window.innerWidth - 260, y: window.innerHeight - 220 });
                }}
                title="Editar la etiqueta del conector"
                className="px-2 py-0.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
              >
                ✎ Etiqueta
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[9px] text-gray-400 font-semibold uppercase">Color</span>
          </div>
          <div className="flex items-center gap-1 mb-1.5">
            {[
              { color: "#64748b", label: "Gris" },
              { color: "#22c55e", label: "Verde" },
              { color: "#ef4444", label: "Rojo" },
              { color: "#3b82f6", label: "Azul" },
              { color: "#f59e0b", label: "Amber" },
              { color: "#8b5cf6", label: "Violeta" },
            ].map(({ color, label }) => (
              <button
                key={color}
                onClick={() => {
                  const edge = edges.find((e) => e.id === selectedEdgeId);
                  const currentDashed = (edge?.style as Record<string, unknown>)?.strokeDasharray !== undefined;
                  updateEdgeStyle(selectedEdgeId, color, currentDashed);
                }}
                title={label}
                className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-400 font-semibold uppercase mr-1">Estilo</span>
            <button
              onClick={() => {
                const edge = edges.find((e) => e.id === selectedEdgeId);
                const currentColor = (edge?.style as Record<string, unknown>)?.stroke as string ?? "#64748b";
                updateEdgeStyle(selectedEdgeId, currentColor, false);
              }}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50"
            >
              ── Sólida
            </button>
            <button
              onClick={() => {
                const edge = edges.find((e) => e.id === selectedEdgeId);
                const currentColor = (edge?.style as Record<string, unknown>)?.stroke as string ?? "#64748b";
                updateEdgeStyle(selectedEdgeId, currentColor, true);
              }}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50"
            >
              - - Punteada
            </button>
          </div>
        </div>
      )}

      {/* Leyenda (según el tipo de diagrama) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
        {diagramKind === "integration" ? (
          <>
            <LegendItem color="bg-slate-500"  label="Sistema" />
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="inline-block w-4 border-t-2 border-gray-400" /> flujo de datos</span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="inline-block w-4 border-t-2 border-dashed border-gray-400" /> batch / manual</span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="inline-block w-4 border-t-2 border-amber-500" /> por confirmar</span>
          </>
        ) : diagramKind === "pipeline" ? (
          <>
            <LegendItem color="bg-green-500"  label="Etapa" />
            <LegendItem color="bg-green-300"  label="Trigger / Acción" />
            <LegendItem color="bg-violet-400" label="Decisión" />
            <LegendItem color="bg-indigo-400" label="Avanza" />
            <LegendItem color="bg-red-400"    label="No avanza / Dolor" />
            <LegendItem color="bg-amber-400"  label="Nota" />
          </>
        ) : (
          <>
            <LegendItem color="bg-gray-800"   label="Inicio / Fin" />
            <LegendItem color="bg-blue-400"   label="Proceso" />
            <LegendItem color="bg-violet-400" label="Decisión" />
            <LegendItem color="bg-red-400"    label="Dolor" />
            <LegendItem color="bg-amber-400"  label="Nota" />
          </>
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
        {flowContent}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: 300 }}>
      {flowContent}
    </div>
  );
}

// ── Export principal (con Provider) ───────────────────────────────────────────

export default function FlowchartViewer({
  data,
  onSave,
}: {
  data: FlowchartData;
  onSave?: (updated: FlowchartData) => Promise<void>;
}) {
  if (!data?.nodes?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Sin datos de flujo disponibles.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowchartInner data={data} onSave={onSave} />
    </ReactFlowProvider>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function edgeColor(type?: string) {
  if (type === "yes") return "#22c55e";
  if (type === "no")  return "#ef4444";
  return "#94a3b8";
}

// ── Guías de alineación (snap) ────────────────────────────────────────────────
// Renderiza líneas dentro del viewport de React Flow usando useReactFlow para
// convertir coordenadas del flow a coordenadas de pantalla.

function SnapGuidelines({ guidelines }: { guidelines: Array<{ x?: number; y?: number }> }) {
  const { getViewport } = useReactFlow();
  const { x: tx, y: ty, zoom } = getViewport();

  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1000, overflow: "hidden" }}
    >
      <svg width="100%" height="100%">
        {guidelines.map((g, i) => {
          if (g.x !== undefined) {
            const screenX = g.x * zoom + tx;
            return (
              <line key={`gx${i}`} x1={screenX} y1={0} x2={screenX} y2="100%" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
            );
          }
          if (g.y !== undefined) {
            const screenY = g.y * zoom + ty;
            return (
              <line key={`gy${i}`} x1={0} y1={screenY} x2="100%" y2={screenY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-2xs text-gray-500">{label}</span>
    </div>
  );
}
