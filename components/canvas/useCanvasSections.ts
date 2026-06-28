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
import { useUndo } from "@/components/ui/UndoProvider";

export interface SectionWithBlocks {
  id: string;
  key: string;
  label: string;
  /** Título de cara al cliente editado por el CSE; null = título por defecto de la plantilla. */
  titleOverride: string | null;
  /** Eyebrow (título pequeño) editado por el CSE; null = eyebrow por defecto. */
  eyebrowOverride: string | null;
  /** Valor anterior de title/eyebrow para el deshacer de 1 nivel (null = nada que deshacer). */
  previousTitleOverride: string | null;
  previousEyebrowOverride: string | null;
  order: number;
  layout: unknown;
  blocks: BlockData[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function useCanvasSections(
  projectId: string,
  canvasId: string,
  // D.3 staging — se dispara tras CUALQUIER mutación de contenido exitosa (bloque o
  // metadata de sección). Lo usa el kickoff para encender la barra "cambios sin subir"
  // en el acto. Por ref → no invalida la memoización de mutate/patchSection.
  onContentChange?: () => void,
) {
  const [sections, setSections] = useState<SectionWithBlocks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  // ── Undo global ──────────────────────────────────────────────────────────────
  // Cada mutación exitosa registra un comando de deshacer (snapshot del cliente → re-PUT/recreate).
  // Scope por canvas: al desmontar la superficie se purgan sus entradas (no aplican a otro canvas).
  const { pushUndo, registerScope } = useUndo();
  const undoScope = `canvas:${projectId}:${canvasId}`;
  useEffect(() => registerScope(undoScope), [registerScope, undoScope]);
  const sectionsRef = useRef(sections);
  const findBlock = useCallback(
    (blockId: string): BlockData | undefined =>
      sectionsRef.current.flatMap((s) => s.blocks).find((b) => b.id === blockId),
    [],
  );
  // Refs a los mutadores para que los closures de undo siempre llamen la versión vigente
  // (evita ciclos en useCallback y closures stale).
  const saveBlockRef = useRef<
    (sectionId: string, blockId: string, updates: { content?: string; data?: unknown }, skipUndo?: boolean) => Promise<boolean>
  >(null!);
  const restoreBlockRef = useRef<
    (sectionId: string, block: { blockType: string; content: string | null; data: unknown }) => Promise<boolean>
  >(null!);
  const setStatusRef = useRef<
    (sectionId: string, blockId: string, status: "DRAFT" | "CONFIRMED", skipUndo?: boolean) => Promise<boolean>
  >(null!);
  const renameSectionRef = useRef<(sectionId: string, title: string, skipUndo?: boolean) => Promise<boolean>>(null!);
  const setEyebrowRef = useRef<(sectionId: string, eyebrow: string, skipUndo?: boolean) => Promise<boolean>>(null!);

  const listUrl = `/api/projects/${projectId}/canvas-sections?canvasId=${canvasId}`;
  const blocksUrl = useCallback(
    (sectionId: string) => `/api/projects/${projectId}/canvas-sections/${sectionId}/blocks`,
    [projectId],
  );

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
        onContentChangeRef.current?.();
        return true;
      } catch (e) {
        console.error("[useCanvasSections] error de red al guardar", e);
        setError("Error de conexión al guardar el bloque.");
        return false;
      }
    },
    [blocksUrl],
  );

  // Cambia el status del bloque (aceptar=CONFIRMED / volver a borrador=DRAFT). Registra undo
  // al estado previo salvo que `skipUndo` (cuando lo invoca el propio undo).
  const setStatus = useCallback(
    async (sectionId: string, blockId: string, status: "DRAFT" | "CONFIRMED", skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? undefined : findBlock(blockId)?.status;
      const ok = await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, status }) });
      if (ok) {
        refetch();
        if (!skipUndo && (prev === "DRAFT" || prev === "CONFIRMED") && prev !== status) {
          const p = prev;
          pushUndo({
            scope: undoScope,
            label: status === "CONFIRMED" ? "Bloque aceptado" : "Bloque a borrador",
            undo: () => setStatusRef.current(sectionId, blockId, p, true),
          });
        }
      }
      return ok;
    },
    [mutate, refetch, pushUndo, undoScope, findBlock],
  );

  const acceptBlock = useCallback(
    async (sectionId: string, blockId: string) => {
      await setStatus(sectionId, blockId, "CONFIRMED");
    },
    [setStatus],
  );

  // Rechazar (borrador) y eliminar (confirmado) usan el MISMO endpoint DELETE. Registra undo:
  // recrea el bloque con su tipo+contenido+data (nuevo id) salvo `skipUndo`.
  const deleteBlock = useCallback(
    async (sectionId: string, blockId: string, skipUndo = false): Promise<boolean> => {
      const snap = skipUndo ? undefined : findBlock(blockId);
      const ok = await mutate(sectionId, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ blockId }) });
      if (ok) {
        refetch();
        if (!skipUndo && snap) {
          const block = { blockType: snap.blockType, content: snap.content, data: snap.data };
          pushUndo({
            scope: undoScope,
            label: "Bloque eliminado",
            undo: () => restoreBlockRef.current(sectionId, block),
          });
        }
      }
      return ok;
    },
    [mutate, refetch, pushUndo, undoScope, findBlock],
  );

  // Devuelve true si guardó, false si falló. En FALLO no refrescamos: el editor
  // se queda abierto con el texto del CSE (el caller no debe cerrarlo) para que no
  // se pierda. Solo en éxito refrescamos para traer el estado canónico del server.
  const saveBlock = useCallback(
    async (sectionId: string, blockId: string, updates: { content?: string; data?: unknown }, skipUndo = false): Promise<boolean> => {
      // Snapshot del cliente ANTES de pisar (no usamos el toggle de 1 nivel del server → multi-nivel).
      const snap = skipUndo ? undefined : findBlock(blockId);
      const ok = await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, ...updates }) });
      if (ok) {
        refetch();
        if (!skipUndo && snap) {
          const prev = { content: snap.content ?? "", data: snap.data };
          pushUndo({
            scope: undoScope,
            label: "Bloque editado",
            coalesceKey: `${undoScope}|block|${blockId}`,
            undo: () => saveBlockRef.current(sectionId, blockId, prev, true),
          });
        }
      }
      return ok;
    },
    [mutate, refetch, pushUndo, undoScope, findBlock],
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
    [blocksUrl],
  );

  const addBlock = useCallback(
    async (sectionId: string, blockType: string = "TEXT", content: string = "") => {
      // Fetch directo (no `mutate`) para capturar el id del bloque creado → habilita el undo (borrarlo).
      try {
        const res = await fetch(blocksUrl(sectionId), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ blockType, content }),
        });
        if (!res.ok) {
          setError("No se pudo agregar el bloque. Reintentá.");
          return;
        }
        setError(null);
        const created = (await res.json().catch(() => null)) as { id?: string } | null;
        refetch();
        onContentChangeRef.current?.();
        if (created?.id) {
          const newId = created.id;
          pushUndo({
            scope: undoScope,
            label: "Bloque agregado",
            undo: () => deleteBlock(sectionId, newId, true),
          });
        }
      } catch {
        setError("Error de conexión al agregar el bloque.");
      }
    },
    [blocksUrl, refetch, pushUndo, undoScope, deleteBlock],
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
        const res = await fetch(`/api/projects/${projectId}/canvas-sections/${sectionId}`, {
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
    [projectId, refetch],
  );

  // Título grande. String vacío → vuelve al título por defecto de la plantilla. Optimista.
  const renameSection = useCallback(
    (sectionId: string, title: string, skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? null : sectionsRef.current.find((s) => s.id === sectionId)?.titleOverride ?? null;
      const t = title.trim() || null;
      setSections((cur) => cur.map((s) => (s.id === sectionId ? { ...s, titleOverride: t } : s)));
      if (!skipUndo) {
        pushUndo({
          scope: undoScope,
          label: "Título de sección",
          coalesceKey: `${undoScope}|section-title|${sectionId}`,
          undo: () => renameSectionRef.current(sectionId, prev ?? "", true),
        });
      }
      return patchSection(sectionId, { titleOverride: t }, "No se pudo guardar el título. Reintentá.");
    },
    [patchSection, pushUndo, undoScope],
  );

  // Eyebrow (título pequeño). String vacío → default.
  const setEyebrow = useCallback(
    (sectionId: string, eyebrow: string, skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? null : sectionsRef.current.find((s) => s.id === sectionId)?.eyebrowOverride ?? null;
      const e = eyebrow.trim() || null;
      setSections((cur) => cur.map((s) => (s.id === sectionId ? { ...s, eyebrowOverride: e } : s)));
      if (!skipUndo) {
        pushUndo({
          scope: undoScope,
          label: "Subtítulo de sección",
          coalesceKey: `${undoScope}|section-eyebrow|${sectionId}`,
          undo: () => setEyebrowRef.current(sectionId, prev ?? "", true),
        });
      }
      return patchSection(sectionId, { eyebrowOverride: e }, "No se pudo guardar el subtítulo. Reintentá.");
    },
    [patchSection, pushUndo, undoScope],
  );

  // "Latest ref" pattern: sincronizamos los refs DESPUÉS del render (no durante) — los closures de
  // undo y el polling siempre ven la versión vigente sin violar las reglas de hooks.
  useEffect(() => {
    sectionsRef.current = sections;
    refetchRef.current = refetch;
    saveBlockRef.current = saveBlock;
    restoreBlockRef.current = restoreBlock;
    setStatusRef.current = setStatus;
    renameSectionRef.current = renameSection;
    setEyebrowRef.current = setEyebrow;
  });

  // Deshacer de 1 nivel (toggle actual↔previous) del título o el eyebrow de una sección.
  const undoSection = useCallback(
    (sectionId: string, which: "title" | "eyebrow"): Promise<boolean> =>
      patchSection(sectionId, { undo: which }, "No se pudo deshacer. Reintentá."),
    [patchSection],
  );

  const acceptAll = useCallback(async () => {
    const drafts = sections.flatMap((s) =>
      s.blocks.filter((b) => b.status === "DRAFT").map((b) => ({ sectionId: s.id, blockId: b.id })),
    );
    if (drafts.length === 0) return;
    await Promise.all(
      drafts.map((d) =>
        mutate(d.sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId: d.blockId, status: "CONFIRMED" }) }),
      ),
    );
    refetch();
    // Undo: vuelve a borrador exactamente los bloques que este "aceptar todos" confirmó.
    pushUndo({
      scope: undoScope,
      label: "Bloques aceptados",
      undo: async () => {
        await Promise.all(
          drafts.map((d) =>
            mutate(d.sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId: d.blockId, status: "DRAFT" }) }),
          ),
        );
        refetch();
        return true;
      },
    });
  }, [sections, mutate, refetch, pushUndo, undoScope]);

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
    undoSection,
    acceptAll,
  };
}
