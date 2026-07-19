"use client";

/**
 * components/canvas/CanvasLinearView.tsx
 *
 * Vista LINEAL de un canvas custom: secciones apiladas una debajo de otra, y
 * dentro de cada una los bloques apilados a ancho completo. SIN grilla de
 * columnas ni drag&drop (ignora colSpan/colStart/rowSpan).
 *
 * Pensada para que el CSE LEA, CORRIJA, AGREGUE lo que sabe y ACEPTE/RECHACE lo
 * del agente — concretamente para el canvas "Handoff" (interno, nunca se publica).
 *
 * Reusa BlockRenderer (desacoplado de la grilla) y el hook useCanvasSections.
 * NO toca SectionBlockList (la grilla sigue sirviendo a los demás canvases).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import BlockRenderer, { type BlockData } from "./BlockRenderer";
import { useCanvasSections } from "./useCanvasSections";
import { CanvasSectionsSkeleton } from "@/components/clients/skeletons";

/** Un bloque "tiene contenido" si su texto o su data traen algo (no un manual vacío). */
function blockHasContent(block: BlockData): boolean {
  if (block.content && block.content.trim().length > 0) return true;
  const d = block.data;
  if (d && typeof d === "object") {
    return Object.values(d as Record<string, unknown>).some((v) =>
      Array.isArray(v) ? v.length > 0 : v != null && v !== "",
    );
  }
  return false;
}

export default function CanvasLinearView({
  projectId,
  canvasId,
  onlyKey,
  canEdit = true,
}: {
  projectId: string;
  canvasId: string;
  // Si viene, renderiza SOLO esa sección (sub-tabs de "Información del cliente").
  onlyKey?: string;
  // RBAC: false = solo lectura (ej. el CSE en el handoff). Default true (kickoff editable).
  canEdit?: boolean;
}) {
  const {
    sections: allSections,
    loading,
    acceptBlock,
    rejectBlock,
    deleteBlock,
    saveBlock,
    addBlock,
    acceptAll: hookAcceptAll,
    error,
    clearError,
    restoreBlock,
  } = useCanvasSections(`/api/projects/${projectId}`, canvasId);

  // Con onlyKey filtramos a una sección; draftCount y "Aceptar todos" se acotan a lo
  // visible (igual que SectionBlockList) para no contar/aceptar otras secciones.
  const sections = onlyKey ? allSections.filter((s) => s.key === onlyKey) : allSections;
  const draftCount = sections.reduce(
    (n, s) => n + s.blocks.filter((b) => b.status === "DRAFT").length,
    0,
  );
  const acceptAll = onlyKey
    ? async () => {
        await Promise.all(
          sections.flatMap((s) =>
            s.blocks.filter((b) => b.status === "DRAFT").map((b) => acceptBlock(s.id, b.id)),
          ),
        );
      }
    : hookAcceptAll;

  // Borrado con feedback: estado "bloqueado" (color + animación) mientras se borra,
  // y un toast flotante para deshacer (~10s) si el bloque borrado tenía contenido.
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ sectionId: string; block: BlockData } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const dismissUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }, []);

  const handleDelete = useCallback(
    async (sectionId: string, block: BlockData) => {
      setDeletingIds((s) => new Set(s).add(block.id));
      await new Promise<void>((r) => setTimeout(r, 350)); // que el estado "bloqueado" se vea
      const ok = await deleteBlock(sectionId, block.id);
      setDeletingIds((s) => { const n = new Set(s); n.delete(block.id); return n; });
      if (!ok) return; // el banner de error ya avisa; el bloque sigue ahí
      if (blockHasContent(block)) {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo({ sectionId, block });
        undoTimer.current = setTimeout(() => setUndo(null), 10000);
      }
    },
    [deleteBlock],
  );

  const handleUndo = useCallback(async () => {
    if (!undo) return;
    const u = undo;
    dismissUndo();
    await restoreBlock(u.sectionId, u.block);
  }, [undo, restoreBlock, dismissUndo]);

  // Cáscara de sección (cabecera + bloques de prosa), no slabs: el canvas Handoff tiene
  // 8-10 secciones de ~200-500px, así que 3 rectángulos de 128px no reservaban nada.
  if (loading) return <CanvasSectionsSkeleton count={onlyKey ? 1 : 4} columns={onlyKey ? 1 : 2} />;

  return (
    <>
    <div className="space-y-5">
      {/* Error de guardado — no silencioso */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/50 text-red-300">
          <span className="text-sm font-medium flex-1">{error}</span>
          <button onClick={clearError} className="text-xs font-semibold text-red-200 hover:text-white px-2 py-1 rounded hover:bg-red-800/40">Cerrar</button>
        </div>
      )}

      {/* Draft banner — solo editores pueden aceptar */}
      {draftCount > 0 && canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/50 text-amber-300">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            {draftCount} {draftCount === 1 ? "bloque nuevo" : "bloques nuevos"} del agente
          </span>
          <button
            onClick={acceptAll}
            className="ml-auto text-xs font-semibold text-amber-200 hover:text-white px-2 py-1 rounded hover:bg-amber-800/40"
          >
            Aceptar todos
          </button>
        </div>
      )}

      {/* Sections — onlyKey: una sección a ancho completo; si no, 2 por fila */}
      <div className={onlyKey ? "space-y-5" : "grid grid-cols-1 lg:grid-cols-2 gap-5 items-start"}>
      {sections.map((section) => (
        <section key={section.id} className="rounded-2xl border border-gray-800 bg-gray-900 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-800">
            <h3 className="text-base font-bold text-white flex-1">{section.label}</h3>
            {section.blocks.length > 0 && (
              <span className="text-[10px] font-medium text-gray-400 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center">
                {section.blocks.length}
              </span>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            {section.blocks.length === 0 ? (
              <p className="text-sm text-gray-400">Sin contenido todavía.</p>
            ) : (
              section.blocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  onAccept={canEdit && block.status === "DRAFT" ? () => acceptBlock(section.id, block.id) : undefined}
                  onReject={canEdit && block.status === "DRAFT" ? () => rejectBlock(section.id, block.id) : undefined}
                  onDelete={canEdit ? () => handleDelete(section.id, block) : undefined}
                  isDeleting={deletingIds.has(block.id)}
                  onSave={canEdit ? (updates) => saveBlock(section.id, block.id, updates) : undefined}
                />
              ))
            )}

            {/* Agregar bloque manual (solo editores) */}
            {canEdit && (
              <button
                onClick={() => addBlock(section.id)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors pt-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar bloque
              </button>
            )}
          </div>
        </section>
      ))}
      </div>
    </div>

    {/* Toast flotante: deshacer borrado (~10s) — solo aparece para bloques con contenido */}
    {undo && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-xl bg-surface border border-line shadow-xl px-4 py-3" role="status">
        <span className="text-sm text-fg">Bloque eliminado</span>
        <button onClick={handleUndo} className="text-sm font-semibold text-brand hover:text-brand-dark transition-colors">Deshacer</button>
        <button onClick={dismissUndo} title="Cerrar" className="text-fg-muted hover:text-fg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    )}
    </>
  );
}
