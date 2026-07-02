"use client";

/**
 * Nodos del diagrama de INTEGRACIÓN (mapa de sistemas). Cada nodo es un SISTEMA /
 * herramienta (HubSpot, Odoo, SAP, POS, ecommerce…) como caja de color; las flechas
 * etiquetadas llevan el dato que fluye. Se enruta con `getIntegrationLayout`
 * (lib/flowchart/layout.ts) cuando el diagrama tiene nodos `type: "system"`.
 *
 * El color sale de `data.systemColor` (lo puede fijar el agente, ej. HubSpot naranja);
 * si no, se deriva estable del nombre del sistema (misma herramienta → mismo color).
 */
import { Handle, Position } from "@xyflow/react";
import { EditableText } from "./nodes";

interface NodeData {
  label: string;
  sublabel?: string;
  systemColor?: string;
  icon?: string;
  onLabelChange?: (field: "label" | "sublabel" | "owner" | "detail", value: string) => void;
  [key: string]: unknown;
}

function handleStyle(color: string): React.CSSProperties {
  return { background: color, border: "2px solid white", width: 10, height: 10, borderRadius: "50%" };
}

// Color por defecto si el agente no manda systemColor: estable por nombre del sistema.
const PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#ef4444"];
function colorFor(data: NodeData): string {
  if (typeof data.systemColor === "string" && /^#[0-9a-fA-F]{6}$/.test(data.systemColor)) return data.systemColor;
  const s = (data.label ?? "").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function SystemNode({ data }: { data: NodeData }) {
  const color = colorFor(data);
  const hs = handleStyle(color);
  return (
    <div
      style={{ width: 168, minHeight: 88, borderColor: color, backgroundColor: `${color}1a` }}
      className="group/node shadow-sm border-2 rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center px-3 py-3"
    >
      {/* 4 handles source (ids t/r/b/l) — sirven para ambos extremos en edges predefinidos,
          igual que el resto de los nodos. getIntegrationLayout asigna el lado por posición. */}
      <Handle type="source" position={Position.Top} id="t" style={hs} />
      <Handle type="source" position={Position.Right} id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left} id="l" style={hs} />
      {data.icon && <span className="text-xl leading-none mb-1">{data.icon}</span>}
      <EditableText
        value={data.label}
        field="label"
        onLabelChange={data.onLabelChange}
        className="text-sm font-bold leading-tight block w-full"
        style={{ color }}
      />
      {data.sublabel && (
        <EditableText
          value={data.sublabel}
          field="sublabel"
          onLabelChange={data.onLabelChange}
          className="text-2xs mt-0.5 block w-full"
          style={{ color, opacity: 0.78 }}
        />
      )}
    </div>
  );
}
