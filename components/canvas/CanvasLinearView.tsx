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
import { Alert } from "@/components/ui";
import { BotonAzul, BotonTexto, FranjaDeSugerencias, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";

/* La cáscara de cada sección, con el sistema «Nexus · interfaz interna» (2026-10-04): tarjeta
   blanca de radio 12, sin sombras ni anillos, y solo tokens (se ve igual en claro y en oscuro).
   La destacada se distingue por ir a todo el ancho y con su rótulo, no por un borde de color. */
const SECCION_NORMAL = "rounded-xl border border-line bg-surface";
const SECCION_PRINCIPAL = "rounded-xl border border-line bg-surface lg:col-span-2";
const CABECERA = "flex items-center gap-2 border-b border-line px-5 py-3.5";

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
  destacarKey,
}: {
  projectId: string;
  canvasId: string;
  // Si viene, renderiza SOLO esa sección (sub-tabs de "Información del cliente").
  onlyKey?: string;
  // RBAC: false = solo lectura (ej. el CSE en el handoff). Default true (kickoff editable).
  canEdit?: boolean;
  /* La sección que explica el PROPÓSITO del documento: se pinta primera en jerarquía, a ancho
     completo y con acento de marca. La decide quien monta la vista (el handoff pasa
     HANDOFF_SECCION_PRINCIPAL); sin la prop, todas se ven iguales, como siempre. */
  destacarKey?: string;
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
    <div className="space-y-4">
      {/* Error de guardado — no silencioso */}
      {error && (
        <Alert variant="danger" title="No se pudo guardar">
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex-1">{error}</span>
            <BotonTexto onClick={clearError}>Cerrar</BotonTexto>
          </span>
        </Alert>
      )}

      {/* Lo que propuso el agente y espera decisión: la franja azul de las piezas, con «Usar todos». */}
      {draftCount > 0 && canEdit && (
        <FranjaDeSugerencias acciones={<BotonAzul onClick={() => void acceptAll()}>Usar todos</BotonAzul>}>
          El agente propone {draftCount} {draftCount === 1 ? "bloque nuevo" : "bloques nuevos"}: úsalos o descártalos uno por uno.
        </FranjaDeSugerencias>
      )}

      {/* Sections — onlyKey: una sección a ancho completo; si no, 2 por fila */}
      <div className={onlyKey ? "space-y-4" : "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start"}>
      {sections.map((section) => {
        const destacada = section.key === destacarKey;
        return (
        <section key={section.id} className={destacada ? SECCION_PRINCIPAL : SECCION_NORMAL}>
          <div className={CABECERA}>
            <div className="flex-1 min-w-0">
              {destacada && <p className={`${ROTULO_DEL_SISTEMA} mb-0.5`}>El propósito del proyecto</p>}
              <h3 className="text-[15px] font-semibold text-fg">{section.label}</h3>
            </div>
            {section.blocks.length > 0 && (
              <span className="rounded-full border border-line bg-surface-muted px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted">
                {section.blocks.length}
              </span>
            )}
          </div>

          <div className="px-4 py-3 space-y-2">
            {section.blocks.length === 0 ? (
              <p className="px-1 text-[13px] text-fg-muted">Sin contenido todavía.</p>
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
                className="flex items-center gap-1.5 px-1 pt-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar bloque
              </button>
            )}
          </div>
        </section>
        );
      })}
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
