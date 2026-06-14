"use client";

import { useEffect, useCallback, useState, useRef } from "react";
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
import { getLayoutedElements, getNodeDims } from "@/lib/flowchart/layout";
import {
  StartEndNode,
  ProcessNode,
  DecisionNode,
  PainNode,
  AnnotationNode,
  TextNode,
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
};

// ── Toolbar items (agrupados por categoría) ─────────────────────────────────

interface ToolbarItem {
  type: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
}

const TOOLBAR_GROUPS: { title: string; items: ToolbarItem[] }[] = [
  {
    title: "Flujo",
    items: [
      { type: "start",    label: "Inicio",   icon: "▶", color: "text-gray-600",   bg: "bg-gray-100 hover:bg-gray-200 border-gray-200" },
      { type: "end",      label: "Fin",      icon: "⏹", color: "text-emerald-600", bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200" },
      { type: "process",  label: "Proceso",  icon: "□", color: "text-blue-600",   bg: "bg-blue-50 hover:bg-blue-100 border-blue-200" },
      { type: "decision", label: "Decisión", icon: "◇", color: "text-violet-600", bg: "bg-violet-50 hover:bg-violet-100 border-violet-200" },
    ],
  },
  {
    title: "Hallazgos",
    items: [
      { type: "pain",       label: "Dolor",    icon: "⚠", color: "text-red-600",    bg: "bg-red-50 hover:bg-red-100 border-red-200" },
      { type: "annotation", label: "Nota",     icon: "📝", color: "text-amber-600", bg: "bg-amber-50 hover:bg-amber-100 border-amber-200" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { type: "pipeline_stage",   label: "Etapa",       icon: "📋", color: "text-green-700",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
      { type: "trigger",          label: "Trigger",     icon: "⚡", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
      { type: "action",           label: "Acción",      icon: "⚙", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
      { type: "follow_up",        label: "Seguimiento", icon: "🔄", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
      { type: "outcome_positive", label: "Positivo",    icon: "✅", color: "text-blue-600",   bg: "bg-blue-50 hover:bg-blue-100 border-blue-200" },
      { type: "outcome_negative", label: "Negativo",    icon: "❌", color: "text-red-600",    bg: "bg-red-50 hover:bg-red-100 border-red-200" },
      { type: "lifecycle_change", label: "Lifecycle",   icon: "🔀", color: "text-green-600",  bg: "bg-green-50 hover:bg-green-100 border-green-200" },
      { type: "lead_status",      label: "Status",      icon: "📊", color: "text-gray-600",   bg: "bg-gray-100 hover:bg-gray-200 border-gray-200" },
    ],
  },
];

const DEFAULT_LABELS: Record<string, string> = {
  start: "Inicio", end: "Fin", process: "Nuevo proceso",
  decision: "¿Decisión?", pain: "Punto de dolor", annotation: "Anotación",
  text: "Texto", pipeline_stage: "Nueva etapa", trigger: "Trigger", action: "Acción",
  follow_up: "Seguimiento", outcome_positive: "Avanza", outcome_negative: "No avanza",
  lifecycle_change: "Cambio lifecycle", lead_status: "Estado del lead",
};

// ── Componente interno (dentro del Provider) ──────────────────────────────────

// ── Toolbar lateral (estilo Miro) ─────────────────────────────────────────────

function ToolbarSidebar({
  activeTool,
  setActiveTool,
  nodePopupOpen,
  setNodePopupOpen,
  addNode,
  direction,
  onToggleDirection,
}: {
  activeTool: "pointer" | "text" | "comment" | "node";
  setActiveTool: (tool: "pointer" | "text" | "comment" | "node") => void;
  nodePopupOpen: boolean;
  setNodePopupOpen: (open: boolean) => void;
  addNode: (type: string) => void;
  direction: "TB" | "LR";
  onToggleDirection: () => void;
}) {
  const tools: { id: "pointer" | "text" | "comment" | "node"; icon: React.ReactNode; label: string }[] = [
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
      label: "Texto",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 4h14a1 1 0 011 1v2a1 1 0 01-2 0V6H13v12h2a1 1 0 010 2H9a1 1 0 010-2h2V6H6v1a1 1 0 01-2 0V5a1 1 0 011-1z" />
        </svg>
      ),
    },
    {
      id: "comment",
      label: "Comentario",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
    {
      id: "node",
      label: "Nodo",
      icon: (
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="3" />
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
                if (tool.id === "node") {
                  setNodePopupOpen(!nodePopupOpen);
                  setActiveTool("node");
                } else if (tool.id === "text") {
                  addNode("text");
                  setActiveTool("pointer");
                  setNodePopupOpen(false);
                } else if (tool.id === "comment") {
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
            {tool.id === "node" && nodePopupOpen && (
              <div className="absolute left-full top-0 ml-2 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-[180px] max-h-[400px] overflow-y-auto">
                {TOOLBAR_GROUPS.map((group) => (
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
                          title={`Agregar: ${item.label}`}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-grab active:cursor-grabbing ${item.bg}`}
                        >
                          <span>{item.icon}</span>
                          <span className={item.color}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Separador */}
        <div className="border-t border-gray-200 my-0.5" />

        {/* Disposición */}
        <button
          onClick={onToggleDirection}
          title={direction === "LR" ? "Cambiar a vertical" : "Cambiar a horizontal"}
          className="p-2.5 rounded-lg transition-all text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          {direction === "LR" ? (
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="2" width="18" height="4" rx="1" />
              <rect x="3" y="10" width="18" height="4" rx="1" />
              <rect x="3" y="18" width="18" height="4" rx="1" />
            </svg>
          ) : (
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="2" y="3" width="4" height="18" rx="1" />
              <rect x="10" y="3" width="4" height="18" rx="1" />
              <rect x="18" y="3" width="4" height="18" rx="1" />
            </svg>
          )}
        </button>
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
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<Node>([]);
  // Wrap onNodesChange to track dirty state for resize/position changes
  const onNodesChange = useCallback((changes: Parameters<typeof rawOnNodesChange>[0]) => {
    rawOnNodesChange(changes);
    // Mark dirty for dimension/position changes (resize, drag handled separately)
    if (changes.some((c: { type: string }) => c.type === "dimensions")) {
      setIsDirty(true);
    }
  }, [rawOnNodesChange]);
  const [edges, setEdges, rawOnEdgesChange] = useEdgesState<Edge>([]);
  const onEdgesChange = useCallback((changes: Parameters<typeof rawOnEdgesChange>[0]) => {
    rawOnEdgesChange(changes);
    if (changes.some((c: { type: string }) => c.type === "remove")) {
      setIsDirty(true);
    }
  }, [rawOnEdgesChange]);
  const [direction, setDirection] = useState<"TB" | "LR">("LR");
  const [layoutTick, setLayoutTick] = useState(0);
  const [isDirty, setIsDirty]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<"pointer" | "text" | "comment" | "node">("pointer");
  const [nodePopupOpen, setNodePopupOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeEditId, setEdgeEditId] = useState<string | null>(null);
  const [edgeEditLabel, setEdgeEditLabel] = useState("");
  const [edgeEditPos, setEdgeEditPos] = useState<{ x: number; y: number } | null>(null);
  const [canUndo, setCanUndo]   = useState(false);
  const [canRedo, setCanRedo]   = useState(false);

  const rfInstance     = useRef<ReactFlowInstance | null>(null);
  const pendingFitView = useRef(false);
  const forceLayoutRef = useRef(false);

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
  }, [data]);

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

  // Ctrl+Z / Ctrl+Shift+Z (igual que Miro)
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

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
        (field: "label" | "sublabel" | "owner", value: string) => {
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

      const rawNodes: Node[] = data.nodes.map((n) => {
        // Tolerar nodos en formato react-flow ANIDADO ({ data: { label, … } }) además del
        // plano ({ label, … }): los flowcharts del agente vienen anidados → sin esto los
        // labels salen vacíos (placeholders "Detalle…"/"Descripción…").
        const nd = (n as unknown as {
          data?: { label?: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string };
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
            variant:       n.type,
            onLabelChange: makeOnLabelChange(n.id),
          },
        };
      });

      // Build a lookup of node types for smart handle assignment
      const nodeTypeMap = new Map(data.nodes.map((n) => [n.id, n.type]));

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
        type:         "smoothstep",
        markerEnd:    { type: MarkerType.ArrowClosed, color },
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
      const shouldForce = forceLayoutRef.current;
      forceLayoutRef.current = false;

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

      if (hasSavedPositions && !shouldForce) {
        setNodes(addTitleNode(rawNodes));
        setEdges(rawEdges);
      } else {
        try {
          const cleanNodes = shouldForce
            ? rawNodes.map((n) => ({ ...n, position: { x: 0, y: 0 } }))
            : rawNodes;
          const { nodes: ln, edges: le } = getLayoutedElements(cleanNodes, rawEdges, dir);
          setNodes(addTitleNode(injectEditHandlers(ln)));
          setEdges(le);
        } catch {
          setNodes(addTitleNode(rawNodes));
          setEdges(rawEdges);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, setNodes, setEdges, captureSnapshot]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { buildGraph(direction); }, [buildGraph, direction, layoutTick]);

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
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type:      "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
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
        (field: "label" | "sublabel" | "owner", value: string) => {
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
    setSelectedEdgeId(edge.id);
    setEdgeEditId(edge.id);
    setEdgeEditLabel(typeof edge.label === "string" ? edge.label : "");
    setEdgeEditPos({ x: event.clientX, y: event.clientY });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeEditId(null);
    setNodePopupOpen(false);
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
    (type: FlowchartData["nodes"][0]["type"]) => {
      const id = `node-${Date.now()}`;
      let position = { x: 200, y: 200 };
      try {
        const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        position = { x: c.x + (Math.random() - 0.5) * 100, y: c.y + (Math.random() - 0.5) * 100 };
      } catch { /* usar posición por defecto */ }

      undoStack.current.push(captureSnapshot());
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);

      const onLabelChange =
        (field: "label" | "sublabel" | "owner", value: string) => {
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

      setNodes((nds) => [
        ...nds,
        {
          id,
          type,
          position,
          data: { label: DEFAULT_LABELS[type] ?? "Nodo", variant: type, onLabelChange },
        } as Node,
      ]);
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes, captureSnapshot]
  );

  // ── Drop handler para drag desde toolbar ──────────────────────────────────
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type");
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type as FlowchartData["nodes"][0]["type"]);
      // Override the random position with the drop position
      setNodes((nds) => {
        const last = nds[nds.length - 1];
        if (last) return [...nds.slice(0, -1), { ...last, position }];
        return nds;
      });
    },
    [screenToFlowPosition, addNode, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // ── Serializar estado actual para guardar ─────────────────────────────────
  const getCurrentData = useCallback(
    (): FlowchartData => ({
      title:       data.title,
      description: data.description,
      nodes: nodes.filter((n) => !n.id.startsWith("__bg_col_") && !n.id.startsWith("__pipeline_")).map((n) => ({
        id:           n.id,
        type:         n.type as string,
        label:        (n.data.label        as string) ?? "",
        sublabel:     (n.data.sublabel     as string | undefined) || undefined,
        owner:        (n.data.owner        as string | undefined) || undefined,
        detail:       (n.data.detail       as string | undefined) || undefined,
        icon:         (n.data.icon         as string | undefined) || undefined,
        pipelineName: (n.data.pipelineName as string | undefined) || undefined,
        position:     n.position,
      })),
      edges: edges.map((e) => {
        const stroke = (e.style as { stroke?: string })?.stroke;
        const dashArray = (e.style as { strokeDasharray?: string })?.strokeDasharray;
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
        };
      }),
    }),
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
  const flowContent = (
    <div className="relative w-full h-full">

      {/* Toolbar lateral izquierda estilo Miro (solo en fullscreen) */}
      {onSave && isFullscreen && (
        <ToolbarSidebar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          nodePopupOpen={nodePopupOpen}
          setNodePopupOpen={setNodePopupOpen}
          addNode={addNode}
          direction={direction}
          onToggleDirection={() => {
            const newDir = direction === "LR" ? "TB" : "LR";
            forceLayoutRef.current = true;
            setDirection(newDir);
            setLayoutTick((t) => t + 1);
            setIsDirty(true);
          }}
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

        {onSave && isDirty && isFullscreen && (
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

        {/* Layout buttons moved to left toolbar */}
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
        connectionMode={isFullscreen ? ConnectionMode.Loose : ConnectionMode.Strict}
        connectionRadius={isFullscreen ? 40 : 0}
        deleteKeyCode={isFullscreen ? ["Delete", "Backspace"] : []}
        multiSelectionKeyCode={isFullscreen ? ["Control", "Meta"] : []}
        selectionOnDrag={false}
        selectionKeyCode={isFullscreen ? ["Control", "Meta"] : []}
        panOnDrag={isFullscreen ? true : false}
        nodesDraggable={isFullscreen}
        nodesConnectable={isFullscreen}
        elementsSelectable={isFullscreen}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.1, maxZoom: isFullscreen ? 1.5 : 0.8 }}
        minZoom={0.1}
        maxZoom={isFullscreen ? 2 : 0.8}
        panOnScroll={isFullscreen}
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch={isFullscreen}
        zoomOnDoubleClick={false}
        preventScrolling={isFullscreen}
        proOptions={{ hideAttribution: true }}
      >
        {isFullscreen && <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />}
        {isFullscreen && <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm !rounded-xl" />}

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

      {/* Leyenda */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
        <LegendItem color="bg-gray-800"   label="Inicio / Fin" />
        <LegendItem color="bg-blue-400"   label="Proceso" />
        <LegendItem color="bg-violet-400" label="Decisión" />
        <LegendItem color="bg-red-400"    label="Dolor" />
        <LegendItem color="bg-amber-400"  label="Anotación" />
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
