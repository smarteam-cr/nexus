"use client";

/**
 * components/canvas/useCanvasSections.ts
 *
 * Hook cliente compartido para leer y mutar las secciones+bloques de un canvas
 * custom (CanvasSection + CanvasBlock). Lo usan las vistas que NO son la grilla
 * de SectionBlockList: la vista lineal del Handoff y la landing del Kickoff.
 *
 * Pega a los MISMOS endpoints que SectionBlockList (contrato compartido):
 *   GET    /api/projects/[projectId]/canvas-sections?canvasId=
 *   POST   /api/projects/[projectId]/canvas-sections/[sectionId]/blocks   (crear, HUMAN/CONFIRMED)
 *   PUT    .../blocks  { blockId, content?|data?|status? }                 (editar / aceptar)
 *   DELETE .../blocks  { blockId }                                         (rechazar / eliminar)
 *
 * NO toca SectionBlockList (que sigue sirviendo a Diagnóstico/Planificación/etc.).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { BlockData } from "./BlockRenderer";

export interface SectionWithBlocks {
  id: string;
  key: string;
  label: string;
  order: number;
  layout: unknown;
  blocks: BlockData[];
}

export function useCanvasSections(projectId: string, canvasId: string) {
  const [sections, setSections] = useState<SectionWithBlocks[]>([]);
  const [loading, setLoading] = useState(true);

  const listUrl = `/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`;
  const blocksUrl = (sectionId: string) =>
    `/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`;

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [listUrl]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Polling: el agente escribe bloques DRAFT de forma asíncrona. Si cambia el
  // conteo de borradores, refrescamos (mismo patrón que SectionBlockList).
  const lastDraft = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const id = setInterval(() => {
      fetch(listUrl)
        .then((r) => r.json())
        .then((data) => {
          const drafts = (data.sections ?? [])
            .flatMap((s: SectionWithBlocks) => s.blocks)
            .filter((b: BlockData) => b.status === "DRAFT").length;
          if (drafts !== lastDraft.current) refetchRef.current();
          lastDraft.current = drafts;
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [listUrl]);

  const acceptBlock = useCallback(
    async (sectionId: string, blockId: string) => {
      await fetch(blocksUrl(sectionId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, status: "CONFIRMED" }),
      });
      refetch();
    },
    [projectId, refetch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Rechazar (borrador) y eliminar (confirmado) usan el MISMO endpoint DELETE.
  const deleteBlock = useCallback(
    async (sectionId: string, blockId: string) => {
      await fetch(blocksUrl(sectionId), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId }),
      });
      refetch();
    },
    [projectId, refetch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const saveBlock = useCallback(
    async (sectionId: string, blockId: string, updates: { content?: string; data?: unknown }) => {
      await fetch(blocksUrl(sectionId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, ...updates }),
      });
      refetch();
    },
    [projectId, refetch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const addBlock = useCallback(
    async (sectionId: string, blockType: string = "TEXT", content: string = "") => {
      await fetch(blocksUrl(sectionId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockType, content }),
      });
      refetch();
    },
    [projectId, refetch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const acceptAll = useCallback(async () => {
    const promises = sections.flatMap((s) =>
      s.blocks
        .filter((b) => b.status === "DRAFT")
        .map((b) =>
          fetch(blocksUrl(s.id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId: b.id, status: "CONFIRMED" }),
          }),
        ),
    );
    await Promise.all(promises);
    refetch();
  }, [sections, projectId, refetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftCount = sections.reduce(
    (n, s) => n + s.blocks.filter((b) => b.status === "DRAFT").length,
    0,
  );

  return {
    sections,
    loading,
    draftCount,
    refetch,
    acceptBlock,
    rejectBlock: deleteBlock,
    deleteBlock,
    saveBlock,
    addBlock,
    acceptAll,
  };
}
