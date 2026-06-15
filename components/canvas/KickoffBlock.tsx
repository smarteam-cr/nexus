"use client";

/**
 * components/canvas/KickoffBlock.tsx
 *
 * Renderer de un CanvasBlock con estética de LANDING (design system Smarteam).
 * Independiente del BlockRenderer compartido — que conserva el chrome de canvas
 * (card blanca, toolbar, drag handle) para Handoff/Diagnóstico/Planificación y NO
 * se puede restilar sin arrastrarlos. Acá el render es editorial.
 *
 * En modo `editable`, casi todos los tipos se editan inline (clic → editor in-place,
 * sin la caja que salta):
 *   - TEXT/CARD/CALLOUT → editor de markdown in-place (textarea que auto-crece;
 *     se guarda el markdown fuente, que se lee bien sin preview).
 *   - HEADING → input de una línea.
 *   - TABLE → grilla de inputs por celda. ACOTADO: se edita el CONTENIDO de las
 *     celdas; agregar/quitar filas o columnas es Fase B (se le pide al chat).
 *   - METRIC → campos (valor / etiqueta / comparación).
 *   - IMAGE/FLOWCHART/CHART → solo lectura.
 * Cada guardado pega al MISMO PUT por blockId (vía onSave→saveBlock).
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RenderableBlock } from "@/lib/external/kickoff-view-types";

const EDITABLE_TYPES = ["TEXT", "CARD", "CALLOUT", "HEADING", "TABLE", "METRIC"];
// Tipos donde la regen por IA tiene sentido (los 3 del plan: texto/métrica/tabla).
const AI_REGEN_TYPES = ["TEXT", "CARD", "CALLOUT", "TABLE", "METRIC"];

export default function KickoffBlock({
  block,
  editable = false,
  invert = false,
  onSave,
  onRegenerate,
}: {
  block: RenderableBlock;
  editable?: boolean;
  /** Prosa light-on-dark (para el hero oscuro). */
  invert?: boolean;
  onSave?: (updates: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  /** Regen por IA: devuelve el content/data nuevo (NO escribe; el guardado es onSave→PUT).
   *  `base` (multi-turno B.2) = punto de partida; si se pasa, la regen parte de ese draft. */
  onRegenerate?: (
    instruction: string,
    base?: { content?: string | null; data?: unknown },
  ) => Promise<{ content?: string | null; data?: unknown } | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [aiPrompting, setAiPrompting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  // Multi-turno (B.2): pila de drafts de IA (encadenar + deshacer). "Draft actual" = tope;
  // si está vacía, el bloque guardado. `liveValue` = lo que está en pantalla ahora (incluye
  // ediciones a mano) → punto de partida (base) de la próxima regen; null = sin cambios desde
  // el último draft/bloque.
  const [draftStack, setDraftStack] = useState<Array<{ content?: string | null; data?: unknown }>>([]);
  const [liveValue, setLiveValue] = useState<{ content?: string | null; data?: unknown } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const data = (block.data ?? {}) as Record<string, unknown>;
  const canEdit = editable && !!onSave && EDITABLE_TYPES.includes(block.blockType);
  const canRegen = editable && !!onRegenerate && AI_REGEN_TYPES.includes(block.blockType);

  // ── Editor multi-turno (manual, o encadenado por regens de IA) ─────────────
  if (editing && canEdit) {
    const currentDraft = draftStack.length ? draftStack[draftStack.length - 1] : null;
    const resetDraft = () => {
      setEditing(false);
      setDraftStack([]);
      setLiveValue(null);
      setAiError(null);
    };
    // Cierra y limpia SOLO si guardó. Si falla (false) deja el editor con el draft.
    const commit = async (update: { content?: string; data?: unknown }) => {
      const ok = await onSave!(update);
      if (ok !== false) resetDraft();
    };
    const cancel = resetDraft;
    const undo = () => {
      setDraftStack((s) => s.slice(0, -1)); // pop → remonta (key) → re-siembra del nuevo tope
      setLiveValue(null);
      setAiError(null);
    };
    // Semilla del editor: el tope de la pila si hay, si no el contenido guardado.
    const seedContent = currentDraft && typeof currentDraft.content === "string" ? currentDraft.content : block.content ?? "";
    const seedData = ((currentDraft && currentDraft.data !== undefined ? currentDraft.data : block.data) ?? {}) as Record<string, unknown>;
    const k = String(draftStack.length); // remonta SOLO al push/undo (no en ediciones a mano)

    // Lo que el CSE ve ahora → base de la próxima regen (fiel a ediciones a mano).
    const reportContent = (content: string) => setLiveValue({ content });
    const reportData = (d: unknown) => setLiveValue({ data: d });

    let editor: ReactNode;
    switch (block.blockType) {
      case "HEADING":
        editor = <HeadingEditor key={k} initial={seedContent} onSave={(content) => commit({ content })} onCancel={cancel} onDraftChange={reportContent} />;
        break;
      case "TABLE":
        editor = <TableEditor key={k} data={seedData} onSave={(d) => commit({ data: d })} onCancel={cancel} onDraftChange={reportData} />;
        break;
      case "METRIC":
        editor = <MetricEditor key={k} data={seedData} onSave={(d) => commit({ data: d })} onCancel={cancel} onDraftChange={reportData} />;
        break;
      default: // TEXT, CARD, CALLOUT
        editor = <MarkdownEditor key={k} initial={seedContent} onSave={(content) => commit({ content })} onCancel={cancel} onDraftChange={reportContent} />;
    }

    return (
      <div onClick={(e) => e.stopPropagation()}>
        {canRegen && (
          <AiPromptBox
            busy={aiBusy}
            seeded={draftStack.length > 0}
            error={aiError}
            canUndo={draftStack.length > 0}
            onUndo={undo}
            onRegen={async (instruction) => {
              setAiError(null);
              setAiBusy(true);
              // Parte de lo que el CSE ve ahora (ediciones a mano incluidas); si no, del tope;
              // si tampoco, sin base (primer turno → el endpoint usa el bloque guardado).
              const base = liveValue ?? currentDraft ?? undefined;
              const r = await onRegenerate!(instruction, base);
              setAiBusy(false);
              // Solo encadena con un payload válido; si falló, muestra el error y deja el
              // draft en el último estado bueno (nunca datos rotos).
              if (r) {
                setLiveValue(null);
                setDraftStack((s) => [...s, r]);
              } else {
                setAiError("No se pudo regenerar el bloque. Probá de nuevo o ajustá la instrucción.");
              }
            }}
          />
        )}
        {/* Mientras la IA regenera, el área del bloque muestra un skeleton (no el draft viejo). */}
        {aiBusy ? <BlockSkeleton /> : editor}
      </div>
    );
  }

  // ── Prompt de IA desde la vista (primer turno; sin abrir antes el editor) ──
  if (aiPrompting && canRegen) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <AiPromptBox
          busy={aiBusy}
          seeded={false}
          autoFocus
          error={aiError}
          onCancel={() => {
            setAiError(null);
            setAiPrompting(false);
          }}
          onRegen={async (instruction) => {
            setAiError(null);
            setAiBusy(true);
            const r = await onRegenerate!(instruction); // primer turno: sin base (parte del bloque guardado)
            setAiBusy(false);
            // Solo abre el editor pre-llenado con un payload válido; si falló, se queda
            // en el prompt mostrando el error (sin pre-llenar ni romper la UI).
            if (r) {
              setLiveValue(null);
              setDraftStack([r]);
              setAiPrompting(false);
              setEditing(true);
            } else {
              setAiError("No se pudo regenerar el bloque. Probá de nuevo o ajustá la instrucción.");
            }
          }}
        />
        {aiBusy && <BlockSkeleton />}
      </div>
    );
  }

  const view = renderView(block, data);
  if (!canEdit && !canRegen) return invert ? <div className="kl-invert">{view}</div> : view;

  return (
    <div
      className={invert ? "kl-invert" : undefined}
      style={{ position: "relative", borderRadius: 8, margin: "0 -6px", padding: "0 6px", transition: "background-color 150ms ease" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-blue-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {canRegen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAiError(null);
            setAiPrompting(true);
          }}
          title="Editar con IA"
          style={{ position: "absolute", top: 2, right: 2, zIndex: 2, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface, #fff)", color: "var(--brand-blue)", cursor: "pointer", opacity: 0.85 }}
        >
          ✨ IA
        </button>
      )}
      {canEdit ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditing(true);
          }}
          title="Clic para editar"
          style={{ cursor: "text" }}
        >
          {view}
        </div>
      ) : (
        view
      )}
    </div>
  );
}

/** Skeleton del área de un bloque mientras la IA regenera (reusa .skeleton-shimmer global). */
function BlockSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
      <div className="skeleton-shimmer" style={{ height: 14, borderRadius: 6, width: "90%" }} />
      <div className="skeleton-shimmer" style={{ height: 14, borderRadius: 6, width: "100%" }} />
      <div className="skeleton-shimmer" style={{ height: 14, borderRadius: 6, width: "75%" }} />
    </div>
  );
}

function Prose({ content }: { content: string }) {
  return (
    <div className="kl-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/** Markdown inline (sin <p> envolvente) — para celdas de tabla: parsea **bold**, *italic*, links. */
function InlineMD({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: (props) => <>{props.children}</> }}>
      {children}
    </ReactMarkdown>
  );
}

/** Heurística (sin tocar al agente): tabla de comparación = 2 columnas con
 *  header[0] de "estado actual" y header[1] de "futuro/HubSpot". AMBOS lados
 *  deben matchear; si no, se trata como tabla de datos (p. ej. la de alcance
 *  "Módulo | Qué se configura" → no matchea → queda tabla). */
function isComparisonTable(headers: string[]): boolean {
  if (headers.length !== 2) return false;
  const now = /^(hoy|antes|actual|sin\b|estado actual)/i;
  const future = /(hubspot|con\b|después|despues|ahora|nuevo|con el sistema)/i;
  return now.test((headers[0] ?? "").trim()) && future.test((headers[1] ?? "").trim());
}

/** Par contrastado "Hoy / Con HubSpot": "Hoy" neutro/atenuado, el futuro en
 *  marca (teal). Contraste visual SIN rojo-alarma. Cada columna = lista de las
 *  celdas de esa columna (markdown inline para **negritas**). */
function ComparePair({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const col = (i: number) => rows.map((r) => (r?.[i] ?? "").trim()).filter(Boolean);
  const now = col(0);
  const future = col(1);
  return (
    <div className="kl-grid-2">
      <div className="kl-compare-now">
        <div className="kl-compare-label">{headers[0]}</div>
        <ul className="kl-compare-list">
          {now.map((it, i) => <li key={i}><InlineMD>{it}</InlineMD></li>)}
        </ul>
      </div>
      <div className="kl-compare-future">
        <div className="kl-compare-label">{headers[1]}</div>
        <ul className="kl-compare-list">
          {future.map((it, i) => <li key={i}><InlineMD>{it}</InlineMD></li>)}
        </ul>
      </div>
    </div>
  );
}

function renderView(block: RenderableBlock, data: Record<string, unknown>) {
  switch (block.blockType) {
    case "HEADING": {
      const level = (data.level as number) === 3 ? 3 : 2;
      const size = level === 3 ? 18 : 22;
      return (
        <p className="font-display display-tight" style={{ color: "var(--text)", fontSize: size, lineHeight: 1.25, margin: 0 }}>
          {block.content}
        </p>
      );
    }
    case "CALLOUT": {
      const title = typeof data.title === "string" ? data.title : "";
      return (
        <div className="kl-highlight">
          <div className="kl-highlight-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && (
              <div className="font-display" style={{ color: "var(--text)", fontSize: 15, marginBottom: 4 }}>
                {title}
              </div>
            )}
            <Prose content={block.content ?? ""} />
          </div>
        </div>
      );
    }
    case "TABLE": {
      const headers = Array.isArray(data.headers) ? (data.headers as string[]) : [];
      const rows = Array.isArray(data.rows) ? (data.rows as string[][]) : [];
      if (!headers.length && !rows.length) return <Prose content={block.content ?? ""} />;
      if (isComparisonTable(headers)) return <ComparePair headers={headers} rows={rows} />;
      return (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            {headers.length > 0 && (
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border-strong)", color: "var(--text)", fontWeight: 600 }}>
                      <InlineMD>{h}</InlineMD>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {(r ?? []).map((c, ci) => (
                    <td key={ci} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <InlineMD>{c}</InlineMD>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "METRIC": {
      const label = typeof data.label === "string" ? data.label : "";
      const value = typeof data.value === "string" ? data.value : "";
      const comparison = typeof data.comparison === "string" ? data.comparison : "";
      return (
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="font-display" style={{ color: "var(--brand-blue)", fontSize: 32, lineHeight: 1 }}>
            {value || block.content}
          </div>
          {label && <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 600, marginTop: 6 }}>{label}</div>}
          {comparison && <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{comparison}</div>}
        </div>
      );
    }
    case "IMAGE": {
      const url = typeof data.url === "string" ? data.url : "";
      const alt = typeof data.alt === "string" ? data.alt : "";
      const caption = typeof data.caption === "string" ? data.caption : "";
      if (!url) return null;
      return (
        <figure style={{ margin: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }} />
          {caption && <figcaption style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6, textAlign: "center" }}>{caption}</figcaption>}
        </figure>
      );
    }
    case "FLOWCHART":
    case "CHART":
      return (
        <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>
          [{block.blockType === "FLOWCHART" ? "Diagrama de flujo" : "Gráfico"} — visible en la vista de canvas]
        </div>
      );
    default: // TEXT, CARD
      return <Prose content={block.content ?? ""} />;
  }
}

/* ── Editores in-place (solo modo interno) ─────────────────────────────────── */

/** Editor de markdown in-place: textarea que auto-crece (sin scroll ni salto).
 *  Edita el markdown FUENTE (cero round-trip; el markdown crudo se lee bien). */
function MarkdownEditor({ initial, onSave, onCancel, onDraftChange }: { initial: string; onSave: (c: string) => void; onCancel: () => void; onDraftChange?: (c: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => { setValue(e.target.value); onDraftChange?.(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(value);
          }
        }}
        className="kl-edit-input"
        style={{ resize: "none", overflow: "hidden", minHeight: 64 }}
        placeholder="Markdown… **negrita**, *itálica*, - viñetas"
      />
      <EditBar onSave={() => onSave(value)} onCancel={onCancel} />
    </div>
  );
}

/** Título (HEADING) — texto plano de una línea. */
function HeadingEditor({ initial, onSave, onCancel, onDraftChange }: { initial: string; onSave: (c: string) => void; onCancel: () => void; onDraftChange?: (c: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => { setValue(e.target.value); onDraftChange?.(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(value);
          }
        }}
        className="kl-edit-input"
        style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif", fontWeight: 600, fontSize: 20 }}
        placeholder="Título"
      />
      <EditBar onSave={() => onSave(value)} onCancel={onCancel} />
    </div>
  );
}

/** Tabla — grilla de inputs por celda + agregar/quitar filas y columnas
 *  (estructura determinística por botones; el contenido por IA va aparte).
 *  Preserva el resto de `data`. */
function TableEditor({ data, onSave, onCancel, onDraftChange }: { data: Record<string, unknown>; onSave: (d: unknown) => void; onCancel: () => void; onDraftChange?: (d: unknown) => void }) {
  const [headers, setHeaders] = useState<string[]>(Array.isArray(data.headers) ? (data.headers as string[]) : []);
  const [rows, setRows] = useState<string[][]>(
    Array.isArray(data.rows) ? (data.rows as string[][]).map((r) => [...r]) : [],
  );
  // Reporta el estado en pantalla → la próxima regen parte de estos ajustes a mano.
  const report = (h: string[], r: string[][]) => onDraftChange?.({ ...data, headers: h, rows: r });
  const setHeader = (i: number, v: string) => {
    const h = headers.map((x, j) => (j === i ? v : x));
    setHeaders(h);
    report(h, rows);
  };
  const setCell = (ri: number, ci: number, v: string) => {
    const r = rows.map((row, j) => (j === ri ? row.map((c, k) => (k === ci ? v : c)) : row));
    setRows(r);
    report(headers, r);
  };
  const colCount = headers.length || rows[0]?.length || 1;
  const addRow = () => {
    const r = [...rows, Array.from({ length: colCount }, () => "")];
    setRows(r);
    report(headers, r);
  };
  const removeRow = (ri: number) => {
    const r = rows.filter((_, i) => i !== ri);
    setRows(r);
    report(headers, r);
  };
  const addCol = () => {
    const h = [...headers, ""];
    const r = rows.map((row) => [...row, ""]);
    setHeaders(h);
    setRows(r);
    report(h, r);
  };
  const removeCol = (ci: number) => {
    const h = headers.filter((_, i) => i !== ci);
    const r = rows.map((row) => row.filter((_, i) => i !== ci));
    setHeaders(h);
    setRows(r);
    report(h, r);
  };
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, fontSize: 14 }}>
          {headers.length > 0 && (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} style={{ padding: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <input value={h} onChange={(e) => setHeader(i, e.target.value)} className="kl-edit-cell" style={{ fontWeight: 600 }} />
                      <button onClick={() => removeCol(i)} title="Quitar columna" style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>×</button>
                    </div>
                  </th>
                ))}
                <th style={{ width: 22 }} />
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={{ padding: 0 }}>
                    <input value={c} onChange={(e) => setCell(ri, ci, e.target.value)} className="kl-edit-cell" />
                  </td>
                ))}
                <td style={{ padding: 0, width: 22, textAlign: "center" }}>
                  <button onClick={() => removeRow(ri)} title="Quitar fila" style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={addRow} style={{ fontSize: 12, color: "var(--brand-blue)", background: "transparent", border: "1px dashed var(--border)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>+ Fila</button>
        <button onClick={addCol} style={{ fontSize: 12, color: "var(--brand-blue)", background: "transparent", border: "1px dashed var(--border)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>+ Columna</button>
      </div>
      <EditBar onSave={() => onSave({ ...data, headers, rows })} onCancel={onCancel} />
    </div>
  );
}

/** Métrica — campos valor / etiqueta / comparación. Preserva el resto de `data`. */
function MetricEditor({ data, onSave, onCancel, onDraftChange }: { data: Record<string, unknown>; onSave: (d: unknown) => void; onCancel: () => void; onDraftChange?: (d: unknown) => void }) {
  const [value, setValue] = useState(typeof data.value === "string" ? data.value : "");
  const [label, setLabel] = useState(typeof data.label === "string" ? data.label : "");
  const [comparison, setComparison] = useState(typeof data.comparison === "string" ? data.comparison : "");
  const report = (v: string, l: string, c: string) => onDraftChange?.({ ...data, value: v, label: l, comparison: c });
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label className="kl-edit-field"><span>Valor</span><input value={value} onChange={(e) => { setValue(e.target.value); report(e.target.value, label, comparison); }} className="kl-edit-cell" /></label>
        <label className="kl-edit-field"><span>Etiqueta</span><input value={label} onChange={(e) => { setLabel(e.target.value); report(value, e.target.value, comparison); }} className="kl-edit-cell" /></label>
        <label className="kl-edit-field"><span>Comparación (opcional)</span><input value={comparison} onChange={(e) => { setComparison(e.target.value); report(value, label, e.target.value); }} className="kl-edit-cell" /></label>
      </div>
      <EditBar onSave={() => onSave({ ...data, value, label, comparison })} onCancel={onCancel} />
    </div>
  );
}

/** Barra Guardar / Cancelar compartida por todos los editores. */
function EditBar({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, alignItems: "center" }}>
      <span style={{ marginRight: "auto", color: "var(--text-muted)", fontSize: 11 }}>Esc cancelar · Ctrl+Enter guardar</span>
      <button onClick={onCancel} style={{ fontSize: 13, color: "var(--text-secondary)", padding: "5px 10px", background: "transparent", border: "none", cursor: "pointer" }}>
        Cancelar
      </button>
      <button onClick={onSave} className="btn-primary" style={{ padding: "6px 14px", fontSize: 13 }}>
        Guardar
      </button>
    </div>
  );
}

/** Caja de instrucción para regenerar el bloque por IA (Fase B.1). El resultado
 *  pre-llena el editor; NO escribe (el guardado lo hace el CSE con Guardar→PUT). */
function AiPromptBox({
  busy,
  seeded,
  autoFocus = false,
  error = null,
  canUndo = false,
  onUndo,
  onRegen,
  onCancel,
}: {
  busy: boolean;
  /** Ya hay un draft de IA cargado (cambia el copy a "Regenerar"/"otro ajuste"). */
  seeded: boolean;
  autoFocus?: boolean;
  /** Error del último intento (se muestra inline; el editor NO se pre-llena). */
  error?: string | null;
  /** Hay al menos un ajuste en la pila → se puede deshacer el último. */
  canUndo?: boolean;
  onUndo?: () => void;
  onRegen: (instruction: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [instr, setInstr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const go = () => {
    const v = instr.trim();
    if (v && !busy) onRegen(v);
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, borderRadius: 8, background: "var(--brand-blue-soft)", border: `1px solid ${error ? "#dc2626" : "var(--border)"}` }}>
        <span aria-hidden="true" style={{ fontSize: 13 }}>✨</span>
        <input
          ref={ref}
          value={instr}
          onChange={(e) => setInstr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go();
            }
            if (e.key === "Escape") onCancel?.();
          }}
          disabled={busy}
          placeholder={seeded ? "Pedí otro ajuste…" : "Cómo querés reescribir este bloque…"}
          className="kl-edit-cell"
          style={{ flex: 1 }}
        />
        {canUndo && onUndo && (
          <button onClick={onUndo} disabled={busy} title="Deshacer último ajuste" style={{ fontSize: 12, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer" }}>
            ↶ Deshacer
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} disabled={busy} style={{ fontSize: 12, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer" }}>
            Cancelar
          </button>
        )}
        <button onClick={go} disabled={busy || !instr.trim()} className="btn-primary" style={{ padding: "5px 12px", fontSize: 12, opacity: busy || !instr.trim() ? 0.6 : 1 }}>
          {busy ? "Generando…" : seeded ? "Regenerar" : "Generar"}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
