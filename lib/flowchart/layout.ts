import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

// Dimensiones por tipo de nodo (deben coincidir con el CSS de cada componente)
const NODE_DIMS: Record<string, { width: number; height: number }> = {
  start:      { width: 180, height: 44  },
  end:        { width: 180, height: 44  },
  process:    { width: 240, height: 80  },
  decision:   { width: 200, height: 80  },
  pain:       { width: 240, height: 80  },
  annotation: { width: 220, height: 64  },
};

const DEFAULT_DIMS = { width: 240, height: 80 };

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
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
    const { width, height } = NODE_DIMS[node.type ?? "process"] ?? DEFAULT_DIMS;
    g.setNode(node.id, { width, height });
  });

  // Solo agregar edges cuyos source y target existen (evita nodos flotantes por JSON malformado)
  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      const { width, height } = NODE_DIMS[node.type ?? "process"] ?? DEFAULT_DIMS;
      // Si dagre no pudo colocar el nodo (NaN), centrarlo en el origen
      const x = isNaN(pos?.x) ? 0 : pos.x - width / 2;
      const y = isNaN(pos?.y) ? 0 : pos.y - height / 2;
      return { ...node, position: { x, y } };
    }),
    edges,
  };
}
