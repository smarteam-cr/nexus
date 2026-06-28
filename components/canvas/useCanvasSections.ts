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
  /** Título de cara al cliente editado por el CSE; null = título por defecto de la plantilla. */
  titleOverride: string | null;
  /** Eyebrow (título pequeño) editado por el CSE; null = eyebrow por defecto. */
  eyebrowOverride: string | null;
  /** Guía del agente editada por el CSE (business case). null = brief por defecto de la config. */
  agentBriefOverride: string | null;
  /** Valor anterior de title/eyebrow/brief para el deshacer de 1 nivel (null = nada que deshacer). */
  previousTitleOverride: string | null;
  previousEyebrowOverride: string | null;
  previousAgentBriefOverride: string | null;
  order: number;
  layout: unknown;
  blocks: BlockData[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useCanvasSections(
  // Base de las rutas de canvas: `/api/projects/${projectId}` (kickoff/handoff) o
  // `/api/business-cases/${id}` (Ventas). Permite reusar el hook (y KickoffLanding)
  // para canvases que cuelgan de un BusinessCase, no solo de un Project.
  basePath: string,
  canvasId: string,
  // D.3 staging — se dispara tras CUALQUIER mutación de contenido exitosa (bloque o
  // metadata de sección). Lo usa el kickoff para encender la barra "cambios sin subir"
  // en el acto. Por ref → no invalida la memoización de mutate/patchSection.
  onContentChange?: () => void,
  // Opciones. `poll` (default true): polling de 5s para captar bloques DRAFT que el
  // agente escribe async (kickoff). El business case lo pone en false: su generación
  // es SÍNCRONA (refetch explícito tras /generate), así que el polling solo causaría
  // re-renders periódicos innecesarios (parpadeo del editor inline).
  options?: { poll?: boolean },
) {
  const pollEnabled = options?.poll !== false;
  const [sections, setSections] = useState<SectionWithBlocks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Última serialización aplicada → guard de igualdad: si un refetch trae contenido
  // idéntico (p.ej. un tick de polling sin cambios), NO reemplazamos el array (evita
  // re-renders y churn del árbol de edición sin motivo).
  const lastSectionsJson = useRef<string>("");
  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  const listUrl = `${basePath}/canvas-sections?canvasId=${canvasId}`;
  const blocksUrl = (sectionId: string) =>
    `${basePath}/canvas-sections/${sectionId}/blocks`;

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      const next: SectionWithBlocks[] = data.sections ?? [];
      const serialized = JSON.stringify(next);
      // Guard de igualdad: solo actualizamos si el contenido cambió (los ids de
      // sección son únicos por canvas → cambiar de canvas siempre difiere).
      if (serialized !== lastSectionsJson.current) {
        lastSectionsJson.current = serialized;
        setSections(next);
      }
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
    if (!pollEnabled) return; // el business case no necesita polling (generación síncrona)
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
  }, [listUrl, pollEnabled]);

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
        onContentChangeRef.current?.();
        return true;
      } catch (e) {
        console.error("[useCanvasSections] error de red al guardar", e);
        setError("Error de conexión al guardar el bloque.");
        return false;
      }
    },
    [basePath], // eslint-disable-line react-hooks/exhaustive-deps
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
    async (sectionId: string, blockId: string): Promise<boolean> => {
      const ok = await mutate(sectionId, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ blockId }) });
      if (ok) refetch();
      return ok;
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

  // Deshacer de 1 nivel un bloque: intercambia content/data con su versión previa
  // (persistida en previous*). Devuelve true si OK.
  const undoBlock = useCallback(
    async (sectionId: string, blockId: string): Promise<boolean> => {
      const ok = await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, undo: true }) });
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
    [basePath], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const addBlock = useCallback(
    async (sectionId: string, blockType: string = "TEXT", content: string = "") => {
      await mutate(sectionId, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ blockType, content }) });
      refetch();
    },
    [mutate, refetch],
  );

  // Recrea un bloque borrado (undo): POST con su tipo + contenido + data. Vuelve como
  // HUMAN/CONFIRMED al final de la sección (nuevo id). Devuelve true si guardó.
  const restoreBlock = useCallback(
    async (
      sectionId: string,
      block: { blockType: string; content: string | null; data: unknown },
    ): Promise<boolean> => {
      const ok = await mutate(sectionId, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ blockType: block.blockType, content: block.content ?? "", data: block.data ?? undefined }),
      });
      if (ok) refetch();
      return ok;
    },
    [mutate, refetch],
  );

  // PATCH de metadata de sección (title/eyebrow de cara al cliente, o undo). Refetchea para
  // traer el estado canónico (incluye previous* que habilita el botón "Deshacer"). No usa el
  // endpoint de blocks (es metadata de sección) → PATCH dedicado.
  const patchSection = useCallback(
    async (sectionId: string, body: Record<string, unknown>, errMsg: string): Promise<boolean> => {
      try {
        const res = await fetch(`${basePath}/canvas-sections/${sectionId}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError(errMsg);
          refetch();
          return false;
        }
        setError(null);
        refetch();
        onContentChangeRef.current?.();
        return true;
      } catch {
        setError(errMsg);
        refetch();
        return false;
      }
    },
    [basePath, refetch],
  );

  // Título grande. String vacío → vuelve al título por defecto de la plantilla. Optimista.
  const renameSection = useCallback(
    (sectionId: string, title: string): Promise<boolean> => {
      const t = title.trim() || null;
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, titleOverride: t } : s)));
      return patchSection(sectionId, { titleOverride: t }, "No se pudo guardar el título. Reintentá.");
    },
    [patchSection],
  );

  // Eyebrow (título pequeño). String vacío → default.
  const setEyebrow = useCallback(
    (sectionId: string, eyebrow: string): Promise<boolean> => {
      const e = eyebrow.trim() || null;
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, eyebrowOverride: e } : s)));
      return patchSection(sectionId, { eyebrowOverride: e }, "No se pudo guardar el subtítulo. Reintentá.");
    },
    [patchSection],
  );

  // Guía del agente por sección (business case). String vacío → vuelve al brief por defecto.
  const setBrief = useCallback(
    (sectionId: string, brief: string): Promise<boolean> => {
      const b = brief.trim() || null;
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, agentBriefOverride: b } : s)));
      return patchSection(sectionId, { agentBriefOverride: b }, "No se pudo guardar la guía. Reintentá.");
    },
    [patchSection],
  );

  // Deshacer de 1 nivel (toggle actual↔previous) del título, el eyebrow o la guía de una sección.
  const undoSection = useCallback(
    (sectionId: string, which: "title" | "eyebrow" | "brief"): Promise<boolean> =>
      patchSection(sectionId, { undo: which }, "No se pudo deshacer. Reintentá."),
    [patchSection],
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
    undoBlock,
    addBlock,
    restoreBlock,
    renameSection,
    setEyebrow,
    setBrief,
    undoSection,
    acceptAll,
  };
}
