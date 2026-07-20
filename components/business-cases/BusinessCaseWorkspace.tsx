"use client";

/**
 * BusinessCaseWorkspace — mismo chrome que el canvas de kickoff (ProjectCanvasPanel):
 *   1. Card de CONTEXTO (estilo ProjectHandoffSection): sesiones del prospecto
 *      (estilo SessionSelectionReview) + "Fuentes manuales" colapsable.
 *   2. Header: dropdown del canvas ("Caso de uso N ▾") + "Generar con IA" a la
 *      izquierda; "Acceso del cliente" + (export) a la derecha.
 *   3. Landing FULL-BLEED (margen negativo, rompe el padding del panel) con la
 *      PublishBar "Subir al cliente" arriba. Edición inline del motor de landing.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import CanvasDropdown from "@/components/business-cases/CanvasDropdown";
import SectionTools from "@/components/business-cases/SectionTools";
import DocumentAssist from "@/components/ai/DocumentAssist";
import DownloadPdfButton from "@/components/business-cases/DownloadPdfButton";
import BcAccessButton from "@/components/business-cases/BcAccessButton";
import ContextCard from "@/components/business-cases/ContextCard";
import type { VersionMeta } from "@/components/business-cases/bc-workspace-shared";
import PublishBar from "@/components/canvas/PublishBar";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigFor } from "@/components/landing/configs/templates";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";

export default function BusinessCaseWorkspace({
  bcId,
  clientId,
  clientName,
  clientLogoUrl,
  smarteamLogoUrl,
  brandLogos,
  publishedAt,
  templateId,
  language,
}: {
  bcId: string;
  /** Para subir el logo del cliente desde el hero (POST /api/clients/[id]/logo). */
  clientId?: string | null;
  clientName: string;
  clientLogoUrl: string | null;
  /** Logo de marca Smarteam (config global) — el hero lo pinta en la brand-row. */
  smarteamLogoUrl?: string | null;
  /** Logos de plataforma por nombre lowercase (brandLogoMap) — brands de texto con logo. */
  brandLogos?: Record<string, string>;
  status: string;
  publishedAt: string | null;
  /** Template del caso (por su tipo). Ausente/null = hubspot_v1 (legacy). */
  templateId?: string | null;
  /** Idioma persistente del caso (BusinessCase.language). Fallback: __lang del hero. */
  language?: string | null;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [canvasId, setCanvasId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(!!publishedAt);
  const [dirty, setDirty] = useState(!publishedAt);
  const [accessNonce, setAccessNonce] = useState(0);
  // Títulos seleccionados en el checklist de casos de uso (reporte del ContextCard;
  // null = checklist no montado). Solo para el AVISO de divergencia al publicar.
  const [ucSelectedTitles, setUcSelectedTitles] = useState<string[] | null>(null);
  // Logo del cliente (vive en Client.logoUrl; el hero puede subirlo/cambiarlo).
  const [clientLogo, setClientLogo] = useState<string | null>(clientLogoUrl);

  const loadMeta = useCallback(
    async (preferCanvasId?: string) => {
      try {
        const m = await fetchJson<{ activeCanvasId: string | null; versions: VersionMeta[] }>(
          `/api/business-cases/${bcId}/canvas-meta`,
        );
        setVersions(m.versions);
        setCanvasId((prev) =>
          preferCanvasId ?? (prev && m.versions.some((v) => v.canvasId === prev) ? prev : m.activeCanvasId ?? ""),
        );
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el caso de uso.");
      }
    },
    [bcId, toast],
  );
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // poll:false → la generación del BC es síncrona; sin polling (evita parpadeo).
  // onContentChange → marca cambios sin subir (dirty) para la PublishBar.
  const hook = useCanvasSections(`/api/business-cases/${bcId}`, canvasId, () => setDirty(true), { poll: false });
  const sectionByKey = new Map<string, SectionWithBlocks>(hook.sections.map((s) => [s.key, s]));
  const sectionsData: LandingSectionData[] = hook.sections.map((s) => ({
    key: s.key,
    data: s.blocks[0]?.data ?? null,
    brief: s.agentBriefOverride,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
    hidden: s.hidden,
  }));
  // ¿Hay contenido real para publicar? (los bloques se generan auto-aceptados; lo que
  // importa es que NO estén en blanco, no el status).
  const hasContent = hook.sections.some((s) => s.blocks.some((b) => !blockBlank(b.data)));

  // Idioma de la propuesta: PRIMERO el campo persistente `language` del caso; si es
  // null (casos viejos pre-migración a este campo), cae al `__lang` no-schema del
  // hero, como se leía antes. Traduce los rótulos fijos de los componentes (i18n.ts).
  // Ausente = español.
  const proposalLang =
    language ??
    ((sectionByKey.get("hero")?.blocks[0]?.data as { __lang?: string } | null)?.__lang) ??
    null;

  // Config del template en el ORDEN del canvas (habilita el drag & drop) e
  // INTERSECADA con sus secciones reales: un canvas viejo sembrado con menos
  // secciones que el template vigente no debe mostrar "secciones fantasma".
  // SOLO cuando el hook ya cargó: con sections=[] (ventana de carga / cambio de
  // canvas) quedaría una config VACÍA y la Plantilla no aparecería — en esa
  // ventana mostramos el template completo (placeholders), como siempre.
  const baseConfig = landingConfigFor(templateId);
  const baseByKey = new Map(baseConfig.sections.map((d) => [d.key, d]));
  const landingConfig = hook.sections.length
    ? { ...baseConfig, sections: hook.sections.map((s) => baseByKey.get(s.key)).filter((d): d is NonNullable<typeof d> => !!d) }
    : baseConfig;

  const onSectionChange = (key: string, data: unknown) => {
    const sec = sectionByKey.get(key);
    const block = sec?.blocks[0];
    if (sec && block) hook.saveBlock(sec.id, block.id, { data });
  };

  const onBriefChange = (key: string, brief: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.setBrief(sec.id, brief);
  };

  // Título / eyebrow de cara al cliente por sección (mismo patrón que el kickoff).
  const onTitleChange = (key: string, title: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.renameSection(sec.id, title);
  };
  const onEyebrowChange = (key: string, eyebrow: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.setEyebrow(sec.id, eyebrow);
  };

  // Ocultar / mostrar una sección (flag `hidden` en el Json del canvas). No borra el
  // contenido — solo lo excluye del cliente. Optimista (hook.setHidden) → sin lag.
  const toggleHidden = async (sectionId: string, hidden: boolean) => {
    try {
      await hook.setHidden(sectionId, hidden);
      setDirty(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo ocultar/mostrar la sección.");
    }
  };

  // F5.2 — fase REAL de la generación (el POST es síncrono y tarda 10-30s+):
  // mientras está en vuelo, se pollea el status liviano y la fase se muestra
  // junto al botón ("Leyendo el contexto…" → "Generando las secciones…" → …).
  const [genPhase, setGenPhase] = useState<string | null>(null);
  const genIdRef = useRef(0); // identidad de la corrida actual: descarta ticks de una vieja

  const generate = async () => {
    if (generating) return;
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    const genId = ++genIdRef.current;
    setGenerating(true);
    setGenPhase("Preparando…");
    const notifyUrl = `/business-cases/${bcId}`;
    // Polling de la fase mientras el POST está en vuelo (2s; se corta en finally).
    const phaseTimer = setInterval(async () => {
      try {
        const s = await fetchJson<{ status: string | null; phase: string | null }>(
          `/api/business-cases/${bcId}/generate/status`,
        );
        // Un fetch lanzado por esta corrida puede resolver DESPUÉS del finally (o de
        // otro clic): solo aplicar si sigue siendo la corrida vigente y está RUNNING.
        if (genId === genIdRef.current && s.status === "RUNNING" && s.phase) setGenPhase(s.phase);
      } catch {
        /* el polling de fase nunca debe romper la generación */
      }
    }, 2000);
    try {
      // El carry-forward (portada, marcas, URL del CTA, orden/oculto) lo arma el
      // server leyendo el canvas actual de la DB — mismo riesgo de carrera que el
      // publish: esperar los writes en vuelo antes de disparar la generación.
      await hook.flushPending();
      const r = await fetchJson<{ canvasId: string; version: number }>(`/api/business-cases/${bcId}/generate`, { method: "POST" });
      toast.success(`Caso de uso ${r.version} generado.`);
      // El cambio de canvasId (vía loadMeta → setCanvasId) dispara el refetch del hook
      // por efecto. NO llamar hook.refetch() acá: correría con el canvasId viejo del
      // closure y traería el canvas anterior (era el bug de "no aparece nada").
      await loadMeta(r.canvasId);
      setDirty(true);
      void notifyAgentDone({ group: "business-case", clientName, ok: true, url: notifyUrl });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "La generación falló.");
      void notifyAgentDone({ group: "business-case", clientName, ok: false, url: notifyUrl });
    } finally {
      clearInterval(phaseTimer);
      setGenPhase(null);
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (publishing) return;
    // Aviso (no bloqueante) si la sección "Casos de uso" del canvas difiere del
    // checklist — la verdad publicable es el data de la sección, pero la divergencia
    // no debe ser silenciosa (p.ej. se publica un canvas viejo sin la sección).
    if (ucSelectedTitles !== null) {
      const sec = sectionByKey.get("casos_de_uso");
      const inSection = (((sec?.blocks[0]?.data as { items?: { title?: string }[] } | null)?.items) ?? [])
        .map((i) => (i.title ?? "").trim())
        .filter(Boolean)
        .sort();
      const inChecklist = ucSelectedTitles.map((t) => t.trim()).filter(Boolean).sort();
      if (JSON.stringify(inSection) !== JSON.stringify(inChecklist)) {
        toast.info("Aviso: los casos de uso de este canvas difieren del checklist. Se publica lo que ves en la sección.");
      }
    }
    setPublishing(true);
    try {
      // Esperar cualquier guardado en vuelo (edición/orden/ocultar son optimistas y
      // "fire and forget" — sin esto, publicar justo después de tipear/arrastrar podía
      // leer la DB antes de que el último cambio llegara: "no es lo último que se ve").
      await hook.flushPending();
      // Publicamos el caso que el CSE está viendo (no el "activo" del server).
      await fetchJson(`/api/business-cases/${bcId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      setPublished(true);
      setDirty(false);
      setAccessNonce((n) => n + 1);
      toast.success("Subido. El cliente ya ve este caso de uso.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir al cliente.");
    } finally {
      setPublishing(false);
    }
  };

  const hasCanvas = !!canvasId;
  const unpublished = !published || dirty;
  // La Plantilla es v0: muestra las guías editables, oculta la PublishBar y no se borra.
  const activeVersion = versions.find((v) => v.canvasId === canvasId)?.version;
  const isTemplate = activeVersion === 0;

  // Borrar un caso de uso (versión generada) desde el dropdown.
  const deleteCanvas = async (cid: string) => {
    try {
      const r = await fetchJson<{ activeCanvasId: string | null }>(
        `/api/business-cases/${bcId}/canvases/${cid}`,
        { method: "DELETE" },
      );
      toast.success("Caso de uso eliminado.");
      await loadMeta(r.activeCanvasId ?? undefined);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar el caso de uso.");
    }
  };

  // Sync del checklist → sección `casos_de_uso` del canvas que se está VIENDO
  // (publish publica el canvas elegido en el dropdown, no "el activo" — sincronizar
  // otro canvas divergiría en silencio). SOLO al togglear (nunca al cargar: pisaría
  // ediciones a mano de la sección). La verdad publicable es el data de la sección;
  // el pivote es estado de trabajo. Canvases previos a esta feature no tienen la
  // sección → no-op ("regenerá para incluir casos de uso").
  const syncUseCasesIntoSection = (items: { title: string; detail: string; price: string }[]) => {
    if (isTemplate) {
      // La Plantilla (v0) nunca se llena — que el vendedor sepa dónde impacta.
      toast.info("Checklist guardado. Se aplica a los casos generados (estás viendo la Plantilla).");
      return;
    }
    const sec = sectionByKey.get("casos_de_uso");
    const block = sec?.blocks[0];
    if (sec && block) {
      hook.saveBlock(sec.id, block.id, { data: { items } });
      // No silencioso: la reescritura pisa retoques manuales de ESA sección (hay
      // deshacer de 1 nivel; los retoques finales van después de cerrar la selección).
      toast.info("Sección “Casos de uso” actualizada desde el catálogo.");
    } else {
      toast.info("Checklist guardado. Este canvas no tiene la sección “Casos de uso” — regenerá para incluirla.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Contexto (estilo card de handoff) */}
      <ContextCard
        bcId={bcId}
        onAfterChange={() => setDirty(true)}
        onUseCasesSync={syncUseCasesIntoSection}
        onUseCasesState={setUcSelectedTitles}
      />

      {/* 2. Header: dropdown del canvas + Generar (izq) · Acceso (der) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CanvasDropdown versions={versions} canvasId={canvasId} onSwitch={setCanvasId} onDelete={deleteCanvas} />
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {generating ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            )}
            {generating ? "Generando…" : "Generar con IA"}
          </button>
          {/* F5.2 — fase real de la generación (polleada del server cada 2s). */}
          {generating && genPhase && (
            <span className="text-xs text-fg-muted animate-pulse" aria-live="polite">
              {genPhase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DownloadPdfButton bcId={bcId} canvasId={canvasId} />
          <BcAccessButton bcId={bcId} refreshKey={accessNonce} onRevoked={() => setPublished(false)} />
          <DeleteBusinessCaseButton
            bcId={bcId}
            redirectTo="/business-cases"
            description={`Se eliminará el caso de negocio de ${clientName} con todos sus casos de uso, secciones y contenido. Esta acción no se puede deshacer.`}
          />
        </div>
      </div>

      {/* Errores del hook (guardado/edición) */}
      {hook.error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <span className="text-sm font-medium flex-1">{hook.error}</span>
          <button onClick={hook.clearError} className="text-xs font-semibold hover:underline">Cerrar</button>
        </div>
      )}

      {/* 3. PublishBar + Landing FULL-BLEED (rompe el padding del panel px-6 py-8) */}
      <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
        {/* La Plantilla no se publica: solo los casos de uso generados. */}
        {!isTemplate && (
          <div style={{ padding: "0 24px 14px" }}>
            <PublishBar
              unpublished={unpublished}
              hint={unpublished && !hasContent ? "Generá o escribí contenido antes de subirlo al cliente." : undefined}
              onPublish={publish}
              publishing={publishing}
              cleanMessage="El cliente ve la última versión."
            />
          </div>
        )}
        {/* Assist de documento: instrucción → propuesta → revisar → aplicar por
            upsertCardData. En la Plantilla (v0) no aplica: ahí se editan guías. */}
        {!isTemplate && hasCanvas && !hook.loading && (
          <div style={{ padding: "0 24px 14px" }}>
            <DocumentAssist
              url={`/api/business-cases/${bcId}/assist`}
              extraBody={{ canvasId }}
              dialogTitle="Mejorar el business case con IA"
              chips={["Hazlo más orientado a valor de negocio", "Refuerza el ROI con datos del contexto", "Resume las secciones largas"]}
              placeholder='Ej: "haz los dolores más específicos de esta industria"'
              labelFor={(key) => hook.sections.find((s) => s.key === key)?.label ?? key}
              onApplySection={(key, data) => {
                const s = hook.sections.find((x) => x.key === key);
                if (!s) return;
                const card = s.blocks.find((b) => b.blockType === "CARD");
                return hook.upsertCardData(s.id, card?.id ?? null, data);
              }}
              onApplied={() => setDirty(true)}
            />
          </div>
        )}
        {!hasCanvas || hook.loading ? (
          <div className="px-6 pb-8">
            <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-fg-muted">
              {hasCanvas ? "Cargando…" : "Preparando…"}
            </div>
          </div>
        ) : (
          <LandingView
            config={landingConfig}
            ctx={{
              clientName,
              lang: proposalLang,
              clientLogoUrl: clientLogo,
              smarteamLogoUrl,
              brandLogos,
              imageUploadUrl: `/api/business-cases/${bcId}/images`,
              clientLogoUploadUrl: clientId ? `/api/clients/${clientId}/logo` : null,
              onClientLogoChange: (url) => {
                setClientLogo(url);
                setDirty(true);
                toast.success("Logo del cliente actualizado.");
              },
            }}
            sections={sectionsData}
            mode="edit"
            showBriefs={isTemplate}
            onSectionChange={onSectionChange}
            onBriefChange={onBriefChange}
            onTitleChange={onTitleChange}
            onEyebrowChange={onEyebrowChange}
            onToggleHidden={(key, hidden) => {
              const sec = sectionByKey.get(key);
              if (sec) toggleHidden(sec.id, hidden);
            }}
            onReorder={(orderedKeys) => {
              const ids = orderedKeys
                .map((k) => sectionByKey.get(k)?.id)
                .filter((sid): sid is string => !!sid);
              if (ids.length) {
                hook.reorderSections(ids);
                setDirty(true);
              }
            }}
            renderOverlay={(key) => (
              <SectionTools section={sectionByKey.get(key)} hook={hook} isTemplate={isTemplate} templateId={templateId} />
            )}
          />
        )}
      </div>
    </div>
  );
}

/** Un `data` estructurado está "en blanco" si todos sus strings/arrays lo están. */
function blockBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(blockBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(blockBlank);
  return false;
}
