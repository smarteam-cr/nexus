"use client";

/**
 * components/canvas/useCanvasSections.ts
 *
 * Hook cliente compartido para leer y mutar las secciones+bloques de un canvas
 * custom (CanvasSection + CanvasBlock). Lo usan las vistas que NO son la grilla
 * de SectionBlockList: la vista lineal del Handoff, la landing del Kickoff y el
 * workspace de Business Cases (canvases que cuelgan de un BusinessCase).
 *
 * Pega a los MISMOS endpoints que SectionBlockList (contrato compartido), bajo
 * `basePath` (`/api/projects/[id]` o `/api/business-cases/[id]`):
 *   GET    {basePath}/canvas-sections?canvasId=
 *   POST   {basePath}/canvas-sections/[sectionId]/blocks   (crear, HUMAN/CONFIRMED)
 *   PUT    .../blocks  { blockId, content?|data?|status? }  (editar / aceptar)
 *   DELETE .../blocks  { blockId }                          (rechazar / eliminar)
 *
 * Las mutaciones chequean res.ok y exponen `error` — NO tragan el fallo. (Un PUT
 * que fallaba en silencio fue lo que ocultó el bug de persistencia de edición.)
 *
 * UNDO global: cada mutación exitosa registra un comando de deshacer (snapshot del
 * cliente → re-PUT/recreate) vía useUndo. Scope por canvas (basePath:canvasId); al
 * desmontar la superficie se purgan sus entradas. NO toca SectionBlockList.
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
  /** Guía del agente editada por el CSE (business case). null = brief por defecto de la config. */
  agentBriefOverride: string | null;
  /** Valor anterior de title/eyebrow/brief para el deshacer de 1 nivel (null = nada que deshacer). */
  previousTitleOverride: string | null;
  previousEyebrowOverride: string | null;
  previousAgentBriefOverride: string | null;
  /** El CSE ocultó la sección (business case): no se publica al cliente. Default false. */
  hidden?: boolean;
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

  // ── Undo global ──────────────────────────────────────────────────────────────
  // Cada mutación exitosa registra un comando de deshacer (snapshot del cliente → re-PUT/recreate).
  // Scope por canvas (basePath identifica al dueño: proyecto o business case); se purga al desmontar.
  const { pushUndo, registerScope } = useUndo();
  const undoScope = `canvas:${basePath}:${canvasId}`;
  useEffect(() => registerScope(undoScope), [registerScope, undoScope]);
  const sectionsRef = useRef(sections);
  const findBlock = useCallback(
    (blockId: string): BlockData | undefined =>
      sectionsRef.current.flatMap((s) => s.blocks).find((b) => b.id === blockId),
    [],
  );
  const findSection = useCallback(
    (sectionId: string): SectionWithBlocks | undefined =>
      sectionsRef.current.find((s) => s.id === sectionId),
    [],
  );
  // Refs a los mutadores para que los closures de undo siempre llamen la versión vigente
  // (evita ciclos en useCallback y closures stale). Se sincronizan en un effect (no en render).
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
  const setBriefRef = useRef<(sectionId: string, brief: string, skipUndo?: boolean) => Promise<boolean>>(null!);
  const reorderSectionsRef = useRef<(orderedIds: string[], skipUndo?: boolean) => Promise<boolean>>(null!);

  const listUrl = `${basePath}/canvas-sections?canvasId=${canvasId}`;
  const blocksUrl = useCallback(
    (sectionId: string) => `${basePath}/canvas-sections/${sectionId}/blocks`,
    [basePath],
  );

  // Secuencia de ESCRITURAS optimistas: un refetch que arrancó ANTES de la última
  // escritura trae un snapshot stale del server → si lo aplicáramos, revertiría
  // visualmente lo que el usuario acaba de tipear (los números "que se borran").
  const writeSeq = useRef(0);

  // Contador de escrituras EN VUELO (PUT/PATCH de contenido/orden/visibilidad —
  // NO lecturas). El guardado es optimista y "fire and forget" desde el caller
  // (onSectionChange no espera saveBlock): sin esto, publicar justo después de
  // tipear/arrastrar podría leer la DB ANTES de que el último request llegara →
  // "la versión publicada no es la última mostrada". `flushPending` lo espera.
  const pendingWrites = useRef(0);
  const flushPending = useCallback(async (): Promise<void> => {
    // Cap defensivo (5s): un fetch que jamás resuelve (red caída) no debe colgar
    // el publish para siempre — mejor publicar lo último asentado y seguir.
    for (let i = 0; i < 100 && pendingWrites.current > 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  const refetch = useCallback(async () => {
    const seqAtStart = writeSeq.current;
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      if (writeSeq.current !== seqAtStart) return; // hubo escrituras más nuevas: no pisarlas
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
      pendingWrites.current++;
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
      } finally {
        pendingWrites.current--;
      }
    },
    [blocksUrl],
  );

  // Cambia el status del bloque (aceptar=CONFIRMED / volver a borrador=DRAFT). Registra undo
  // al estado previo salvo `skipUndo` (cuando lo invoca el propio undo).
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
      // OPTIMISTA e INMEDIATO: aplicar al estado local ANTES del PUT. Sin esto, un
      // commit rápido en otro campo se arma con `data` stale (el PUT+refetch del
      // anterior aún no volvió) y PISA el cambio previo — números que "se borran".
      writeSeq.current++;
      setSections((prev) =>
        prev.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                blocks: s.blocks.map((b) =>
                  b.id !== blockId
                    ? b
                    : {
                        ...b,
                        ...(updates.content !== undefined ? { content: updates.content } : {}),
                        ...(updates.data !== undefined ? { data: updates.data as BlockData["data"] } : {}),
                      },
                ),
              },
        ),
      );
      const ok = await mutate(sectionId, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ blockId, ...updates }) });
      // En FALLO no refrescamos (diseño original): el optimista deja el texto del CSE
      // visible y `error` avisa — reintenta sin perder lo tipeado.
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
    async (sectionId: string, blockType: string = "TEXT", content: string = "", data?: unknown): Promise<string | undefined> => {
      // Fetch directo (no `mutate`) para capturar el id del bloque creado → habilita el undo (borrarlo).
      // Cuenta como escritura EN VUELO igual que `mutate`: si no, `flushPending` volvería al
      // instante y "Subir al cliente" congelaría un snapshot sin el bloque recién creado.
      pendingWrites.current++;
      try {
        const res = await fetch(blocksUrl(sectionId), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ blockType, content, data }),
        });
        if (!res.ok) {
          setError("No se pudo agregar el bloque. Reintentá.");
          return undefined;
        }
        setError(null);
        const created = (await res.json().catch(() => null)) as BlockData | null;
        // OPTIMISTA (como saveBlock): meter el bloque creado en el estado local ANTES de
        // que aterrice el refetch. Sin esto, una edición inmediatamente posterior seguiría
        // viendo la sección SIN bloque y dispararía un SEGUNDO POST → dos CARD, y el render
        // (que toma el primero) perdería el campo del segundo.
        if (created?.id) {
          writeSeq.current++;
          setSections((prev) =>
            prev.map((s) => (s.id !== sectionId ? s : { ...s, blocks: [...s.blocks, created] })),
          );
        }
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
        return created?.id;
      } catch {
        setError("Error de conexión al agregar el bloque.");
        return undefined;
      } finally {
        pendingWrites.current--;
      }
    },
    [blocksUrl, refetch, pushUndo, undoScope, deleteBlock],
  );

  /**
   * Guarda `data` en el bloque CARD de una sección, CREÁNDOLO si no existe.
   *
   * Serializa la creación por sección: el POST tarda un round-trip, así que dos ediciones
   * seguidas sobre una sección vacía (escribir el texto del botón y después el enlace) verían
   * las dos `blocks.length === 0` y crearían DOS bloques CARD. El render usa solo el primero
   * → el segundo campo se perdía. Acá el segundo edit no dispara otro POST: se acumula en
   * `latest` y se guarda sobre el bloque que está naciendo. Tras el POST, la inserción
   * optimista de `addBlock` hace que los edits siguientes ya encuentren el CARD.
   */
  const creatingCard = useRef(new Map<string, { latest: unknown }>());
  const upsertCardData = useCallback(
    async (sectionId: string, cardBlockId: string | null, data: unknown) => {
      if (cardBlockId) {
        await saveBlockRef.current(sectionId, cardBlockId, { data });
        return;
      }
      const inflight = creatingCard.current.get(sectionId);
      if (inflight) {
        inflight.latest = data; // el create en curso persistirá esta data al terminar
        return;
      }
      const entry = { latest: data };
      creatingCard.current.set(sectionId, entry);
      try {
        const newId = await addBlock(sectionId, "CARD", "", data);
        if (!newId) return;
        // BUCLE, no un solo `if`: mientras se guarda `latest` puede llegar OTRO edit (el
        // await suspende y `upsertCardData` vuelve a entrar por la rama `inflight`). Con un
        // único guardado, ese último edit se escribiría en `latest` y jamás se persistiría.
        let saved = data;
        while (entry.latest !== saved) {
          const pending = entry.latest;
          await saveBlockRef.current(sectionId, newId, { data: pending });
          saved = pending;
        }
      } finally {
        creatingCard.current.delete(sectionId);
      }
    },
    [addBlock],
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

  // PATCH de metadata de sección (title/eyebrow/brief de cara al cliente, o undo). Refetchea para
  // traer el estado canónico (incluye previous* que habilita el botón "Deshacer"). No usa el
  // endpoint de blocks (es metadata de sección) → PATCH dedicado.
  const patchSection = useCallback(
    async (sectionId: string, body: Record<string, unknown>, errMsg: string): Promise<boolean> => {
      pendingWrites.current++;
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
      } finally {
        pendingWrites.current--;
      }
    },
    [basePath, refetch],
  );

  // Título grande. String vacío → vuelve al título por defecto de la plantilla. Optimista.
  const renameSection = useCallback(
    (sectionId: string, title: string, skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? null : findSection(sectionId)?.titleOverride ?? null;
      const t = title.trim() || null;
      writeSeq.current++;
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
    [patchSection, pushUndo, undoScope, findSection],
  );

  // Eyebrow (título pequeño). String vacío → default.
  const setEyebrow = useCallback(
    (sectionId: string, eyebrow: string, skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? null : findSection(sectionId)?.eyebrowOverride ?? null;
      const e = eyebrow.trim() || null;
      writeSeq.current++;
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
    [patchSection, pushUndo, undoScope, findSection],
  );

  // Guía del agente por sección (business case). String vacío → vuelve al brief por defecto.
  const setBrief = useCallback(
    (sectionId: string, brief: string, skipUndo = false): Promise<boolean> => {
      const prev = skipUndo ? null : findSection(sectionId)?.agentBriefOverride ?? null;
      const b = brief.trim() || null;
      writeSeq.current++;
      setSections((cur) => cur.map((s) => (s.id === sectionId ? { ...s, agentBriefOverride: b } : s)));
      if (!skipUndo) {
        pushUndo({
          scope: undoScope,
          label: "Guía de sección",
          coalesceKey: `${undoScope}|section-brief|${sectionId}`,
          undo: () => setBriefRef.current(sectionId, prev ?? "", true),
        });
      }
      return patchSection(sectionId, { agentBriefOverride: b }, "No se pudo guardar la guía. Reintentá.");
    },
    [patchSection, pushUndo, undoScope, findSection],
  );

  // Deshacer de 1 nivel (toggle actual↔previous) del título, el eyebrow o la guía de una sección.
  const undoSection = useCallback(
    (sectionId: string, which: "title" | "eyebrow" | "brief"): Promise<boolean> =>
      patchSection(sectionId, { undo: which }, "No se pudo deshacer. Reintentá."),
    [patchSection],
  );

  // Ocultar/mostrar una sección de cara al cliente. OPTIMISTA (el toggle responde al
  // instante; sin esto el PATCH+refetch tardaba ~1s y se sentía "lerdo").
  const setHidden = useCallback(
    (sectionId: string, hidden: boolean): Promise<boolean> => {
      writeSeq.current++;
      setSections((cur) => cur.map((s) => (s.id === sectionId ? { ...s, hidden } : s)));
      return patchSection(sectionId, { hidden }, "No se pudo cambiar la visibilidad. Reintentá.");
    },
    [patchSection],
  );

  // Reordenar las SECCIONES del canvas (drag & drop). OPTIMISTA + PATCH al endpoint
  // de reorden; con undo al orden previo.
  const reorderSections = useCallback(
    async (orderedIds: string[], skipUndo = false): Promise<boolean> => {
      const prevOrder = sectionsRef.current.map((s) => s.id);
      writeSeq.current++;
      setSections((cur) => {
        const byId = new Map(cur.map((s) => [s.id, s]));
        const next = orderedIds.map((id) => byId.get(id)).filter((s): s is SectionWithBlocks => !!s);
        // Secciones no incluidas en el orden (raro): al final, en su orden previo.
        for (const s of cur) if (!orderedIds.includes(s.id)) next.push(s);
        return next.map((s, i) => ({ ...s, order: i }));
      });
      pendingWrites.current++;
      try {
        const res = await fetch(`${basePath}/canvas-sections`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ canvasId, orderedIds }),
        });
        if (!res.ok) {
          setError("No se pudo guardar el orden. Reintentá.");
          refetch();
          return false;
        }
        setError(null);
        onContentChangeRef.current?.();
        if (!skipUndo) {
          pushUndo({
            scope: undoScope,
            label: "Secciones reordenadas",
            undo: () => reorderSectionsRef.current(prevOrder, true),
          });
        }
        refetch();
        return true;
      } catch {
        setError("Error de conexión al reordenar.");
        refetch();
        return false;
      } finally {
        pendingWrites.current--;
      }
    },
    [basePath, canvasId, refetch, pushUndo, undoScope],
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
    setBriefRef.current = setBrief;
    reorderSectionsRef.current = reorderSections;
  });

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
    upsertCardData,
    restoreBlock,
    renameSection,
    setEyebrow,
    setBrief,
    setHidden,
    reorderSections,
    undoSection,
    acceptAll,
    flushPending,
  };
}
