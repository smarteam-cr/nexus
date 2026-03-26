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

const ADD_NODE_OPTIONS: { type: FlowchartData["nodes"][0]["type"]; label: string; color: string }[] = [
  { type: "process",    label: "Proceso",  color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  { type: "decision",   label: "Decisión", color: "bg-violet-100 text-violet-700 hover:bg-violet-200" },
  { type: "pain",       label: "Dolor",    color: "bg-red-100 text-red-700 hover:bg-red-200" },
  { type: "annotation", label: "Nota",     color: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  { type: "start",      label: "Inicio",   color: "bg-gray-200 text-gray-700 hover:bg-gray-300" },
  { type: "end",        label: "Fin",      color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
];

const DEFAULT_LABELS: Record<string, string> = {
  start: "Inicio", end: "Fin", process: "Nuevo proceso",
  decision: "¿Decisión?", pain: "Punto de dolor", annotation: "Anotación",
};

// ── Componente interno (dentro del Provider) ──────────────────────────────────

function FlowchartInner({
  data,
  onSave,
}: {
  data: FlowchartData;
  onSave?: (updated: FlowchartData) => Promise<void>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [direction, setDirection] = useState<"TB" | "LR">("LR");
  const [isDirty, setIsDirty]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

      const rawNodes: Node[] = data.nodes.map((n) => ({
        id:       n.id,
        type:     n.type,
        position: hasSavedPositions ? (n.position ?? { x: 0, y: 0 }) : { x: 0, y: 0 },
        data: {
          label:         n.label,
          sublabel:      n.sublabel,
          owner:         n.owner,
          detail:        n.detail,
          icon:          n.icon,
          pipelineName:  n.pipelineName,
          variant:       n.type,
          onLabelChange: makeOnLabelChange(n.id),
        },
      }));

      const rawEdges: Edge[] = data.edges.map((e, i) => {
        const color = edgeColor(e.edgeType);
        const isDashed = e.edgeType === "yes" || e.edgeType === "no";
        return {
        id:           e.id ?? `e${i}`,
        source:       e.source,
        target:       e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
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
      if (hasSavedPositions && !forceLayoutRef.current) {
        setNodes(rawNodes);
        setEdges(rawEdges);
      } else {
        try {
          const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges, dir);
          setNodes(injectEditHandlers(ln));
          setEdges(le);
        } catch {
          setNodes(rawNodes);
          setEdges(rawEdges);
        }
      }
      forceLayoutRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, setNodes, setEdges, captureSnapshot]
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
      edges: edges.map((e) => ({
        id:           e.id,
        source:       e.source,
        target:       e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        label:        typeof e.label === "string" ? e.label : undefined,
        edgeType:
          (e.style as { stroke?: string })?.stroke === "#22c55e" ? "yes"
          : (e.style as { stroke?: string })?.stroke === "#ef4444" ? "no"
          : "default",
      })),
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

  // Escape en fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isFullscreen]);

  // ── Render ────────────────────────────────────────────────────────────────
  const flowContent = (
    <div className="relative w-full h-full">

      {/* Panel: agregar nodo */}
      {onSave && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
          <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide mr-0.5">
            + Agregar
          </span>
          {ADD_NODE_OPTIONS.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              title={`Agregar nodo: ${label}`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${color}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-1 text-[9px] text-gray-300" title="Selecciona y presiona Delete para borrar">
            Del = borrar
          </span>
        </div>
      )}

      {/* Toolbar derecha: undo/redo, guardar, pantalla completa, dirección */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {(canUndo || canRedo) && (
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

        {onSave && isDirty && (
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

        <button
          onClick={() => { forceLayoutRef.current = true; setDirection("TB"); setIsDirty(true); }}
          title="Flujo vertical"
          className={`p-1.5 rounded-lg border text-xs transition-colors ${
            direction === "TB" ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <button
          onClick={() => { forceLayoutRef.current = true; setDirection("LR"); setIsDirty(true); }}
          title="Flujo horizontal"
          className={`p-1.5 rounded-lg border text-xs transition-colors ${
            direction === "LR" ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onBeforeDelete={onBeforeDelete}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onInit={(instance) => { rfInstance.current = instance; }}
        nodeTypes={NODE_TYPES}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        deleteKeyCode={["Delete", "Backspace"]}
        multiSelectionKeyCode="Shift"
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        fitViewOptions={{ padding: 0.2, minZoom: 0.4 }}
        minZoom={0.2}
        maxZoom={2}
        panOnScroll
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-sm !rounded-xl" />

        {/* Guías de alineación */}
        {guidelines.length > 0 && <SnapGuidelines guidelines={guidelines} />}
      </ReactFlow>

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
    <div className="relative w-full" style={{ height: 600 }}>
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
