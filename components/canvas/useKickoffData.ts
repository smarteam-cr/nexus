"use client";

/**
 * components/canvas/useKickoffData.ts
 *
 * Capa de datos del editor de Kickoff (CSE), consumida por KickoffWorkspace (sobre
 * LandingView). Encapsula: useCanvasSections + fetch de timeline/procesos/visibility/
 * logo + el staging (dirty) + toggle de visibilidad + "Subir cambios al cliente"
 * (publishChanges).
 *
 * Nació extraída del renderer legacy KickoffLandingInternal (borrado en la Ola 4
 * del plan de puestos) — hoy KickoffWorkspace es su único consumidor.
 */
import { useCallback, useEffect, useState } from "react";
import { useCanvasSections } from "./useCanvasSections";
import type { KickoffTimelineData, KickoffPhase, KickoffProceso } from "@/lib/external/kickoff-view-types";
import { assign, type HorarioAssignments } from "@/lib/kickoff/horario-assignments";

export function useKickoffData(projectId: string, canvasId: string) {
  // D.3 staging — contenido editado tras el último "Subir". setContentDirty(true) por el
  // callback del hook; el GET inicial lo hidrata (contentUpdatedAt > publishedSnapshotAt).
  const [contentDirty, setContentDirty] = useState(false);
  const cs = useCanvasSections(`/api/projects/${projectId}`, canvasId, () => setContentDirty(true));

  const [timeline, setTimeline] = useState<KickoffTimelineData | null>(null);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  // Variante para fondo oscuro + tamaño base: viven en Client, no en el canvas, y salen
  // del mismo GET que el logo (client-logo/route.ts).
  const [clientLogoDarkUrl, setClientLogoDarkUrl] = useState<string | null>(null);
  const [clientLogoScale, setClientLogoScale] = useState<number | null>(null);
  const [platformLogos, setPlatformLogos] = useState<string[]>([]);
  // Datos de marca del hero (mismas piezas que el hero del Business Case).
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [smarteamLogoUrl, setSmarteamLogoUrl] = useState<string | null>(null);
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});
  const [procesos, setProcesos] = useState<KickoffProceso[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // edición LOCAL (staged)
  const [savedHiddenKeys, setSavedHiddenKeys] = useState<Set<string>>(new Set()); // baseline persistido
  const [publishing, setPublishing] = useState(false);
  // Overlay VIVO de la asignación franja→sesión (lo escriben el CSE y el cliente). NO es
  // staged: se guarda al instante y no participa de "Subir al cliente". `null` = todavía
  // no sembrado → manda lo que diga el bloque.
  const [horarioAssignments, setHorarioAssignments] = useState<HorarioAssignments | null>(null);
  /* El cronograma que el cliente ve DENTRO del kickoff sale de la foto publicada del cronograma, no
     del kickoff (caso «CAV - SHP», 2026-10-02: Nexus 21-sep, el enlace 1-sep). Sin subir = publicado y
     editado después; sin publicar = existe y nunca se subió. Ver kickoff-content/route.ts. */
  const [cronogramaSinSubir, setCronogramaSinSubir] = useState(false);
  const [cronogramaSinPublicar, setCronogramaSinPublicar] = useState(false);
  const [avisoCronograma, setAvisoCronograma] = useState<string | null>(null);

  // Procesos del cliente (diagramas) — el preview interno los muestra todos.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/procesos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProcesos(d?.procesos ?? []))
      .catch(() => setProcesos([]));
  }, [projectId]);

  // #3 — set de claves ocultas del kickoff.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/kickoff-visibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const s = new Set<string>(d?.hiddenKeys ?? []); setHiddenKeys(s); setSavedHiddenKeys(s); })
      .catch(() => { setHiddenKeys(new Set()); setSavedHiddenKeys(new Set()); });
  }, [projectId]);

  // Asignación franja→sesión (overlay vivo, compartido con la vista del cliente).
  useEffect(() => {
    fetch(`/api/projects/${projectId}/horario-assignments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHorarioAssignments(d?.assignments ?? null))
      .catch(() => setHorarioAssignments(null));
  }, [projectId]);

  // Hidrata la barra "cambios sin subir" al montar.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/kickoff-content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setContentDirty(!!d?.dirty);
        setCronogramaSinSubir(!!d?.cronogramaSinSubir);
        setCronogramaSinPublicar(!!d?.cronogramaSinPublicar);
      })
      .catch(() => {});
  }, [projectId]);

  // Marca del hero: logo del cliente, logos de plataforma, logo Smarteam y mapa de marcas.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/client-logo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setClientLogoUrl(d?.logoUrl ?? null);
        setClientLogoDarkUrl(d?.logoDarkUrl ?? null);
        setClientLogoScale(typeof d?.logoScale === "number" ? d.logoScale : null);
        setPlatformLogos(Array.isArray(d?.platformLogos) ? d.platformLogos : []);
        setClientId(typeof d?.clientId === "string" ? d.clientId : null);
        setClientName(typeof d?.clientName === "string" ? d.clientName : "");
        setSmarteamLogoUrl(d?.smarteamLogoUrl ?? null);
        setBrandLogos(d?.brandLogos && typeof d.brandLogos === "object" ? d.brandLogos : {});
      })
      .catch(() => { setClientLogoUrl(null); setPlatformLogos([]); });
  }, [projectId]);

  // Cronograma — PREVIEW del CSE: se muestra en cuanto EXISTE (fue generado), aunque
  // todavía no esté publicado. El gate de publicado vive en kickoff-view.ts y solo
  // aplica a la vista externa (cliente); acá el CSE ve lo que generó antes de subirlo.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.exists) {
          setTimeline({ exists: false, anchorStartDate: null, phases: [] });
          return;
        }
        const detailConfirmed = !!d.detailConfirmedAt;
        type RawTask = { title: string; weekIndex: number };
        type RawPhase = KickoffPhase & { tasks?: RawTask[] };
        setTimeline({
          exists: true,
          anchorStartDate: d.anchorStartDate ?? null,
          phases: ((d.phases ?? []) as RawPhase[]).map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            durationWeeks: p.durationWeeks,
            startWeek: p.startWeek ?? null,
            sessionCount: p.sessionCount,
            notes: p.notes,
            activityType: p.activityType ?? null,
            ...(detailConfirmed && Array.isArray(p.tasks)
              ? { tasks: p.tasks.map((t) => ({ title: t.title, weekIndex: t.weekIndex })) }
              : {}),
          })),
        });
      })
      .catch(() => setTimeline({ exists: false, anchorStartDate: null, phases: [] }));
  }, [projectId]);

  // STAGED: el toggle solo cambia el set LOCAL; se persiste al "Subir". Memoizado
  // (es dep del ctx que consume KickoffWorkspace) → evita recrear ctx cada render.
  const toggleHidden = useCallback((key: string, hidden: boolean) => {
    setHiddenKeys((prev) => {
      const n = new Set(prev);
      if (hidden) n.add(key);
      else n.delete(key);
      return n;
    });
  }, []);

  const visibilityDirty =
    hiddenKeys.size !== savedHiddenKeys.size || [...hiddenKeys].some((k) => !savedHiddenKeys.has(k));
  const dirty = visibilityDirty || contentDirty || cronogramaSinSubir;

  /**
   * La fecha de arranque desde la PORTADA del kickoff: escribe el ancla del cronograma (una sola
   * fecha para el kickoff, el cronograma y el enlace), no un texto encima. Si el cronograma ya está
   * publicado, queda «sin subir» hasta el próximo Subir. Lanza si el servidor rechaza.
   */
  const cambiarArranque = useCallback(
    async (ymd: string | null) => {
      const res = await fetch(`/api/projects/${projectId}/timeline/arranque`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorStartDate: ymd }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => null) : null;
      if (!res?.ok) throw new Error((d?.error as string | undefined) ?? "No se pudo cambiar la fecha de arranque.");
      setTimeline((cur) => (cur ? { ...cur, anchorStartDate: (d?.anchorStartDate as string | null) ?? null } : cur));
      if (d?.cambio && !cronogramaSinPublicar) setCronogramaSinSubir(true);
    },
    [projectId, cronogramaSinPublicar],
  );

  // Confirmar/desconfirmar UN proceso (DRAFT↔CONFIRMED) — botón por proceso.
  // Memoizado: es dep del `ctx` que consume KickoffWorkspace (evita recrear ctx cada render).
  const confirmProceso = useCallback(
    async (blockId: string, confirmed: boolean) => {
      const status = confirmed ? "CONFIRMED" : "DRAFT";
      setProcesos((prev) => prev.map((p) => (p.id === blockId ? { ...p, status } : p)));
      await fetch(`/api/projects/${projectId}/procesos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, status }),
      }).catch(() => {});
    },
    [projectId],
  );

  /**
   * Asignar/desasignar una franja a una sesión. NO es staged: se guarda al instante en el
   * overlay (mismo write path que la punta del cliente) y por eso no entra en `dirty` ni
   * necesita "Subir al cliente" — es coordinación, no contenido. Optimista con rollback:
   * si el servidor rechaza, lanza para que la sección revierta y muestre el error.
   */
  const assignSession = useCallback(
    async (sessionId: string, optionId: string | null) => {
      const prev = horarioAssignments;
      setHorarioAssignments((cur) => assign(cur ?? {}, sessionId, optionId));
      const res = await fetch(`/api/projects/${projectId}/horario-assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, optionId }),
      }).catch(() => null);
      if (!res?.ok) {
        setHorarioAssignments(prev);
        const msg = res ? ((await res.json().catch(() => null))?.error as string | undefined) : undefined;
        throw new Error(msg ?? "No se pudo guardar la asignación.");
      }
      const d = await res.json().catch(() => null);
      if (d?.assignments) setHorarioAssignments(d.assignments as HorarioAssignments);
    },
    [projectId, horarioAssignments],
  );

  // Subir al cliente TODO lo pendiente: confirma procesos en borrador + persiste
  // visibilidad + congela el snapshot de contenido.
  const publishChanges = async () => {
    setPublishing(true);
    try {
      // Esperar los guardados EN VUELO antes de congelar (paridad con BusinessCaseWorkspace):
      // el último `saveBlock` no está awaiteado por onSectionChange, así que publicar apenas
      // se comitea un campo congelaría un snapshot SIN ese cambio.
      await cs.flushPending();
      const drafts = procesos.filter((p) => p.status === "DRAFT");
      await Promise.all(
        drafts.map((p) =>
          fetch(`/api/projects/${projectId}/procesos`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId: p.id, status: "CONFIRMED" }),
          }),
        ),
      );
      if (drafts.length) {
        setProcesos((prev) => prev.map((p) => (p.status === "DRAFT" ? { ...p, status: "CONFIRMED" } : p)));
      }
      const keys = [...hiddenKeys];
      const res = await fetch(`/api/projects/${projectId}/kickoff-visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenKeys: keys }),
      });
      if (res.ok) {
        const d = await res.json();
        const s = new Set<string>(d?.hiddenKeys ?? keys);
        setHiddenKeys(s);
        setSavedHiddenKeys(s);
      }
      await fetch(`/api/projects/${projectId}/kickoff-content`, { method: "POST" }).catch(() => {});
      setContentDirty(false);
      /* Si el cronograma publicado quedó atrás, se sube junto: es lo que el cliente lee como fecha
         de arranque y cronograma DENTRO del kickoff. Uno que nunca se publicó NO se publica acá:
         publicarlo por primera vez es un acto del cronograma (congela la línea base). */
      if (cronogramaSinSubir) {
        const r = await fetch(`/api/projects/${projectId}/publish-timeline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Subido junto con el kickoff" }),
        }).catch(() => null);
        if (r?.ok) setCronogramaSinSubir(false);
        else {
          const e = r ? await r.json().catch(() => null) : null;
          setAvisoCronograma((e?.error as string | undefined) ?? "El kickoff se subió, pero el cronograma no: súbelo desde el cronograma.");
        }
      }
    } catch {
      /* dejar el estado local; el usuario puede reintentar */
    }
    setPublishing(false);
  };

  return {
    ...cs,
    timeline,
    clientLogoUrl,
    setClientLogoUrl,
    clientLogoDarkUrl,
    setClientLogoDarkUrl,
    clientLogoScale,
    setClientLogoScale,
    platformLogos,
    clientId,
    clientName,
    smarteamLogoUrl,
    brandLogos,
    procesos,
    setProcesos,
    hiddenKeys,
    savedHiddenKeys,
    toggleHidden,
    visibilityDirty,
    contentDirty,
    setContentDirty,
    dirty,
    publishing,
    publishChanges,
    confirmProceso,
    horarioAssignments,
    assignSession,
    cronogramaSinSubir,
    cronogramaSinPublicar,
    cambiarArranque,
    // El aviso del cronograma comparte la franja de error del documento.
    error: cs.error ?? avisoCronograma,
    clearError: () => {
      cs.clearError();
      setAvisoCronograma(null);
    },
  };
}
