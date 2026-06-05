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
 * Las mutaciones chequean res.ok y exponen `error` — NO tragan el fallo. (Un PUT
 * que fallaba en silencio fue lo que ocultó el bug de persistencia de edición.)
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

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useCanvasSections(projectId: string, canvasId: string) {
  const [sections, setSections] = useState<SectionWithBlocks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listUrl = `/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`;
  const blocksUrl = (sectionId: string) =>
    `/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`;

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch {
      /* ignore: lectura; el polling reintenta */
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

  const clearError = useCallback(() => setError(null), []);

  /**
   * Ejecuta una mutación contra el endpoint de blocks. Chequea res.ok: si falla,
   * loggea, setea `error` y devuelve false (NO traga el fallo). Devuelve true si OK.
   */
  const mutate = useCallback(
    async (sectionId: string, init: RequestInit): Promise<boolean> => {
      try {
        const res = await fetch(blocksUrl(sectionId), init);
        if (!res.ok) {
          let detail = "";
          try {
            detail = (await res.json())?.error ?? "";
          } catch {
            /* respuesta sin JSON */
          }
          console.error(`[useCanvasSections] ${init.method} → ${res.status} ${detail}`);
          setError("No se pudo guardar el cambio. Reintentá; si persiste, revisá la conexión o avisá al equipo.");
          return false;
        }
        setError(null);
        return true;
      } catch (e) {
        console.error("[useCanvasSections] error de red al guardar", e);
        setError("Error de conexión al guardar el bloque.");
        return false;
      }
    },
    [projectId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const acceptBlock = useCallback(
    async (sectionId: string, blockId: string) => {
      await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, status: "CONFIRMED" }) });
      refetch();
    },
    [mutate, refetch],
  );

  // Rechazar (borrador) y eliminar (confirmado) usan el MISMO endpoint DELETE.
  const deleteBlock = useCallback(
    async (sectionId: string, blockId: string) => {
      await mutate(sectionId, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ blockId }) });
      refetch();
    },
    [mutate, refetch],
  );

  // Devuelve true si guardó, false si falló. En FALLO no refrescamos: el editor
  // se queda abierto con el texto del CSE (el caller no debe cerrarlo) para que no
  // se pierda. Solo en éxito refrescamos para traer el estado canónico del server.
  const saveBlock = useCallback(
    async (sectionId: string, blockId: string, updates: { content?: string; data?: unknown }): Promise<boolean> => {
      const ok = await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, ...updates }) });
      if (ok) refetch();
      return ok;
    },
    [mutate, refetch],
  );

  // Edición granular por IA: pide al endpoint de regen el content/data nuevo de un
  // bloque y lo DEVUELVE (no escribe). El guardado real lo hace saveBlock (PUT) — la
  // misma vía. Devuelve null si falló.
  const regenerateBlock = useCallback(
    async (
      sectionId: string,
      blockId: string,
      instruction: string,
      // Multi-turno (B.2): si viene, la regen parte de este draft en progreso en vez del
      // bloque guardado. Sin base = single-turn (idéntico a B.1).
      base?: { content?: string | null; data?: unknown },
    ): Promise<{ content?: string | null; data?: unknown } | null> => {
      try {
        const res = await fetch(`${blocksUrl(sectionId)}/regenerate`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(base ? { blockId, instruction, base } : { blockId, instruction }),
        });
        if (!res.ok) {
          let detail = "";
          try {
            detail = (await res.json())?.error ?? "";
          } catch {
            /* sin JSON */
          }
          console.error(`[useCanvasSections] regenerate → ${res.status} ${detail}`);
          setError("No se pudo regenerar el bloque con IA. Reintentá.");
          return null;
        }
        setError(null);
        return (await res.json()) as { content?: string | null; data?: unknown };
      } catch (e) {
        console.error("[useCanvasSections] error de red al regenerar", e);
        setError("Error de conexión al regenerar el bloque.");
        return null;
      }
    },
    [projectId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const addBlock = useCallback(
    async (sectionId: string, blockType: string = "TEXT", content: string = "") => {
      await mutate(sectionId, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ blockType, content }) });
      refetch();
    },
    [mutate, refetch],
  );

  const acceptAll = useCallback(async () => {
    const drafts = sections.flatMap((s) =>
      s.blocks.filter((b) => b.status === "DRAFT").map((b) => ({ sectionId: s.id, blockId: b.id })),
    );
    await Promise.all(
      drafts.map((d) =>
        mutate(d.sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId: d.blockId, status: "CONFIRMED" }) }),
      ),
    );
    refetch();
  }, [sections, mutate, refetch]);

  const draftCount = sections.reduce(
    (n, s) => n + s.blocks.filter((b) => b.status === "DRAFT").length,
    0,
  );

  return {
    sections,
    loading,
    error,
    clearError,
    draftCount,
    refetch,
    acceptBlock,
    rejectBlock: deleteBlock,
    deleteBlock,
    saveBlock,
    regenerateBlock,
    addBlock,
    acceptAll,
  };
}
