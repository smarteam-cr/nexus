"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BlockRenderer, { type BlockData } from "./BlockRenderer";
import { useUndo, useUndoScope } from "@/components/ui/UndoProvider";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SectionWithBlocks {
  id: string;
  key: string;
  label: string;
  order: number;
  layout: unknown;
  blocks: BlockData[];
}

const GRID_COLS = 4;
const GRID_ROWS = 20;
const GAP = 12;

type GridInteraction = {
  type: "drag" | "resize";
  blockId: string;
  sectionId: string;
  // Current preview position
  col: number;  // 0-indexed
  row: number;  // 0-indexed
  w: number;    // width in cells
  h: number;    // height in cells
};

// ── Component ────────────────────────────────────────────────────────────────

export default function SectionBlockList({
  projectId,
  canvasId,
  onlyKey,
}: {
  projectId: string;
  canvasId: string;
  /** Si se especifica, solo renderiza la sección con esa key. Para sub-tabs. */
  onlyKey?: string;
}) {
  const [allSections, setAllSections] = useState<SectionWithBlocks[]>([]);
  const sections = onlyKey
    ? allSections.filter((s) => s.key === onlyKey)
    : allSections;
  // Última serialización aplicada — guard de igualdad (mismo patrón que useCanvasSections.ts):
  // un refetch con contenido idéntico (el que dispara CADA guardado, no solo el polling) no debe
  // reemplazar el array. Sin esto, cada save() re-crea `allSections` con una referencia nueva
  // aunque el contenido sea igual → cascada de re-render hacia abajo (p.ej. FlowchartViewer
  // reconstruye su grafo, React Flow re-mide nodos, y eso reabre "Guardar" solo).
  const lastSectionsJson = useRef<string>("");
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [interaction, setInteraction] = useState<GridInteraction | null>(null);
  const [cellSize, setCellSize] = useState(160);
  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Undo global ──────────────────────────────────────────────────────────────
  const { pushUndo } = useUndo();
  const undoScope = `canvas:${projectId}:${canvasId}`;
  useUndoScope(undoScope); // purga el historial al desmontar (no aplica a otro canvas)
  const allSectionsRef = useRef(allSections);
  useEffect(() => { allSectionsRef.current = allSections; }); // latest ref (no tocar refs en render)
  const findBlockSnap = (blockId: string): BlockData | undefined =>
    allSectionsRef.current.flatMap((s) => s.blocks).find((b) => b.id === blockId);
  const blocksUrl = (sectionId: string) =>
    `/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`;

  // Measure cell row height: half the column width for 2:1 ratio
  // This way a 2-row block looks roughly square
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.getBoundingClientRect().width;
        const colWidth = Math.floor((w - GAP * (GRID_COLS - 1)) / GRID_COLS);
        const rowHeight = Math.floor(colWidth / 2);
        if (rowHeight > 0) setCellSize(rowHeight);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`);
      const data = await res.json();
      const next = data.sections ?? [];
      const serialized = JSON.stringify(next);
      if (serialized !== lastSectionsJson.current) {
        lastSectionsJson.current = serialized;
        setAllSections(next);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, canvasId]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  // Auto-fit: after render, measure real content heights and shrink oversized blocks
  const autoFitDone = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sections.length || !cellSize) return;
    const timer = setTimeout(() => {
      const updates: Array<{ blockId: string; sectionId: string; rowSpan: number }> = [];

      sections.forEach((section) => {
        if (autoFitDone.current.has(section.id)) return;
        section.blocks.forEach((block) => {
          const cellEl = document.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement;
          if (!cellEl) return;
          const contentEl = cellEl.querySelector(".h-full.overflow-auto") as HTMLElement;
          if (!contentEl) return;

          const contentHeight = contentEl.scrollHeight;
          const currentCellHeight = block.rowSpan * (cellSize + GAP) - GAP;
          const minRowSpan = Math.max(1, Math.ceil((contentHeight + GAP) / (cellSize + GAP)));

          // Only shrink, never grow (user can manually resize to grow)
          if (minRowSpan < block.rowSpan) {
            updates.push({ blockId: block.id, sectionId: section.id, rowSpan: minRowSpan });
          }
        });
        autoFitDone.current.add(section.id);
      });

      if (updates.length > 0) {
        // Optimistic UI update
        setAllSections((prev) => {
          let next = prev;
          for (const u of updates) {
            next = next.map((s) =>
              s.id === u.sectionId
                ? { ...s, blocks: s.blocks.map((b) => b.id === u.blockId ? { ...b, rowSpan: u.rowSpan } : b) }
                : s
            );
          }
          return next;
        });
        // Persist to DB
        for (const u of updates) {
          fetch(`/api/projects/${projectId}/canvas-sections/${u.sectionId}/blocks`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId: u.blockId, rowSpan: u.rowSpan }),
          });
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [sections, cellSize, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  const lastBlockCount = useRef(0);
  const fetchRef = useRef(fetchSections);
  useEffect(() => { fetchRef.current = fetchSections; }); // latest ref (no tocar refs en render)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`)
        .then((r) => r.json())
        .then((data) => {
          const allBlocks = (data.sections ?? []).flatMap((s: SectionWithBlocks) => s.blocks);
          const draftCount = allBlocks.filter((b: BlockData) => b.status === "DRAFT").length;
          if (draftCount !== lastBlockCount.current) { fetchRef.current(); }
          lastBlockCount.current = draftCount;
        }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId, canvasId]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Grid interactions ───────────────────────────────────────────────────

  const startInteraction = (type: "drag" | "resize", blockId: string, sectionId: string, e: React.MouseEvent) => {
    const gridEl = gridRefs.current[sectionId];
    if (!gridEl) return;
    const block = sections.find((s) => s.id === sectionId)?.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const gridRect = gridEl.getBoundingClientRect();
    const cellW = (gridRect.width + GAP) / GRID_COLS;
    const cellH = cellSize + GAP;

    const blockEl = gridEl.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
    const blockLeft = blockEl ? blockEl.offsetLeft : 0;
    const blockTop = blockEl ? blockEl.offsetTop : 0;
    const startCol = Math.round(blockLeft / cellW);
    const startRow = Math.round(blockTop / cellH);

    setInteraction({ type, blockId, sectionId, col: startCol, row: startRow, w: block.colSpan, h: block.rowSpan });

    const onMouseMove = (ev: MouseEvent) => {
      const relX = ev.clientX - gridRect.left;
      const relY = ev.clientY - gridRect.top;
      const mouseCol = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(relX / cellW)));
      const mouseRow = Math.max(0, Math.floor(relY / cellH));

      if (type === "resize") {
        const newW = Math.min(GRID_COLS - startCol, Math.max(1, mouseCol - startCol + 1));
        const newH = Math.max(1, mouseRow - startRow + 1);
        setInteraction((prev) => prev ? { ...prev, w: newW, h: newH } : null);
      } else {
        const newCol = Math.min(GRID_COLS - block.colSpan, Math.max(0, mouseCol));
        const newRow = Math.max(0, mouseRow);
        setInteraction((prev) => prev ? { ...prev, col: newCol, row: newRow } : null);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setInteraction((prev) => {
        if (!prev) return null;
        const colStart = type === "drag" ? prev.col + 1 : startCol + 1;
        const colSpan = prev.w;
        const rowSpan = prev.h;
        const changed = colStart !== (block.colStart ?? startCol + 1) || colSpan !== block.colSpan || rowSpan !== block.rowSpan;
        if (changed) {
          // Snapshot del layout previo para deshacer (coalesce por bloque: un arrastre = 1 paso).
          const prevLayout = { colSpan: block.colSpan, colStart: block.colStart, rowSpan: block.rowSpan };
          setAllSections((ss) => ss.map((s) =>
            s.id === sectionId
              ? { ...s, blocks: s.blocks.map((b) => b.id === blockId ? { ...b, colSpan, colStart, rowSpan } : b) }
              : s
          ));
          fetch(`/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId, colSpan, colStart, rowSpan }),
          });
          pushUndo({
            scope: undoScope,
            label: type === "resize" ? "Bloque redimensionado" : "Bloque movido",
            coalesceKey: `${undoScope}|layout|${blockId}`,
            undo: async () => {
              setAllSections((ss) => ss.map((s) =>
                s.id === sectionId
                  ? { ...s, blocks: s.blocks.map((b) => b.id === blockId ? { ...b, ...prevLayout } : b) }
                  : s
              ));
              await fetch(blocksUrl(sectionId), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blockId, ...prevLayout }),
              });
              return true;
            },
          });
        }
        return null;
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // ── Block actions ───────────────────────────────────────────────────────

  const handleBlockSave = async (blockId: string, sectionId: string, updates: { content?: string; data?: unknown }) => {
    const snap = findBlockSnap(blockId); // contenido/data ANTES de pisar
    await fetch(`/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, ...updates }),
    });
    fetchSections();
    if (snap) {
      const prev = { content: snap.content ?? "", data: snap.data };
      pushUndo({
        scope: undoScope,
        label: "Bloque editado",
        coalesceKey: `${undoScope}|block|${blockId}`,
        undo: async () => {
          await fetch(blocksUrl(sectionId), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId, ...prev }),
          });
          fetchSections();
          return true;
        },
      });
    }
  };

  const handleBlockAction = async (blockId: string, sectionId: string, action: "accept" | "reject") => {
    const snap = findBlockSnap(blockId);
    if (action === "accept") {
      await fetch(`/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, status: "CONFIRMED" }),
      });
      fetchSections();
      pushUndo({
        scope: undoScope,
        label: "Bloque aceptado",
        undo: async () => {
          await fetch(blocksUrl(sectionId), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId, status: "DRAFT" }),
          });
          fetchSections();
          return true;
        },
      });
    } else {
      await fetch(`/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId }),
      });
      fetchSections();
      // Undo: recrea el bloque (nuevo id, layout por defecto — la grilla reacomoda).
      if (snap) {
        pushUndo({
          scope: undoScope,
          label: "Bloque eliminado",
          undo: async () => {
            await fetch(blocksUrl(sectionId), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blockType: snap.blockType, content: snap.content ?? "", data: snap.data ?? undefined }),
            });
            fetchSections();
            return true;
          },
        });
      }
    }
  };

  const acceptAllDrafts = async () => {
    const promises = sections.flatMap((section) =>
      section.blocks.filter((b) => b.status === "DRAFT").map((block) =>
        fetch(`/api/projects/${projectId}/canvas-sections/${section.id}/blocks`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockId: block.id, status: "CONFIRMED" }),
        })
      )
    );
    await Promise.all(promises);
    fetchSections();
  };

  const draftCount = sections.reduce((sum, s) => sum + s.blocks.filter((b) => b.status === "DRAFT").length, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (<div key={i} className="h-32 rounded-2xl skeleton-shimmer" />))}
      </div>
    );
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Draft banner */}
      {draftCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50 text-amber-300">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            {draftCount} {draftCount === 1 ? "bloque nuevo" : "bloques nuevos"} del agente
          </span>
          <button onClick={acceptAllDrafts}
            className="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 px-2 py-1 rounded hover:bg-amber-100">
            Aceptar todos
          </button>
        </div>
      )}

      {/* Sections */}
      {sections.map((section) => {
        const isCollapsed = collapsedSections.has(section.key);
        const isEmpty = section.blocks.length === 0;
        const isInteracting = interaction?.sectionId === section.id;

        // Calculate how many rows this section needs
        const maxRow = isEmpty ? 2 : section.blocks.reduce((max, b) => {
          const blockCol = (b.colStart ?? 1) - 1;
          // Simple: just stack vertically based on order for now
          return Math.max(max, b.rowSpan);
        }, 0);
        const gridRows = Math.max(GRID_ROWS, maxRow + 4);

        return (
          <div key={section.id}
            className={`rounded-2xl border transition-all ${isEmpty ? "border-dashed border-gray-700 bg-gray-900" : "border-gray-800 bg-gray-900 shadow-sm"}`}>

            <button onClick={() => toggleSection(section.key)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-800/50 transition-colors rounded-t-2xl">
              <span className="text-base">📌</span>
              <h3 className="text-base font-bold text-white flex-1">{section.label}</h3>
              {!isEmpty && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center">
                  {section.blocks.length}
                </span>
              )}
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!isCollapsed && (
              <div className="px-5 pb-5" data-section-id={section.id}>
                {isEmpty ? (
                  <p className="text-sm text-gray-400 py-4">Sin contenido — ejecuta agentes para generar bloques</p>
                ) : (
                  <div
                    className="relative section-grid"
                    ref={(el) => { gridRefs.current[section.id] = el; }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                      gridAutoRows: `${cellSize}px`,
                      gap: `${GAP}px`,
                    }}
                  >
                    {/* Grid overlay during interaction */}
                    {isInteracting && (
                      <div
                        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                          gridTemplateRows: `repeat(${gridRows}, ${cellSize}px)`,
                          gap: `${GAP}px`,
                        }}
                      >
                        {Array.from({ length: GRID_COLS * gridRows }).map((_, i) => {
                          const col = i % GRID_COLS;
                          const row = Math.floor(i / GRID_COLS);
                          const iCol = interaction.col;
                          const iRow = interaction.row;
                          const iW = interaction.w;
                          const iH = interaction.h;
                          const isPreview = col >= iCol && col < iCol + iW && row >= iRow && row < iRow + iH;

                          return (
                            <div
                              key={i}
                              className={`rounded-lg ${
                                isPreview
                                  ? "border-2 border-dashed border-blue-400 bg-blue-50/50"
                                  : "bg-gray-100/40"
                              }`}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Blocks */}
                    {section.blocks.map((block) => {
                      const isActive = interaction?.blockId === block.id;
                      const colSpan = isActive && interaction.type === "resize" ? interaction.w : block.colSpan;
                      const rowSpan = isActive && interaction.type === "resize" ? interaction.h : block.rowSpan;
                      const colStart = isActive && interaction.type === "drag"
                        ? interaction.col + 1
                        : block.colStart;

                      return (
                        <div
                          key={block.id}
                          data-block-id={block.id}
                          className={`group/cell relative bg-white rounded-lg border transition-colors ${
                            isActive
                              ? "ring-2 ring-blue-500 z-30 shadow-lg border-blue-500"
                              : "border-transparent hover:border-blue-400"
                          }`}
                          style={{
                            gridColumn: colStart ? `${colStart} / span ${colSpan}` : `span ${colSpan}`,
                            gridRow: `span ${rowSpan}`,
                          }}
                        >
                          {/* Scrollable content */}
                          <div className="h-full overflow-auto rounded-lg">
                            <BlockRenderer
                              block={block}
                              onAccept={block.status === "DRAFT" ? () => handleBlockAction(block.id, section.id, "accept") : undefined}
                              onReject={block.status === "DRAFT" ? () => handleBlockAction(block.id, section.id, "reject") : undefined}
                              onSave={(updates) => handleBlockSave(block.id, section.id, updates)}
                              onDragStart={(e) => startInteraction("drag", block.id, section.id, e)}
                            />
                          </div>
                          {/* Resize handle — absolute to the grid cell, not the content */}
                          <div
                            className="absolute bottom-1.5 right-1.5 z-20 transition-opacity opacity-0 group-hover/cell:opacity-100"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startInteraction("resize", block.id, section.id, e); }}
                          >
                            <div className="w-4 h-4 flex items-center justify-center cursor-se-resize text-gray-300 hover:text-blue-400 transition-colors">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="12" cy="4" r="1.2" />
                                <circle cx="8" cy="8" r="1.2" />
                                <circle cx="12" cy="8" r="1.2" />
                                <circle cx="4" cy="12" r="1.2" />
                                <circle cx="8" cy="12" r="1.2" />
                                <circle cx="12" cy="12" r="1.2" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
