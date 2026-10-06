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

import { useState, useRef, useCallback } from "react";
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
  // La raíz de la vista: el ancla del deshacer global. Con ella, Ctrl+Z no deshace lo de este
  // documento mientras está oculto (otra pestaña de la ficha, o el handoff de un proyecto hermano).
  const raizRef = useRef<HTMLDivElement>(null);
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
  } = useCanvasSections(`/api/projects/${projectId}`, canvasId, undefined, { anclaDeDeshacer: raizRef });

  // Con onlyKey filtramos a una sección; draftCount y "Aceptar todos" se acotan a lo
  // visible (igual que SectionBlockList) para no contar/aceptar otras secciones.
  const sections = onlyKey ? allSections.filter((s) => s.key === onlyKey) : allSections;
  const draftCount = sections.reduce(
    (n, s) => n + s.blocks.filter((b) => b.status === "DRAFT").length,
    0,
  );
  /* «Usar todos» es UN paso de deshacer también con una sola sección: antes, con `onlyKey`, se
     aceptaba bloque por bloque y quedaban N pasos en la pila. */
  const acceptAll = () => hookAcceptAll(onlyKey ? sections.map((s) => s.id) : undefined);

  /* Borrado con feedback: estado "bloqueado" (color + animación) mientras se borra.
     ⛔ El deshacer es UNO, el global (aviso «Bloque eliminado · Deshacer» y Ctrl+Z), que registra
     `deleteBlock`. Acá había un SEGUNDO aviso propio con su propio «Deshacer»: usar los dos
     recreaba el bloque DOS veces (auditoría del deshacer, 2026-10-05). */
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleDelete = useCallback(
    async (sectionId: string, block: BlockData) => {
      setDeletingIds((s) => new Set(s).add(block.id));
      await new Promise<void>((r) => setTimeout(r, 350)); // que el estado "bloqueado" se vea
      await deleteBlock(sectionId, block.id); // si falla, el banner de error avisa y el bloque sigue ahí
      setDeletingIds((s) => { const n = new Set(s); n.delete(block.id); return n; });
    },
    [deleteBlock],
  );

  // Cáscara de sección (cabecera + bloques de prosa), no slabs: el canvas Handoff tiene
  // 8-10 secciones de ~200-500px, así que 3 rectángulos de 128px no reservaban nada.
  if (loading) return <CanvasSectionsSkeleton count={onlyKey ? 1 : 4} columns={onlyKey ? 1 : 2} />;

  return (
    <div ref={raizRef} className="space-y-4">
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
  );
}
