import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

// ── Dimensiones por tipo de nodo ──────────────────────────────────────────────

const NODE_DIMS: Record<string, { width: number; height: number }> = {
  // Nodos clásicos
  start:              { width: 180, height: 44  },
  end:                { width: 180, height: 44  },
  process:            { width: 240, height: 80  },
  decision:           { width: 200, height: 80  },
  pain:               { width: 240, height: 80  },
  annotation:         { width: 220, height: 64  },
  // Nodos de pipeline
  pipeline_stage:     { width: 300, height: 80  },
  column_background:  { width: 340, height: 400 },
  pipeline_title:     { width: 800, height: 36  },
  trigger:            { width: 260, height: 48  },
  action:             { width: 280, height: 90  },
  follow_up:          { width: 240, height: 52  },
  outcome_positive:   { width: 260, height: 60  },
  outcome_negative:   { width: 260, height: 60  },
  lifecycle_change:   { width: 260, height: 70  },
  lead_status:        { width: 240, height: 52  },
};

const DEFAULT_DIMS = { width: 240, height: 80 };

export function getNodeDims(type: string): { width: number; height: number } {
  return NODE_DIMS[type] ?? DEFAULT_DIMS;
}

// ── Layout clásico con Dagre ──────────────────────────────────────────────────

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
): { nodes: Node[]; edges: Edge[] } {
  // Detectar si es un diagrama de pipeline (tiene nodos pipeline_stage)
  const hasPipelineNodes = nodes.some((n) =>
    ["pipeline_stage", "trigger", "action", "follow_up", "outcome_positive", "outcome_negative", "lifecycle_change", "lead_status"].includes(n.type ?? "")
  );

  if (hasPipelineNodes) {
    return getPipelineLayout(nodes, edges);
  }

  return getDagreLayout(nodes, edges, direction);
}

// ── Dagre layout (diagramas clásicos) ─────────────────────────────────────────

function getDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir:  direction,
    ranksep:  direction === "LR" ? 80 : 70,
    nodesep:  direction === "LR" ? 40 : 50,
    edgesep:  20,
    marginx:  20,
    marginy:  20,
  });

  const nodeIds = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    const { width, height } = getNodeDims(node.type ?? "process");
    g.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      const { width, height } = getNodeDims(node.type ?? "process");
      const x = isNaN(pos?.x) ? 0 : pos.x - width / 2;
      const y = isNaN(pos?.y) ? 0 : pos.y - height / 2;
      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

// ── Pipeline columnar layout ──────────────────────────────────────────────────
// Cada pipeline_stage define una columna. Los nodos se distribuyen verticalmente
// dentro de su columna, y las columnas van de izquierda a derecha.

function getPipelineLayout(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const MAIN_COL_WIDTH = 340;   // ancho del carril principal (camino feliz)
  const SIDE_COL_WIDTH = 280;   // ancho del carril lateral (camino negativo)
  const STAGE_GAP = 100;        // gap horizontal entre etapas completas
  const ROW_GAP = 56;           // gap vertical entre nodos
  const SIDE_OFFSET_X = 30;     // offset X del carril lateral respecto al borde derecho del principal
  const START_X = 40;
  const START_Y = 80;
  const CONTENT_PADDING = 20;
  const HEADER_OFFSET = 16;

  const stageNodes = nodes.filter((n) => n.type === "pipeline_stage");
  if (stageNodes.length === 0) return getDagreLayout(nodes, edges, "LR");

  // ── Build edge maps ──
  const outEdges = new Map<string, Array<{ target: string; edgeType?: string }>>();
  edges.forEach((e) => {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    const et = (e as { edgeType?: string }).edgeType ??
      ((e.style as { stroke?: string })?.stroke === "#22c55e" ? "yes" :
       (e.style as { stroke?: string })?.stroke === "#ef4444" ? "no" : "default");
    outEdges.get(e.source)!.push({ target: e.target, edgeType: et });
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // ── Negative types: nodos que van al carril lateral ──
  const NEGATIVE_TYPES = new Set(["outcome_negative", "lifecycle_change", "lead_status"]);

  // ── Assign nodes to stages via BFS, tracking main vs side lane ──
  type LaneInfo = { col: number; lane: "main" | "side" };
  const nodeToLane = new Map<string, LaneInfo>();
  const stageMainNodes: Map<number, Node[]> = new Map();
  const stageSideNodes: Map<number, Node[]> = new Map();

  stageNodes.forEach((stage, colIdx) => {
    nodeToLane.set(stage.id, { col: colIdx, lane: "main" });
    stageMainNodes.set(colIdx, [stage]);
    stageSideNodes.set(colIdx, []);
  });

  const visited = new Set<string>(stageNodes.map((s) => s.id));
  const queue: Array<{ nodeId: string; col: number; lane: "main" | "side" }> = [];

  // Seed BFS from each stage
  stageNodes.forEach((stage, colIdx) => {
    (outEdges.get(stage.id) ?? []).forEach(({ target }) => {
      if (!visited.has(target)) queue.push({ nodeId: target, col: colIdx, lane: "main" });
    });
  });

  while (queue.length > 0) {
    const { nodeId, col, lane } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Determine lane: if this is a negative type or already on side lane, stay on side
    const effectiveLane = NEGATIVE_TYPES.has(node.type ?? "") ? "side" : lane;
    nodeToLane.set(nodeId, { col, lane: effectiveLane });

    if (effectiveLane === "main") {
      stageMainNodes.get(col)!.push(node);
    } else {
      stageSideNodes.get(col)!.push(node);
    }

    // Follow edges
    (outEdges.get(nodeId) ?? []).forEach(({ target, edgeType }) => {
      if (visited.has(target)) return;
      const targetNode = nodeMap.get(target);
      if (!targetNode) return;

      // If target is a pipeline_stage, don't enqueue (already assigned)
      if (targetNode.type === "pipeline_stage") return;

      // If this is a "no" edge from a decision, the target goes to side lane
      const isNoEdge = edgeType === "no";
      const targetLane = isNoEdge || NEGATIVE_TYPES.has(targetNode.type ?? "") ? "side" : effectiveLane;
      queue.push({ nodeId: target, col, lane: targetLane });
    });
  }

  // Assign unvisited nodes to last column main lane
  nodes.forEach((node) => {
    if (!visited.has(node.id) && node.type !== "pipeline_stage") {
      const lastCol = stageNodes.length - 1;
      nodeToLane.set(node.id, { col: lastCol, lane: "main" });
      stageMainNodes.get(lastCol)!.push(node);
    }
  });

  // Also handle pain/annotation: they go to side if connected from main via lateral edge
  // (already handled by BFS since pain connects from main nodes)

  // ── Position nodes ──
  const positionedNodes: Node[] = [];
  const columnHeights = new Map<number, number>();

  for (let col = 0; col < stageNodes.length; col++) {
    const stageX = START_X + col * (MAIN_COL_WIDTH + SIDE_COL_WIDTH + SIDE_OFFSET_X + STAGE_GAP);
    const sideX = stageX + MAIN_COL_WIDTH + SIDE_OFFSET_X;

    // Position main lane nodes
    const mainNodes = stageMainNodes.get(col) ?? [];
    let mainY = START_Y + CONTENT_PADDING;
    for (const node of mainNodes) {
      const dims = getNodeDims(node.type ?? "process");
      const x = stageX + CONTENT_PADDING + (MAIN_COL_WIDTH - CONTENT_PADDING * 2 - dims.width) / 2;
      const gap = node.type === "pipeline_stage" ? HEADER_OFFSET : 0;
      positionedNodes.push({ ...node, position: { x, y: mainY } });
      mainY += dims.height + ROW_GAP + gap;
    }

    // Position side lane nodes — start at the Y of the first decision in main lane
    const sideNodes = stageSideNodes.get(col) ?? [];
    if (sideNodes.length > 0) {
      // Find Y of the first decision node or the node that connects to side
      const firstDecision = mainNodes.find((n) => n.type === "decision");
      const decisionPos = firstDecision
        ? positionedNodes.find((n) => n.id === firstDecision.id)?.position
        : null;
      let sideY = decisionPos ? decisionPos.y + getNodeDims("decision").height + ROW_GAP : START_Y + CONTENT_PADDING + 200;

      for (const node of sideNodes) {
        const dims = getNodeDims(node.type ?? "process");
        const x = sideX + (SIDE_COL_WIDTH - dims.width) / 2;
        positionedNodes.push({ ...node, position: { x, y: sideY } });
        sideY += dims.height + ROW_GAP;
      }

      const maxSide = sideY;
      const currentMax = columnHeights.get(col) ?? 0;
      if (maxSide > currentMax) columnHeights.set(col, maxSide);
    }

    const currentMax = columnHeights.get(col) ?? 0;
    if (mainY > currentMax) columnHeights.set(col, mainY);
  }

  // ── Background nodes ──
  const maxHeight = Math.max(...Array.from(columnHeights.values()), 400);
  const bgNodes: Node[] = [];

  // Pipeline title
  const pipelineName = stageNodes[0]?.data?.pipelineName as string | undefined;
  if (pipelineName) {
    const totalWidth = stageNodes.length * (MAIN_COL_WIDTH + SIDE_COL_WIDTH + SIDE_OFFSET_X + STAGE_GAP) - STAGE_GAP;
    bgNodes.push({
      id: "__pipeline_title",
      type: "pipeline_title",
      position: { x: START_X, y: 10 },
      data: { label: pipelineName, width: totalWidth },
      style: { zIndex: 0 },
    });
  }

  // Column backgrounds (main lane only — side lane is open)
  for (let col = 0; col < stageNodes.length; col++) {
    const bgX = START_X + col * (MAIN_COL_WIDTH + SIDE_COL_WIDTH + SIDE_OFFSET_X + STAGE_GAP);
    bgNodes.push({
      id: `__bg_col_${col}`,
      type: "column_background",
      position: { x: bgX, y: START_Y },
      data: { label: "", width: MAIN_COL_WIDTH, height: maxHeight - START_Y + CONTENT_PADDING },
      style: { zIndex: -1 },
      selectable: false,
      draggable: false,
    });
  }

  return { nodes: [...bgNodes, ...positionedNodes], edges };
}
