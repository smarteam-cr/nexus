"use client";

import { useState } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { EditableText } from "./nodes";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NodeData {
  label: string;
  sublabel?: string;
  detail?: string;
  icon?: string;
  owner?: string;
  variant?: string;
  pipelineName?: string;
  onLabelChange?: (field: "label" | "sublabel" | "owner" | "detail", value: string) => void;
  [key: string]: unknown;
}

const HS: React.CSSProperties = {
  background: "#94a3b8",
  border: "2px solid white",
  width: 8,
  height: 8,
  borderRadius: "50%",
};

function h(color: string): React.CSSProperties {
  return { ...HS, background: color };
}

// ── PipelineTitleNode ─────────────────────────────────────────────────────────

export function PipelineTitleNode({ data, selected }: { data: NodeData & { width?: number; fontSize?: number }; selected?: boolean }) {
  const [fontSize, setFontSize] = useState(data.fontSize ?? 18);

  return (
    <>
      <NodeResizer
        isVisible={selected ?? false}
        minWidth={200}
        minHeight={32}
        lineStyle={{ borderColor: "#cbd5e1", borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: "#94a3b8", border: "1px solid white" }}
        onResize={(_event, params) => {
          const newSize = Math.max(12, Math.min(48, params.height * 0.6));
          setFontSize(newSize);
        }}
      />
      <div className="group/node flex items-center gap-3 whitespace-nowrap px-2 py-1 w-full h-full">
        <div className="rounded-full bg-green-500 flex-shrink-0" style={{ width: Math.max(10, fontSize * 0.7), height: Math.max(10, fontSize * 0.7) }} />
        <EditableText
          value={data.label}
          field="label"
          onLabelChange={data.onLabelChange}
          className="font-bold text-gray-700 uppercase tracking-wider"
          style={{ fontSize }}
        />
      </div>
    </>
  );
}

// ── ColumnBackgroundNode ──────────────────────────────────────────────────────

export function ColumnBackgroundNode({ data }: { data: NodeData & { width?: number; height?: number } }) {
  return (
    <div
      style={{
        width: data.width ?? 340,
        height: data.height ?? 400,
        pointerEvents: "none",
      }}
      className="rounded-2xl bg-transparent"
    />
  );
}

// ── Íconos de acción ─────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  email: "✉️",
  whatsapp: "📱",
  call: "📞",
  task: "📋",
  form: "📄",
  workflow: "⚙️",
  meeting: "📅",
  lifecycle: "🔄",
  default: "▶️",
};

// ── PipelineStageNode ─────────────────────────────────────────────────────────

export function PipelineStageNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 300 }}
      className="group/node bg-white rounded-xl border-2 border-green-400 shadow-md overflow-hidden"
    >
      <Handle type="target" position={Position.Left} id="l" style={h("#4ade80")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#4ade80")} />
      <div className="border-t-[5px] border-green-500" />
      <div className="px-4 py-3">
        <EditableText
          value={data.label}
          field="label"
          onLabelChange={data.onLabelChange}
          className="text-sm font-bold text-gray-900 leading-snug block w-full"
        />
        {/* Solo si hay descripción — el placeholder "Descripción..." en cada etapa vacía era ruido. */}
        {data.sublabel && (
          <EditableText
            value={data.sublabel}
            field="sublabel"
            onLabelChange={data.onLabelChange}
            className="text-xs text-gray-500 mt-0.5 block w-full"
          />
        )}
      </div>
    </div>
  );
}

// ── TriggerNode ───────────────────────────────────────────────────────────────

export function TriggerNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 260 }}
      className="group/node bg-green-600 rounded-full px-4 py-2.5 text-white shadow-md flex items-center justify-center gap-2"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#22c55e")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#22c55e")} />
      <span className="text-sm">⚡</span>
      <EditableText
        value={data.label}
        field="label"
        onLabelChange={data.onLabelChange}
        className="text-xs font-semibold leading-tight text-center"
      />
    </div>
  );
}

// ── ActionNode ────────────────────────────────────────────────────────────────

export function ActionNode({ data }: { data: NodeData }) {
  const icon = ACTION_ICONS[data.icon ?? "default"] ?? ACTION_ICONS.default;
  return (
    <div
      style={{ width: 280 }}
      className="group/node bg-green-50 rounded-xl border border-green-200 shadow-sm overflow-hidden"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#86efac")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#86efac")} />
      <Handle type="source" position={Position.Right} id="r" style={h("#fca5a5")} />
      <div className="flex">
        <div className="w-9 bg-green-100 flex items-center justify-center flex-shrink-0 border-r border-green-200">
          <span className="text-base">{icon}</span>
        </div>
        <div className="px-3 py-2.5 flex-1 min-w-0 space-y-0.5">
          <EditableText
            value={data.sublabel ?? "Acción"}
            field="sublabel"
            onLabelChange={data.onLabelChange}
            className="text-2xs text-green-600 font-semibold uppercase tracking-wider block w-full"
          />
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            className="text-xs font-medium text-gray-800 leading-snug block w-full"
          />
          {(data.detail || data.onLabelChange) && (
            <EditableText
              value={data.owner ?? data.detail ?? ""}
              field="owner"
              onLabelChange={data.onLabelChange}
              placeholder="Detalle..."
              className="text-2xs text-gray-500 leading-snug block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── FollowUpNode ──────────────────────────────────────────────────────────────

export function FollowUpNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 240 }}
      className="group/node bg-green-100 rounded-lg border border-green-300 shadow-sm px-3 py-2 flex items-center gap-2"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#6ee7b7")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#6ee7b7")} />
      <span className="text-sm flex-shrink-0">🕐</span>
      <div className="min-w-0 flex-1">
        <EditableText
          value={data.label}
          field="label"
          onLabelChange={data.onLabelChange}
          className="text-xs font-medium text-green-800 leading-snug block w-full"
        />
        <EditableText
          value={data.sublabel ?? ""}
          field="sublabel"
          onLabelChange={data.onLabelChange}
          placeholder="Timing..."
          className="text-2xs text-green-600 block w-full"
        />
      </div>
    </div>
  );
}

// ── OutcomePositiveNode ───────────────────────────────────────────────────────

export function OutcomePositiveNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 260 }}
      className="group/node bg-indigo-50 rounded-xl border-2 border-indigo-300 shadow-sm px-3 py-2.5"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#818cf8")} />
      <Handle type="source" position={Position.Right} id="r" style={h("#818cf8")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#818cf8")} />
      <div className="flex items-center gap-2">
        <span className="text-sm flex-shrink-0">✅</span>
        <div className="min-w-0 flex-1">
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            className="text-xs font-semibold text-indigo-800 leading-snug block w-full"
          />
          {(data.sublabel || data.onLabelChange) && (
            <EditableText
              value={data.sublabel ?? ""}
              field="sublabel"
              onLabelChange={data.onLabelChange}
              placeholder="Detalle..."
              className="text-2xs text-indigo-500 mt-0.5 block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── OutcomeNegativeNode ───────────────────────────────────────────────────────

export function OutcomeNegativeNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 260 }}
      className="group/node bg-red-50 rounded-xl border-2 border-red-300 shadow-sm px-3 py-2.5"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#f87171")} />
      <Handle type="target" position={Position.Left} id="l" style={h("#f87171")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#f87171")} />
      <div className="flex items-center gap-2">
        <span className="text-sm flex-shrink-0">❌</span>
        <div className="min-w-0 flex-1">
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            className="text-xs font-semibold text-red-700 leading-snug block w-full"
          />
          {(data.sublabel || data.onLabelChange) && (
            <EditableText
              value={data.sublabel ?? ""}
              field="sublabel"
              onLabelChange={data.onLabelChange}
              placeholder="Detalle..."
              className="text-2xs text-red-500 mt-0.5 block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── LifecycleChangeNode ──────────────────────────────────────────────────────

export function LifecycleChangeNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 260 }}
      className="group/node bg-green-50 rounded-xl border border-green-300 shadow-sm px-3 py-2"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#4ade80")} />
      <Handle type="source" position={Position.Bottom} id="b" style={h("#4ade80")} />
      <div className="flex items-center gap-2">
        <span className="text-sm flex-shrink-0">🔄</span>
        <div className="min-w-0 flex-1">
          <div className="text-2xs text-green-600 font-semibold uppercase tracking-wider">
            Etapa del Ciclo de Vida
          </div>
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            className="text-xs font-medium text-green-800 leading-snug block w-full"
          />
          {(data.detail || data.onLabelChange) && (
            <EditableText
              value={data.owner ?? data.detail ?? ""}
              field="owner"
              onLabelChange={data.onLabelChange}
              placeholder="Configuración..."
              className="text-2xs text-green-500 italic block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── LeadStatusNode ───────────────────────────────────────────────────────────

export function LeadStatusNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{ width: 240 }}
      className="group/node bg-gray-100 rounded-xl border border-gray-300 shadow-sm px-3 py-2"
    >
      <Handle type="target" position={Position.Top} id="t" style={h("#9ca3af")} />
      <div className="text-2xs text-gray-500 font-semibold uppercase tracking-wider">
        Estado del lead
      </div>
      <EditableText
        value={data.label}
        field="label"
        onLabelChange={data.onLabelChange}
        className="text-xs font-medium text-gray-700 leading-snug block w-full"
      />
    </div>
  );
}
