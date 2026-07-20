/**
 * components/landing/diagram-static.tsx
 *
 * Render ESTÁTICO (SVG puro, síncrono, cero React Flow) de un FlowchartData —
 * para el PDF (Puppeteer espera `data-pdf-ready` y React Flow monta async con
 * fitView diferido: un canvas interactivo saldría vacío o a medio acomodar).
 * También sirve de fallback imprimible en /print/canvas.
 *
 * Usa las posiciones GUARDADAS si existen; si no, un layout de círculo simple
 * (los mapas de sistemas son chicos: 3-8 nodos). No pretende paridad visual con
 * el viewer — pretende un diagrama legible que imprime siempre.
 */
import type { FC } from "react";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";

const NODE_W = 176;
const NODE_H = 72;
const PAD = 40;

type NodeIn = FlowchartData["nodes"][number];

function positioned(nodes: NodeIn[]): Array<NodeIn & { x: number; y: number }> {
  const withPos = nodes.filter((n) => n.position && Number.isFinite(n.position.x));
  if (withPos.length === nodes.length && nodes.length > 0) {
    return nodes.map((n) => ({ ...n, x: n.position!.x, y: n.position!.y }));
  }
  // Círculo simple: radio proporcional al perímetro necesario.
  const n = nodes.length || 1;
  const radius = Math.max(160, (n * (NODE_W + 80)) / (2 * Math.PI));
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { ...node, x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

export const DiagramStatic: FC<{ diagram: FlowchartData }> = ({ diagram }) => {
  const nodes = positioned(diagram.nodes ?? []);
  if (nodes.length === 0) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const minX = Math.min(...nodes.map((n) => n.x)) - PAD;
  const minY = Math.min(...nodes.map((n) => n.y)) - PAD;
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + PAD;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + PAD;
  const w = maxX - minX;
  const h = maxY - minY;

  const center = (n: { x: number; y: number }) => ({ cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 });

  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{ width: "100%", height: "auto", maxHeight: 560, display: "block" }}
      role="img"
      aria-label={diagram.title ?? "Diagrama de arquitectura"}
    >
      <defs>
        <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#41527a" />
        </marker>
      </defs>

      {/* Edges primero (debajo de los nodos) */}
      {(diagram.edges ?? []).map((e, i) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        const { cx: x1, cy: y1 } = center(s);
        const { cx: x2, cy: y2 } = center(t);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const pending = e.pending === true;
        return (
          <g key={e.id ?? `e${i}`}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={pending ? "#b45309" : "#41527a"} strokeWidth={1.6}
              strokeDasharray={e.dashed || pending ? "6 4" : undefined}
              markerEnd="url(#dg-arrow)"
              markerStart={e.direction === "bidir" ? "url(#dg-arrow)" : undefined}
            />
            {e.label && (
              <g>
                {/* Cajita blanca bajo la etiqueta para que no la corte la línea */}
                <rect
                  x={mx - Math.min(e.label.length, 34) * 3.4} y={my - 20}
                  width={Math.min(e.label.length, 34) * 6.8} height={16}
                  rx={8} fill="#ffffff" stroke="#dbe4f3" strokeWidth={0.75}
                />
                <text x={mx} y={my - 8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={pending ? "#b45309" : "#41527a"}>
                  {pending ? "⚠ " : ""}{e.label.length > 34 ? `${e.label.slice(0, 33)}…` : e.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Nodos */}
      {nodes.map((n) => {
        const isNote = n.type === "annotation" || n.type === "text" || n.type === "info";
        return (
          <g key={n.id}>
            <rect
              x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={14}
              fill={isNote ? "#FBF1E4" : "#ffffff"}
              stroke={isNote ? "#F0D4B4" : "#dbe4f3"} strokeWidth={1.2}
            />
            {n.systemColor && !isNote && (
              <rect x={n.x} y={n.y + 10} width={4} height={NODE_H - 20} rx={2} fill={n.systemColor} />
            )}
            <text x={n.x + NODE_W / 2} y={n.y + (n.sublabel ? 30 : 40)} textAnchor="middle" fontSize={13} fontWeight={700} fill="#051849">
              {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
            </text>
            {n.sublabel && (
              <text x={n.x + NODE_W / 2} y={n.y + 48} textAnchor="middle" fontSize={10.5} fill="#41527a">
                {n.sublabel.length > 28 ? `${n.sublabel.slice(0, 27)}…` : n.sublabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
