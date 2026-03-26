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
  text:               { width: 160, height: 32  },
  // Nodos de pipeline
  pipeline_stage:     { width: 300, height: 80  },
  column_background:  { width: 340, height: 400 },
  pipeline_title:     { width: 800, height: 48  },
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
    return getPipelineLayout(nodes, edges, direction);
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
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
): { nodes: Node[]; edges: Edge[] } {
  const MAIN_COL_WIDTH = 340;   // ancho del carril principal (camino feliz)
  const SIDE_COL_WIDTH = 280;   // ancho del carril lateral (camino negativo)
  const STAGE_GAP = direction === "LR" ? 100 : 60;  // gap entre etapas
  const ROW_GAP = 56;           // gap vertical entre nodos
  const SIDE_OFFSET_X = 30;     // offset X del carril lateral
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
  const NEGATIVE_TYPES = new Set(["outcome_negative", "lifecycle_change", "lead_status", "pain", "annotation"]);

  // ── Build reverse edge map (target → source) for pain alignment ──
  const inEdges = new Map<string, string>();
  edges.forEach((e) => {
    if (!inEdges.has(e.target)) inEdges.set(e.target, e.source);
  });

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
  let accumulatedY = START_Y; // For TB mode: tracks where the next stage starts

  for (let col = 0; col < stageNodes.length; col++) {
    // LR: stages go left-to-right. TB: stages stack top-to-bottom
    const stageX = direction === "LR"
      ? START_X + col * (MAIN_COL_WIDTH + SIDE_COL_WIDTH + SIDE_OFFSET_X + STAGE_GAP)
      : START_X;
    const sideX = stageX + MAIN_COL_WIDTH + SIDE_OFFSET_X;
    const stageStartY = direction === "LR" ? START_Y : accumulatedY;

    // Position main lane nodes
    const mainNodes = stageMainNodes.get(col) ?? [];
    let mainY = stageStartY + CONTENT_PADDING;
    for (const node of mainNodes) {
      const dims = getNodeDims(node.type ?? "process");
      const x = stageX + CONTENT_PADDING + (MAIN_COL_WIDTH - CONTENT_PADDING * 2 - dims.width) / 2;
      const gap = node.type === "pipeline_stage" ? HEADER_OFFSET : 0;
      positionedNodes.push({ ...node, position: { x, y: mainY } });
      mainY += dims.height + ROW_GAP + gap;
    }

    // Position side lane nodes
    // Two types: lateral (pain/annotation → align with parent Y) and chain (outcome/lifecycle/lead_status → stack sequentially)
    const sideNodes = stageSideNodes.get(col) ?? [];
    if (sideNodes.length > 0) {
      const LATERAL_TYPES = new Set(["pain", "annotation"]);

      // Build a map of ALL positioned nodes for Y lookup (both main and already-positioned side)
      const posMap = new Map<string, { x: number; y: number }>();
      positionedNodes.forEach((n) => posMap.set(n.id, n.position));

      // Separate lateral nodes from chain nodes
      const lateralNodes = sideNodes.filter((n) => LATERAL_TYPES.has(n.type ?? ""));
      const chainNodes = sideNodes.filter((n) => !LATERAL_TYPES.has(n.type ?? ""));

      // Track used Y ranges in side lane to avoid overlaps
      const usedSideRanges: Array<{ top: number; bottom: number }> = [];

      // 1. Position chain nodes FIRST (outcome_negative → lifecycle → lead_status)
      //    These have a predictable position: below the decision that feeds them
      if (chainNodes.length > 0) {
        const firstChainSource = inEdges.get(chainNodes[0]?.id ?? "");
        const firstChainSourcePos = firstChainSource ? posMap.get(firstChainSource) : null;
        const firstChainSourceDims = firstChainSource
          ? getNodeDims(nodeMap.get(firstChainSource)?.type ?? "process")
          : { height: 80 };
        let chainY = firstChainSourcePos
          ? firstChainSourcePos.y + firstChainSourceDims.height + ROW_GAP
          : mainY;

        for (const node of chainNodes) {
          const dims = getNodeDims(node.type ?? "process");
          const x = sideX + (SIDE_COL_WIDTH - dims.width) / 2;
          positionedNodes.push({ ...node, position: { x, y: chainY } });
          posMap.set(node.id, { x, y: chainY });
          usedSideRanges.push({ top: chainY, bottom: chainY + dims.height });
          chainY += dims.height + ROW_GAP;
        }
      }

      // 2. Position lateral nodes (pain/annotation) — aligned with source Y, avoiding chain ranges
      for (const node of lateralNodes) {
        const dims = getNodeDims(node.type ?? "process");
        const x = sideX + (SIDE_COL_WIDTH - dims.width) / 2;

        const sourceId = inEdges.get(node.id);
        const sourcePos = sourceId ? posMap.get(sourceId) : null;
        const desiredY = sourcePos ? sourcePos.y : stageStartY + CONTENT_PADDING + 200;

        // Find safe Y that doesn't overlap with chain or other laterals
        let safeY = desiredY;
        let attempts = 0;
        while (attempts < 30) {
          const overlaps = usedSideRanges.some(
            (r) => safeY < r.bottom + ROW_GAP / 2 && safeY + dims.height > r.top - ROW_GAP / 2
          );
          if (!overlaps) break;
          // Try above first (move up), then below
          if (attempts % 2 === 0) {
            safeY = desiredY - (Math.floor(attempts / 2) + 1) * (dims.height + ROW_GAP);
            if (safeY < START_Y) safeY = desiredY + (Math.floor(attempts / 2) + 1) * (dims.height + ROW_GAP);
          } else {
            safeY = desiredY + (Math.floor(attempts / 2) + 1) * (dims.height + ROW_GAP);
          }
          attempts++;
        }

        positionedNodes.push({ ...node, position: { x, y: safeY } });
        posMap.set(node.id, { x, y: safeY });
        usedSideRanges.push({ top: safeY, bottom: safeY + dims.height });
      }

      const maxSide = usedSideRanges.length > 0
        ? Math.max(...usedSideRanges.map((r) => r.bottom + ROW_GAP))
        : 0;
      const currentMax = columnHeights.get(col) ?? 0;
      if (maxSide > currentMax) columnHeights.set(col, maxSide);
    }

    const currentMax = columnHeights.get(col) ?? 0;
    if (mainY > currentMax) columnHeights.set(col, mainY);

    // For TB mode: advance accumulatedY past this stage's content
    if (direction === "TB") {
      const stageHeight = Math.max(mainY, columnHeights.get(col) ?? 0) - stageStartY;
      accumulatedY = stageStartY + stageHeight + STAGE_GAP;
    }
  }

  // ── Background nodes ──
  const maxHeight = Math.max(...Array.from(columnHeights.values()), 400);
  const bgNodes: Node[] = [];

  // Pipeline title — auto-width based on text
  const pipelineName = stageNodes[0]?.data?.pipelineName as string | undefined;
  if (pipelineName) {
    bgNodes.push({
      id: "__pipeline_title",
      type: "pipeline_title",
      position: { x: START_X, y: 10 },
      data: { label: pipelineName },
      style: { zIndex: 0 },
    });
  }

  // Column backgrounds — skip in TB mode (stages already visually separated by vertical gap)
  if (direction === "LR") {
    const maxHeight = Math.max(...Array.from(columnHeights.values()), 400);
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
  }

  return { nodes: [...bgNodes, ...positionedNodes], edges };
}
