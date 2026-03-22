"use client";

import { useRef, useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";

// ── Tipos compartidos ─────────────────────────────────────────────────────────

interface NodeData {
  label: string;
  sublabel?: string;
  owner?: string;
  variant?: string;
  onLabelChange?: (field: "label" | "sublabel" | "owner", value: string) => void;
  [key: string]: unknown;
}

// ── Estilos de handles ────────────────────────────────────────────────────────
// Sin `position: relative` en el contenedor del nodo para que React Flow
// posicione los handles correctamente relativo al wrapper exterior.

function makeHandleStyle(color: string): React.CSSProperties {
  return {
    background:   color,
    border:       "2px solid white",
    width:        10,
    height:       10,
    borderRadius: "50%",
  };
}

// ── EditableText ──────────────────────────────────────────────────────────────

function EditableText({
  value,
  field,
  onLabelChange,
  className = "",
  placeholder,
  multiline = false,
}: {
  value: string;
  field: "label" | "sublabel" | "owner";
  onLabelChange?: NodeData["onLabelChange"];
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim() || value;
    if (next !== value) onLabelChange?.(field, next);
    else setDraft(value);
  };

  if (!onLabelChange) return <span className={className}>{value}</span>;

  if (editing) {
    const base = "nodrag nowheel w-full bg-white border border-blue-400 rounded px-1 py-0.5 outline-none ring-1 ring-blue-300 leading-snug";
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className={`${base} resize-none text-xs ${className}`}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`${base} text-xs ${className}`}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      title="Doble clic para editar"
      className={`cursor-text select-text group-hover/node:underline group-hover/node:decoration-dashed group-hover/node:decoration-gray-300 ${className}`}
    >
      {value || <span className="italic text-gray-300">{placeholder}</span>}
    </span>
  );
}

// ── StartEndNode ──────────────────────────────────────────────────────────────

export function StartEndNode({ data, type }: { data: NodeData; type?: string }) {
  const isEnd = type === "end" || data.variant === "end";
  const color  = isEnd ? "#059669" : "#374151";
  const hs     = makeHandleStyle(color);
  return (
    <div
      style={{ width: 180 }}
      className={`group/node flex items-center justify-center px-4 py-2.5 rounded-full text-white text-xs font-semibold shadow-sm ${
        isEnd ? "bg-emerald-600" : "bg-gray-800"
      }`}
    >
      <Handle type="source" position={Position.Top}    id="t" style={hs} />
      <Handle type="source" position={Position.Right}  id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left}   id="l" style={hs} />
      <EditableText
        value={data.label}
        field="label"
        onLabelChange={data.onLabelChange}
        className="text-center leading-tight font-semibold"
      />
    </div>
  );
}

// ── ProcessNode ───────────────────────────────────────────────────────────────

export function ProcessNode({ data }: { data: NodeData }) {
  const hs = makeHandleStyle("#93c5fd");
  return (
    <div
      style={{ width: 240 }}
      className="group/node bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <Handle type="source" position={Position.Top}    id="t" style={hs} />
      <Handle type="source" position={Position.Right}  id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left}   id="l" style={hs} />
      <div className="flex">
        <div className="w-1 bg-blue-400 flex-shrink-0 rounded-l-xl" />
        <div className="px-3 py-2.5 flex-1 min-w-0 space-y-0.5">
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            multiline
            className="text-xs font-semibold text-gray-800 leading-snug block w-full"
          />
          {(data.sublabel !== undefined || data.onLabelChange) && (
            <EditableText
              value={data.sublabel ?? ""}
              field="sublabel"
              onLabelChange={data.onLabelChange}
              placeholder="Subtítulo..."
              className="text-2xs text-gray-400 leading-snug block w-full"
            />
          )}
          {(data.owner !== undefined || data.onLabelChange) && (
            <EditableText
              value={data.owner ?? ""}
              field="owner"
              onLabelChange={data.onLabelChange}
              placeholder="Responsable..."
              className="text-2xs text-blue-500 font-medium block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── DecisionNode ──────────────────────────────────────────────────────────────

export function DecisionNode({ data }: { data: NodeData }) {
  const hs = makeHandleStyle("#a78bfa");
  return (
    <div
      style={{ width: 200 }}
      className="group/node bg-violet-50 rounded-xl border border-violet-200 shadow-sm px-3 py-2.5"
    >
      <Handle type="source" position={Position.Top}    id="t" style={hs} />
      <Handle type="source" position={Position.Right}  id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left}   id="l" style={hs} />
      <div className="flex items-start gap-2">
        <span className="text-violet-500 text-sm flex-shrink-0 mt-0.5">◆</span>
        <EditableText
          value={data.label}
          field="label"
          onLabelChange={data.onLabelChange}
          multiline
          className="text-xs font-semibold text-violet-800 leading-snug block w-full"
        />
      </div>
      {(data.sublabel !== undefined || data.onLabelChange) && (
        <div className="ml-5 mt-1">
          <EditableText
            value={data.sublabel ?? ""}
            field="sublabel"
            onLabelChange={data.onLabelChange}
            placeholder="Subtítulo..."
            className="text-2xs text-violet-500 leading-snug block w-full"
          />
        </div>
      )}
    </div>
  );
}

// ── PainNode ──────────────────────────────────────────────────────────────────

export function PainNode({ data }: { data: NodeData }) {
  const hs = makeHandleStyle("#fca5a5");
  return (
    <div
      style={{ width: 240 }}
      className="group/node bg-red-50 rounded-xl border border-red-200 shadow-sm px-3 py-2.5"
    >
      <Handle type="source" position={Position.Top}    id="t" style={hs} />
      <Handle type="source" position={Position.Right}  id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left}   id="l" style={hs} />
      <div className="flex items-start gap-2">
        <span className="text-red-400 text-sm flex-shrink-0 mt-0.5">⚠</span>
        <div className="flex-1 min-w-0 space-y-0.5">
          <EditableText
            value={data.label}
            field="label"
            onLabelChange={data.onLabelChange}
            multiline
            className="text-xs font-semibold text-red-700 leading-snug block w-full"
          />
          {(data.sublabel !== undefined || data.onLabelChange) && (
            <EditableText
              value={data.sublabel ?? ""}
              field="sublabel"
              onLabelChange={data.onLabelChange}
              placeholder="Detalle..."
              className="text-2xs text-red-400 leading-snug block w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── AnnotationNode ────────────────────────────────────────────────────────────

export function AnnotationNode({ data }: { data: NodeData }) {
  const hs = makeHandleStyle("#fcd34d");
  return (
    <div
      style={{ width: 220 }}
      className="group/node bg-amber-50 rounded-xl border border-amber-200 shadow-sm px-3 py-2.5"
    >
      <Handle type="source" position={Position.Top}    id="t" style={hs} />
      <Handle type="source" position={Position.Right}  id="r" style={hs} />
      <Handle type="source" position={Position.Bottom} id="b" style={hs} />
      <Handle type="source" position={Position.Left}   id="l" style={hs} />
      <div className="flex items-start gap-1.5">
        <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5">📌</span>
        <EditableText
          value={data.label}
          field="label"
          onLabelChange={data.onLabelChange}
          multiline
          className="text-xs text-amber-800 leading-snug italic block w-full"
        />
      </div>
    </div>
  );
}
