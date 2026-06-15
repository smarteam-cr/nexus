"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-shimmer" /> }
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface BlockData {
  id: string;
  blockType: string;
  content: string | null;
  data: unknown;
  /** Versión inmediatamente anterior (deshacer de 1 nivel). null/ausente = nada que deshacer. */
  previousContent?: string | null;
  previousData?: unknown;
  order: number;
  colSpan: number;
  colStart: number | null;
  rowSpan: number;
  source: string;
  status: string;
  agentRunId: string | null;
  createdAt: string;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  TEXT: "Texto",
  HEADING: "Título",
  TABLE: "Tabla",
  METRIC: "Métrica",
  CALLOUT: "Alerta",
  CARD: "Card",
  FLOWCHART: "Diagrama",
  CHART: "Gráfico",
  IMAGE: "Imagen",
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function BlockRenderer({
  block,
  onAccept,
  onReject,
  onSave,
  onDelete,
  isDeleting,
  onDragStart,
}: {
  block: BlockData;
  onAccept?: () => void;
  onReject?: () => void;
  onSave?: (updates: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  onDelete?: () => void;
  isDeleting?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isDraft = block.status === "DRAFT";
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleSave = async (updates: { content?: string; data?: unknown }) => {
    const ok = await onSave?.(updates);
    // Solo cerramos el editor si el guardado NO falló. `false` = falló (PUT 4xx/5xx
    // o error de red): dejamos el editor abierto con el texto del CSE para que no se
    // pierda; el banner de error ya avisa. void/true = guardó → cerramos.
    if (ok !== false) setEditing(false);
  };

  return (
    <div className={`group/block relative ${isDeleting ? "pointer-events-none" : ""}`}>
      <div
        onMouseDown={(e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY }; }}
        className={`rounded-lg transition-all ${
          isDeleting
            ? "border-2 border-red-300 bg-red-50/60 p-3 opacity-60 animate-pulse"
            : editing
            ? "bg-white border border-brand/40 bg-brand/5 p-3 ring-1 ring-brand/20"
            : isDraft
            ? "bg-white border border-amber-200 bg-amber-50/30 p-3"
            : "bg-white border border-transparent p-3 cursor-text"
        }`}
        onClick={(e) => {
          if (!editing && onSave && block.blockType !== "FLOWCHART" && block.blockType !== "CHART") {
            const pos = mouseDownPos.current;
            if (pos && Math.abs(e.clientX - pos.x) < 5 && Math.abs(e.clientY - pos.y) < 5) {
              setEditing(true);
            }
          }
          mouseDownPos.current = null;
        }}
      >
        {/* Drag handle — SOLO si el contenedor soporta arrastre (la grilla pasa
            onDragStart). En la vista lineal (Procesos/Handoff) no se pasa → no se
            muestra (vestigio del grid viejo: ya no se arrastra). */}
        {onDragStart && (
          <div className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${
            editing ? "opacity-0" : "opacity-0 group-hover/block:opacity-100"
          }`}>
            <div
              className="p-0.5 rounded bg-white border border-gray-200 shadow-sm cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
              title="Mover bloque"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onDragStart?.(e); }}
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
              </svg>
            </div>
          </div>
        )}

        {/* Toolbar — top right. Visible siempre para bloques no-AGENT (señal de
            que un humano los tocó) y en hover/draft/edición para el resto. */}
        <div className={`absolute top-1.5 right-1.5 z-10 flex items-center gap-1.5 transition-opacity ${
          editing || isDraft || block.source !== "AGENT" ? "opacity-100" : "opacity-0 group-hover/block:opacity-100"
        }`}>
          <span className="text-[9px] font-medium text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
            {BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType}
          </span>
          {block.source === "MODIFIED" && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded" title="Editado por un humano sobre la propuesta de la IA">
              Modificado
            </span>
          )}
          {block.source === "HUMAN" && (
            <span className="text-[9px] font-medium uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded" title="Creado manualmente por el CSE">
              Manual
            </span>
          )}
          {/* Eliminar — siempre disponible para bloques no-draft (los draft se quitan con Rechazar) */}
          {onDelete && !isDraft && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-0.5 rounded bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 transition-colors shadow-sm" title="Eliminar bloque">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {isDraft && onAccept && onReject && (
            <>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Borrador
              </span>
              <button onClick={(e) => { e.stopPropagation(); onAccept(); }} className="p-0.5 rounded bg-white border border-gray-200 text-green-600 hover:text-green-800 hover:border-green-300 transition-colors shadow-sm" title="Aceptar">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onReject(); }} className="p-0.5 rounded bg-white border border-gray-200 text-red-400 hover:text-red-600 hover:border-red-300 transition-colors shadow-sm" title="Rechazar">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Block content — edit or view mode */}
        {editing ? (
          <EditBlock block={block} onSave={handleSave} onCancel={() => setEditing(false)} />
        ) : (
          renderBlock(block)
        )}
      </div>

    </div>
  );
}

// ── Edit mode by block type ─────────────────────────────────────────────────

function EditBlock({
  block, onSave, onCancel,
}: {
  block: BlockData;
  onSave: (updates: { content?: string; data?: unknown }) => void;
  onCancel: () => void;
}) {
  switch (block.blockType) {
    case "TEXT": case "CARD":
      return <EditText content={block.content ?? ""} onSave={(content) => onSave({ content })} onCancel={onCancel} />;
    case "HEADING":
      return <EditHeading content={block.content ?? ""} data={block.data as { level?: number } | null} onSave={onSave} onCancel={onCancel} />;
    case "TABLE":
      return <EditTable data={block.data as { headers?: string[]; rows?: string[][] } | null} onSave={(data) => onSave({ data })} onCancel={onCancel} />;
    case "METRIC":
      return <EditMetric data={block.data as { label?: string; value?: string; trend?: string; comparison?: string } | null} onSave={(data) => onSave({ data })} onCancel={onCancel} />;
    case "CALLOUT":
      return <EditCallout content={block.content ?? ""} data={block.data as { variant?: string; title?: string } | null} onSave={onSave} onCancel={onCancel} />;
    default:
      return <EditText content={block.content ?? ""} onSave={(content) => onSave({ content })} onCancel={onCancel} />;
  }
}

// ── Shared ───────────────────────────────────────────────────────────────────

function InlineSaveBar({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 justify-end mt-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] text-gray-400 mr-auto">Esc cancelar · Ctrl+Enter guardar</span>
      <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancelar</button>
      <button onClick={onSave} className="text-xs font-medium text-white bg-brand hover:bg-brand/90 px-3 py-1 rounded-md">Guardar</button>
    </div>
  );
}

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [ref, value]);
}

// ── Edit components ─────────────────────────────────────────────────────────

function EditText({ content, onSave, onCancel }: { content: string; onSave: (c: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(content);
  const valueRef = useRef(value);
  valueRef.current = value;
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoResize(ref, value);
  useEffect(() => { ref.current?.focus(); }, []); // eslint-disable-line
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(valueRef.current); } }}
        className="w-full text-sm text-gray-700 leading-relaxed bg-transparent border-none focus:outline-none resize-none p-0" placeholder="Escribe aquí..." />
      <InlineSaveBar onSave={() => onSave(valueRef.current)} onCancel={onCancel} />
    </div>
  );
}

function EditHeading({ content, data, onSave, onCancel }: { content: string; data: { level?: number } | null; onSave: (u: { content?: string; data?: unknown }) => void; onCancel: () => void }) {
  const [value, setValue] = useState(content);
  const level = data?.level ?? 2;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []); // eslint-disable-line
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <input ref={ref} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onSave({ content: value, data: { level } }); }}
        className={`w-full bg-transparent border-none focus:outline-none p-0 ${level === 3 ? "text-base font-bold text-gray-800" : "text-lg font-bold text-gray-900"}`} />
      <InlineSaveBar onSave={() => onSave({ content: value, data: { level } })} onCancel={onCancel} />
    </div>
  );
}

function EditTable({ data, onSave, onCancel }: { data: { headers?: string[]; rows?: string[][] } | null; onSave: (d: { headers: string[]; rows: string[][] }) => void; onCancel: () => void }) {
  const [headers, setHeaders] = useState<string[]>(data?.headers ?? [""]);
  const [rows, setRows] = useState<string[][]>(data?.rows ?? [[""]]);
  const updateHeader = (i: number, v: string) => { const h = [...headers]; h[i] = v; setHeaders(h); };
  const updateCell = (ri: number, ci: number, v: string) => { const r = rows.map((row) => [...row]); r[ri][ci] = v; setRows(r); };
  const addRow = () => setRows([...rows, headers.map(() => "")]);
  const addCol = () => { setHeaders([...headers, ""]); setRows(rows.map((r) => [...r, ""])); };
  const removeRow = (ri: number) => setRows(rows.filter((_, i) => i !== ri));
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="overflow-x-auto my-2">
        <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead><tr className="bg-gray-50">
            {headers.map((h, i) => (<th key={i} className="px-3 py-2 border-b border-gray-200"><input value={h} onChange={(e) => updateHeader(i, e.target.value)} className="w-full text-xs font-semibold text-gray-600 uppercase tracking-wider bg-transparent focus:outline-none focus:bg-white rounded px-1" placeholder="Header" /></th>))}
            <th className="px-1 py-2 border-b border-gray-200 w-6" />
          </tr></thead>
          <tbody>{rows.map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
            {row.map((cell, ci) => (<td key={ci} className="px-3 py-1.5 border-b border-gray-100"><input value={cell} onChange={(e) => updateCell(ri, ci, e.target.value)} className="w-full text-sm text-gray-700 bg-transparent focus:outline-none focus:bg-white rounded px-1" /></td>))}
            <td className="px-1 py-1.5 border-b border-gray-100 text-center"><button onClick={() => removeRow(ri)} className="text-gray-300 hover:text-red-400 text-xs">x</button></td>
          </tr>))}</tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={addRow} className="text-[10px] text-gray-500 hover:text-gray-700">+ Fila</button>
        <button onClick={addCol} className="text-[10px] text-gray-500 hover:text-gray-700">+ Columna</button>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancelar</button>
          <button onClick={() => onSave({ headers, rows })} className="text-xs font-medium text-white bg-brand hover:bg-brand/90 px-3 py-1 rounded-md">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function EditMetric({ data, onSave, onCancel }: { data: { label?: string; value?: string; trend?: string; comparison?: string } | null; onSave: (d: { label: string; value: string; trend?: string; comparison?: string }) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(data?.label ?? "");
  const [value, setValue] = useState(data?.value ?? "");
  const [trend, setTrend] = useState(data?.trend ?? "flat");
  const [comparison, setComparison] = useState(data?.comparison ?? "");
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="inline-flex items-baseline gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 my-1">
        <div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-transparent focus:outline-none focus:bg-white rounded px-1 w-full" placeholder="Label" />
          <input value={value} onChange={(e) => setValue(e.target.value)} className="text-2xl font-bold text-gray-900 bg-transparent focus:outline-none focus:bg-white rounded px-1 w-full" placeholder="Valor" />
        </div>
        <select value={trend} onChange={(e) => setTrend(e.target.value)} className="text-lg font-bold bg-transparent border-none focus:outline-none cursor-pointer">
          <option value="up">↑</option><option value="down">↓</option><option value="flat">→</option>
        </select>
        <input value={comparison} onChange={(e) => setComparison(e.target.value)} className="text-xs text-gray-400 bg-transparent focus:outline-none focus:bg-white rounded px-1 w-24" placeholder="vs ..." />
      </div>
      <InlineSaveBar onSave={() => onSave({ label, value, trend, comparison: comparison || undefined })} onCancel={onCancel} />
    </div>
  );
}

function EditCallout({ content, data, onSave, onCancel }: { content: string; data: { variant?: string; title?: string } | null; onSave: (u: { content?: string; data?: unknown }) => void; onCancel: () => void }) {
  const [text, setText] = useState(content);
  const [variant, setVariant] = useState(data?.variant ?? "info");
  const [title, setTitle] = useState(data?.title ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoResize(ref, text);
  const styles: Record<string, string> = { info: "bg-blue-50 border-blue-200 text-blue-800", warning: "bg-amber-50 border-amber-200 text-amber-800", success: "bg-green-50 border-green-200 text-green-800", error: "bg-red-50 border-red-200 text-red-800" };
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className={`rounded-xl border px-4 py-3 my-2 ${styles[variant] ?? styles.info}`}>
        <div className="flex items-center gap-2 mb-1">
          <select value={variant} onChange={(e) => setVariant(e.target.value)} className="text-sm bg-transparent border-none focus:outline-none cursor-pointer p-0">
            <option value="info">ℹ️</option><option value="warning">⚠️</option><option value="success">✅</option><option value="error">❌</option>
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 text-sm font-bold bg-transparent focus:outline-none focus:bg-white/50 rounded px-1" placeholder="Título (opcional)" />
        </div>
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave({ content: text, data: { variant, title: title || undefined } }); }}
          className="w-full text-sm leading-relaxed bg-transparent border-none focus:outline-none resize-none p-0" placeholder="Contenido..." />
      </div>
      <InlineSaveBar onSave={() => onSave({ content: text, data: { variant, title: title || undefined } })} onCancel={onCancel} />
    </div>
  );
}

// ── View renderers ──────────────────────────────────────────────────────────

function renderBlock(block: BlockData) {
  switch (block.blockType) {
    case "TEXT": case "CARD": return <TextBlockView content={block.content ?? ""} />;
    case "HEADING": return <HeadingBlockView content={block.content ?? ""} data={block.data as { level?: number } | null} />;
    case "TABLE": return <TableBlockView data={block.data as { headers?: string[]; rows?: string[][] } | null} />;
    case "METRIC": return <MetricBlockView data={block.data as { label?: string; value?: string; trend?: string; comparison?: string } | null} />;
    case "CALLOUT": return <CalloutBlockView content={block.content ?? ""} data={block.data as { variant?: string; title?: string } | null} />;
    case "FLOWCHART": return <FlowchartBlockView data={block.data as { nodes?: unknown[]; edges?: unknown[]; description?: string } | null} title={block.content} />;
    case "CHART": return <TextBlockView content={block.content ?? "[Gráfico — próximamente]"} />;
    case "IMAGE": return <ImageBlockView data={block.data as { url?: string; alt?: string; caption?: string } | null} />;
    default: return <TextBlockView content={block.content ?? ""} />;
  }
}

/** Fix markdown headings without space after # (e.g. #Texto → # Texto) */
function fixMarkdownHeadings(text: string): string {
  return text.replace(/^(#{1,3})([^ #\n])/gm, "$1 $2");
}

function TextBlockView({ content }: { content: string }) {
  if (!content.trim()) return null;
  return <div className="text-sm text-gray-700 leading-relaxed prose prose-sm prose-gray max-w-none"><ReactMarkdown>{fixMarkdownHeadings(content)}</ReactMarkdown></div>;
}

function HeadingBlockView({ content, data }: { content: string; data: { level?: number } | null }) {
  if ((data?.level ?? 2) === 3) return <h3 className="text-base font-bold text-gray-800 mt-3 mb-1">{content}</h3>;
  return <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2">{content}</h2>;
}

function TableBlockView({ data }: { data: { headers?: string[]; rows?: string[][] } | null }) {
  if (!data?.headers?.length) return null;
  return (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead><tr className="bg-gray-50">{data.headers.map((h, i) => (<th key={i} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">{h}</th>))}</tr></thead>
        <tbody>{(data.rows ?? []).map((row, ri) => (<tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>{row.map((cell, ci) => (<td key={ci} className="px-3 py-2 text-gray-700 border-b border-gray-100">{cell}</td>))}</tr>))}</tbody>
      </table>
    </div>
  );
}

function MetricBlockView({ data }: { data: { label?: string; value?: string; trend?: string; comparison?: string } | null }) {
  if (!data?.label) return null;
  const trendIcon = data.trend === "up" ? "↑" : data.trend === "down" ? "↓" : "→";
  const trendColor = data.trend === "up" ? "text-green-600" : data.trend === "down" ? "text-red-500" : "text-gray-400";
  return (
    <div className="inline-flex items-baseline gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 my-1">
      <div><p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{data.label}</p><p className="text-2xl font-bold text-gray-900">{data.value ?? "—"}</p></div>
      {data.trend && <span className={`text-lg font-bold ${trendColor}`}>{trendIcon}</span>}
      {data.comparison && <span className="text-xs text-gray-400">{data.comparison}</span>}
    </div>
  );
}

function CalloutBlockView({ content, data }: { content: string; data: { variant?: string; title?: string } | null }) {
  const variant = data?.variant ?? "info";
  const styles: Record<string, string> = { info: "bg-blue-50 border-blue-200 text-blue-800", warning: "bg-amber-50 border-amber-200 text-amber-800", success: "bg-green-50 border-green-200 text-green-800", error: "bg-red-50 border-red-200 text-red-800" };
  const icons: Record<string, string> = { info: "ℹ️", warning: "⚠️", success: "✅", error: "❌" };
  return (
    <div className={`rounded-xl border px-4 py-3 my-2 ${styles[variant] ?? styles.info}`}>
      {data?.title && <p className="text-sm font-bold mb-1">{icons[variant] ?? ""} {data.title}</p>}
      <div className="text-sm leading-relaxed prose prose-sm max-w-none"><ReactMarkdown>{content}</ReactMarkdown></div>
    </div>
  );
}

function FlowchartBlockView({ data, title }: { data: { nodes?: unknown[]; edges?: unknown[]; description?: string } | null; title?: string | null }) {
  if (!data?.nodes?.length) return null;
  const heading = title?.trim() ?? "";
  const desc = typeof data.description === "string" ? data.description.trim() : "";
  return (
    <div className="my-2">
      {(heading || desc) && (
        <div className="mb-2">
          {heading && <p className="text-sm font-bold text-gray-800">{heading}</p>}
          {desc && <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{desc}</p>}
        </div>
      )}
      <div className="h-[400px] rounded-xl border border-gray-200 overflow-hidden">
        <FlowchartViewer data={{ title: "", description: "", nodes: data.nodes as Array<{ id: string; type: string; label: string; position?: { x: number; y: number } }>, edges: data.edges as Array<{ id?: string; source: string; target: string; label?: string }> }} />
      </div>
    </div>
  );
}

function ImageBlockView({ data }: { data: { url?: string; alt?: string; caption?: string } | null }) {
  if (!data?.url) return null;
  return (<figure className="my-2"><img src={data.url} alt={data.alt ?? ""} className="rounded-xl max-w-full" />{data.caption && <figcaption className="text-xs text-gray-400 mt-1 text-center">{data.caption}</figcaption>}</figure>);
}
