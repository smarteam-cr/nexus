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

import BlockRenderer from "./BlockRenderer";
import { useCanvasSections } from "./useCanvasSections";

export default function CanvasLinearView({
  projectId,
  canvasId,
}: {
  projectId: string;
  canvasId: string;
}) {
  const {
    sections,
    loading,
    draftCount,
    acceptBlock,
    rejectBlock,
    deleteBlock,
    saveBlock,
    addBlock,
    acceptAll,
  } = useCanvasSections(projectId, canvasId);

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Draft banner */}
      {draftCount > 0 && (
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

      {/* Sections */}
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
                <div key={block.id} className="group/row flex items-start gap-1.5">
                  {/* Gutter: eliminar bloque (cualquier estado) */}
                  <button
                    onClick={() => deleteBlock(section.id, block.id)}
                    title="Eliminar bloque"
                    className="mt-2 flex-shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/row:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <BlockRenderer
                      block={block}
                      onAccept={block.status === "DRAFT" ? () => acceptBlock(section.id, block.id) : undefined}
                      onReject={block.status === "DRAFT" ? () => rejectBlock(section.id, block.id) : undefined}
                      onSave={(updates) => saveBlock(section.id, block.id, updates)}
                    />
                  </div>
                </div>
              ))
            )}

            {/* Agregar bloque manual (lo que el CSE sabe) */}
            <button
              onClick={() => addBlock(section.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors pt-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar bloque
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
