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
import { Modal, ConfirmDialog } from "@/components/ui";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import { templateDefsByKey } from "@/components/landing/configs/templates.defs";
import PublishBar from "@/components/canvas/PublishBar";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigFor } from "@/components/landing/configs/templates";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";
import { notifyAgentDone, maybeRequestPermission } from "@/lib/notifications/client";
import TagsStrip from "@/components/tags/TagsStrip";
import { ContextColumn, ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import type { ImplementationType } from "@prisma/client";

type VersionMeta = { canvasId: string; version: number; isActive: boolean; name: string };
type SessionMeta = { sessionId: string; title: string; date: string; participants: string[]; applies: boolean; hasTranscript: boolean };
type Transcript = {
  id: string;
  source: string;
  rawText: string;
  fileName: string | null;
  // Fuente URL (diagnóstico por URL): fileUrl http + fecha del último fetch.
  fileUrl?: string | null;
  processedAt?: string | null;
};

const isUrlTranscript = (t: Transcript) => !!t.fileUrl?.startsWith("http");
function hostnameOf(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

// Checklist de casos de uso del catálogo (GET use-case-candidates)
type UseCaseRow = {
  id: string;
  title: string;
  description: string;
  price: string | null;
  active: boolean;
  selected: boolean;
  priceOverride: string | null;
};
type HsTimelineItem = { type: "NOTE" | "CALL" | "MEETING"; title: string; date: string | null; snippet: string };
const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function BusinessCaseWorkspace({
  bcId,
  clientId,
  clientName,
  clientLogoUrl,
  smarteamLogoUrl,
  brandLogos,
  publishedAt,
  templateId,
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

  // Idioma de la propuesta (lo declara el agente en `__lang` del hero) → traduce
  // los rótulos fijos de los componentes (i18n.ts). Ausente = español.
  const proposalLang =
    ((sectionByKey.get("hero")?.blocks[0]?.data as { __lang?: string } | null)?.__lang) ?? null;

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

  const generate = async () => {
    if (generating) return;
    maybeRequestPermission(); // gesto del usuario → ofrecer activar notificaciones (una vez)
    setGenerating(true);
    toast.info("Generando con IA… puede tardar unos segundos.");
    const notifyUrl = `/business-cases/${bcId}`;
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
        </div>
        <div className="flex items-center gap-2">
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

// ── Dropdown del canvas (Plantilla v0 + "Caso de uso N" con borrar) ────────────
function CanvasDropdown({
  versions,
  canvasId,
  onSwitch,
  onDelete,
}: {
  versions: VersionMeta[];
  canvasId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = versions.find((v) => v.canvasId === canvasId);
  const confirmTarget = versions.find((v) => v.canvasId === confirmId);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xl font-bold text-fg hover:text-fg-secondary transition-colors"
      >
        {active?.name ?? "Caso de uso"}
        <svg className={`w-4 h-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && versions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-surface border border-line rounded-xl shadow-xl py-1">
          {versions.map((v) => (
            <div
              key={v.canvasId}
              className={`flex items-center gap-1 ${v.canvasId === canvasId ? "bg-brand/10" : "hover:bg-surface-hover"}`}
            >
              <button
                onClick={() => { onSwitch(v.canvasId); setOpen(false); }}
                className={`flex-1 text-left px-4 py-2 text-sm transition-colors ${
                  v.canvasId === canvasId ? "text-brand font-semibold" : "text-fg-secondary"
                }`}
              >
                {v.name}{v.isActive ? " · activo" : ""}
              </button>
              {/* La Plantilla (v0) no se borra; los casos de uso sí. */}
              {v.version >= 1 && (
                <button
                  onClick={() => setConfirmId(v.canvasId)}
                  title="Borrar caso de uso"
                  className="flex-shrink-0 p-1.5 mr-1 rounded-md text-fg-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmId}
        onConfirm={async () => {
          if (confirmId) await onDelete(confirmId);
          setConfirmId(null);
          setOpen(false);
        }}
        onCancel={() => setConfirmId(null)}
        title="¿Borrar este caso de uso?"
        description={
          confirmTarget
            ? `Se eliminará "${confirmTarget.name}" con todo su contenido. No afecta la Plantilla ni los otros casos.`
            : ""
        }
        confirmLabel="Borrar"
      />
    </div>
  );
}

// ── Controles por sección (overlay): IA + ocultar + limpiar. Solo en casos, no en la Plantilla. ──
function SectionTools({
  section,
  hook,
  isTemplate,
  templateId,
}: {
  section: SectionWithBlocks | undefined;
  hook: ReturnType<typeof useCanvasSections>;
  isTemplate: boolean;
  templateId?: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const block = section?.blocks[0];
  // En la Plantilla se editan las GUÍAS (no el contenido) → sin controles de sección.
  if (isTemplate || !section || !block) return null;
  // Secciones determinísticas (agentGenerated:false, p.ej. casos_de_uso): sin ✨ IA
  // (el server igual devuelve 400) — se editan a mano o desde el checklist.
  const aiAllowed = templateDefsByKey(templateId)[section.key]?.agentGenerated !== false;

  const regen = async () => {
    if (!instr.trim() || busy) return;
    setBusy(true);
    try {
      const r = await hook.regenerateBlock(section.id, block.id, instr.trim());
      if (r) {
        await hook.saveBlock(section.id, block.id, { data: r.data });
        toast.success("Sección reescrita por IA.");
        setInstr("");
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  // Vaciar la sección → vuelve al placeholder (no se ve en el cliente). Undo vía previousData.
  const clear = async () => {
    const empty = (templateDefsByKey(templateId)[section.key]?.empty ?? {}) as Record<string, unknown>;
    const ok = await hook.saveBlock(section.id, block.id, { data: empty });
    if (ok) toast.info("Sección vaciada (el cliente no la verá).");
  };

  // Pills del chrome — MISMO look que el HideToggle estandarizado (kickoff): píldora
  // blanca translúcida con blur. El toggle de ocultar vive en LandingView.
  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px",
    borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, lineHeight: 1,
    border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.92)",
    color: "#6b7280", backdropFilter: "blur(4px)", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {aiAllowed && (
          <button style={{ ...pill, color: "#168CF6" }} onClick={() => setOpen((o) => !o)} title="Editar con IA">
            ✨ IA
          </button>
        )}
        <button style={{ ...pill, color: "#b91c1c" }} onClick={clear} title="Vaciar el contenido de esta sección">
          🗑 Limpiar
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 6, background: "#fff", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px -8px rgba(15,23,42,0.35)", width: 280 }}>
          <input
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            placeholder="Ej. más concreto y orientado a ventas"
            onKeyDown={(e) => { if (e.key === "Enter") regen(); }}
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 7, color: "#0f172a", outline: "none" }}
          />
          <button onClick={regen} disabled={busy || !instr.trim()} style={{ ...pill, color: "#fff", background: "#168CF6", borderColor: "#168CF6", opacity: busy || !instr.trim() ? 0.5 : 1 }}>
            {busy ? "…" : "Aplicar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Acceso del cliente (pill + modal) ─────────────────────────────────────────
function BcAccessButton({ bcId, refreshKey, onRevoked }: { bcId: string; refreshKey: number; onRevoked: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ exists: boolean; url?: string; accessPassword?: string | null; revokedAt?: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`);
      setState(r.ok ? await r.json() : { exists: false });
    } catch {
      setState({ exists: false });
    }
  }, [bcId]);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const active = !!state?.exists && !state?.revokedAt;
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copiado.`), () => toast.error("No se pudo copiar."));

  const revoke = async () => {
    setWorking(true);
    try {
      await fetch(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      await refresh();
      onRevoked();
      toast.info("Acceso revocado.");
    } catch {
      toast.error("No se pudo revocar.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          active ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover"
        }`}
        title="Acceso del prospecto al caso de negocio"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {active ? "Acceso activo" : "Acceso del cliente"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Acceso del prospecto" size="md">
        {!active ? (
          <p className="text-sm text-fg-muted leading-relaxed">
            Todavía no compartiste el caso. Confirmá secciones y tocá <strong className="text-fg">&quot;Subir al cliente&quot;</strong> para generar el link + contraseña del prospecto.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">El prospecto entra con el link + la contraseña. Entregásela por canal seguro.</p>
            <div>
              <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Link</label>
              <div className="flex items-center gap-1">
                <input readOnly value={state?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 text-[11px] bg-surface-muted border border-line rounded-lg text-fg-secondary font-mono" />
                <button onClick={() => state?.url && copy(state.url, "Link")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
              </div>
            </div>
            {state?.accessPassword && (
              <div>
                <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Contraseña</label>
                <div className="flex items-center gap-1">
                  <input readOnly value={state.accessPassword} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 text-sm bg-surface-muted border border-line rounded-lg text-fg font-mono tracking-wider" />
                  <button onClick={() => state.accessPassword && copy(state.accessPassword, "Contraseña")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={revoke} disabled={working} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {working ? "Revocando…" : "Revocar acceso"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Card de contexto (estilo ProjectHandoffSection) ───────────────────────────
function ContextCard({
  bcId,
  onAfterChange,
  onUseCasesSync,
  onUseCasesState,
}: {
  bcId: string;
  onAfterChange?: () => void;
  /** Re-escribe la sección `casos_de_uso` del canvas visto con los seleccionados (solo al togglear). */
  onUseCasesSync?: (items: { title: string; detail: string; price: string }[]) => void;
  /** Reporte (sin escribir) de los títulos seleccionados — para el aviso al publicar. */
  onUseCasesState?: (titles: string[]) => void;
}) {
  const toast = useToast();
  const [included, setIncluded] = useState<SessionMeta[]>([]);
  const [candidates, setCandidates] = useState<SessionMeta[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Fuentes manuales
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(true);
  // Colapso general de la card (diseño de 3 columnas, calcado de ProjectContextSection).
  const [open, setOpen] = useState(true);
  // Form de pegado manual (colapsado dentro de la columna "Fuentes manuales").
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  // Diagnóstico por URL (fuente URL: fetch server-side, congelado al pegar, releer manual)
  const [newUrl, setNewUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [busyTranscriptId, setBusyTranscriptId] = useState<string | null>(null);
  // Timeline de HubSpot (llamadas + reuniones + notas detectadas en el registro de empresa)
  const [hubspot, setHubspot] = useState<HsTimelineItem[]>([]);
  const [loadingHs, setLoadingHs] = useState(true);
  // Clasificación (tira de tags) — mismo catálogo que el proyecto; se PROPAGA al crear el handoff.
  const [tags, setTags] = useState<string[]>([]);
  const [modality, setModalityState] = useState<ImplementationType | null>(null);
  // Checklist de casos de uso del catálogo — solo se monta si hay catálogo aplicable
  // (degradación elegante: sin catálogo, este BC funciona exactamente como siempre).
  const [useCases, setUseCases] = useState<UseCaseRow[]>([]);
  const [ucEnabled, setUcEnabled] = useState(false);
  const [ucUnavailable, setUcUnavailable] = useState(false);
  const [ucBusyId, setUcBusyId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const d = await fetchJson<{ included: SessionMeta[]; candidates: SessionMeta[] }>(`/api/business-cases/${bcId}/session-candidates`);
      setIncluded(d.included);
      setCandidates(d.candidates);
    } catch {
      /* silencioso */
    } finally {
      setLoadingSessions(false);
    }
  }, [bcId]);
  const loadTranscripts = useCallback(async () => {
    try {
      const d = await fetchJson<{ transcripts: Transcript[] }>(`/api/business-cases/${bcId}/transcript`);
      setTranscripts(d.transcripts);
    } catch {
      /* silencioso */
    } finally {
      setLoadingTranscripts(false);
    }
  }, [bcId]);
  const loadHubspot = useCallback(async () => {
    try {
      const d = await fetchJson<{ items: HsTimelineItem[] }>(`/api/business-cases/${bcId}/hubspot-timeline`);
      setHubspot(d.items);
    } catch {
      /* silencioso — sin HubSpot, el panel sigue */
    } finally {
      setLoadingHs(false);
    }
  }, [bcId]);
  const loadTags = useCallback(async () => {
    try {
      const d = await fetchJson<{ tags: string[]; implementationType: ImplementationType | null }>(`/api/business-cases/${bcId}/tags`);
      setTags(d.tags);
      setModalityState(d.implementationType);
    } catch {
      /* silencioso — la tira aparece vacía/editable */
    }
  }, [bcId]);
  // Devuelve null en error (≠ []): un reload fallido tras togglear NO debe
  // sincronizar la sección con "cero casos" (borraría contenido publicable).
  const ucReqSeq = useRef(0);
  const loadUseCases = useCallback(async (): Promise<UseCaseRow[] | null> => {
    const seq = ++ucReqSeq.current;
    try {
      const d = await fetchJson<{ enabled: boolean; catalogUnavailable: boolean; useCases: UseCaseRow[] }>(
        `/api/business-cases/${bcId}/use-case-candidates`,
      );
      if (seq !== ucReqSeq.current) return null; // respuesta vieja (carrera): descartarla
      setUseCases(d.useCases);
      setUcEnabled(d.enabled);
      setUcUnavailable(d.catalogUnavailable);
      if (d.enabled) onUseCasesState?.(d.useCases.filter((u) => u.selected).map((u) => u.title));
      return d.useCases;
    } catch {
      /* silencioso — sin catálogo, el panel sigue */
      return null;
    }
  }, [bcId, onUseCasesState]);
  useEffect(() => { loadSessions(); loadTranscripts(); loadHubspot(); loadTags(); loadUseCases(); }, [loadSessions, loadTranscripts, loadHubspot, loadTags, loadUseCases]);

  // Persistencia optimista de la clasificación (PATCH /tags).
  const patchTags = useCallback(async (payload: { tags?: string[]; implementationType?: ImplementationType | null }) => {
    try {
      await fetchJson(`/api/business-cases/${bcId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la clasificación.");
      loadTags(); // revertir al estado del servidor
    }
  }, [bcId, toast, loadTags]);
  const saveTags = useCallback((slugs: string[]) => { setTags(slugs); patchTags({ tags: slugs }); }, [patchTags]);
  const setModality = useCallback((m: ImplementationType | null) => { setModalityState(m); patchTags({ implementationType: m }); }, [patchTags]);

  const toggleSession = async (sessionId: string, include: boolean) => {
    setBusyId(sessionId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, included: include }),
      });
      await loadSessions();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la sesión.");
    } finally {
      setBusyId(null);
    }
  };

  const addSource = async () => {
    const content = newContent.trim();
    if (!content || savingSource) return;
    setSavingSource(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "PASTED", rawText: newTitle.trim() ? `${newTitle.trim()}\n\n${content}` : content }),
      });
      setNewTitle("");
      setNewContent("");
      toast.success("Fuente agregada.");
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setSavingSource(false);
    }
  };

  // Leer una URL de diagnóstico (server-side) → fuente URL. El contenido queda
  // congelado al pegar; "Releer" lo refresca a demanda.
  const addUrlSource = async () => {
    const url = newUrl.trim();
    if (!url || fetchingUrl) return;
    setFetchingUrl(true);
    try {
      const d = await fetchJson<{ transcript: { chars: number; updated: boolean } }>(
        `/api/business-cases/${bcId}/transcript/url`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
      );
      setNewUrl("");
      toast.success(
        d.transcript.updated
          ? `Fuente actualizada (${d.transcript.chars.toLocaleString()} caracteres).`
          : `Página leída (${d.transcript.chars.toLocaleString()} caracteres).`,
      );
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo leer la página.");
    } finally {
      setFetchingUrl(false);
    }
  };

  const refetchUrl = async (transcriptId: string) => {
    setBusyTranscriptId(transcriptId);
    try {
      const d = await fetchJson<{ transcript: { chars: number } }>(
        `/api/business-cases/${bcId}/transcript/url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptId, refetch: true }),
        },
      );
      toast.success(`Página releída (${d.transcript.chars.toLocaleString()} caracteres).`);
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo releer la página.");
    } finally {
      setBusyTranscriptId(null);
    }
  };

  const deleteTranscript = async (transcriptId: string) => {
    setBusyTranscriptId(transcriptId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/transcript/${transcriptId}`, { method: "DELETE" });
      toast.info("Fuente eliminada.");
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la fuente.");
    } finally {
      setBusyTranscriptId(null);
    }
  };

  // Marcar/desmarcar (o cambiar priceOverride de) un caso de uso: upsert del pivote +
  // sync de la sección `casos_de_uso` del canvas visto con los seleccionados frescos.
  const patchUseCase = async (useCaseId: string, selected: boolean, priceOverride?: string | null) => {
    setUcBusyId(useCaseId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/use-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseId, selected, ...(priceOverride !== undefined ? { priceOverride } : {}) }),
      });
      const fresh = await loadUseCases();
      if (!fresh) {
        // El toggle SÍ se guardó pero el reload falló: NO sincronizar la sección con
        // datos viejos/vacíos (borraría contenido). El aviso de publish cubre la divergencia.
        toast.error("Se guardó el cambio, pero no se pudo refrescar el checklist. Recargá la página.");
        return;
      }
      onUseCasesSync?.(
        fresh
          .filter((u) => u.selected)
          .map((u) => ({ title: u.title, detail: u.description, price: u.priceOverride ?? u.price ?? "" })),
      );
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el caso de uso.");
    } finally {
      setUcBusyId(null);
    }
  };

  const selectedUcCount = useCases.filter((u) => u.selected).length;

  const sourceCount = included.length + transcripts.length + hubspot.length;
  const q = search.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => (c.title || "").toLowerCase().includes(q)) : candidates;

  const totalCtx = hubspot.length + included.length + transcripts.length;
  const dot = (color: string) => <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      {/* Header colapsable — calcado de ProjectContextSection (Contexto del proyecto) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-hover transition-colors text-left rounded-t-2xl"
      >
        <svg className={`w-4 h-4 text-fg-secondary flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-bold text-fg">Contexto</span>
        <span className="text-[11px] text-fg-muted">{totalCtx} fuente{totalCtx === 1 ? "" : "s"}</span>
        <span className="hidden sm:flex items-center gap-3 ml-2 text-[11px] text-fg-secondary">
          <span className="inline-flex items-center gap-1">{dot("#ff7a59")}{hubspot.length}</span>
          <span className="inline-flex items-center gap-1">{dot("#16a34a")}{included.length}</span>
          <span className="inline-flex items-center gap-1">{dot("#7c6df2")}{transcripts.length}</span>
        </span>
        <span className="ml-auto text-xs text-fg-muted">{open ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Clasificación (tags + modalidad): siempre visible, se propaga al handoff. */}
      <div className="px-5 pb-2.5">
        <TagsStrip tags={tags} implementationType={modality} canEdit onSetTags={saveTags} onSetModality={setModality} />
      </div>

      {/* Aviso proactivo: sin NINGUNA fuente con contenido no se puede generar con IA. */}
      {!loadingSessions && !loadingHs && transcripts.length === 0 && !included.some((s) => s.hasTranscript) && hubspot.length === 0 && (
        <div className="px-5 pb-2.5">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            Para <strong>generar con IA</strong> hace falta al menos una fuente con contenido (transcript o algo del timeline de HubSpot).{" "}
            {included.length > 0 ? "Las sesiones del prospecto todavía no están transcritas — " : ""}
            pegá uno a mano en <strong>Fuentes manuales</strong>.
          </div>
        </div>
      )}

      {/* Cuerpo: 3 columnas (HubSpot · Google Meet · Fuentes manuales), como el proyecto.
          Siempre montado (contadores del header valen colapsado); `hidden` al colapsar. */}
      <div className={open ? "px-5 pb-4" : "hidden"}>
        <p className="text-[11px] text-fg-muted mb-2.5">
          Llamadas, reuniones, notas y transcripciones del prospecto. Se usan automáticamente como contexto al generar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ContextColumn icon={CTX_ICONS.hubspot} color="#ff7a59" title="HubSpot" count={hubspot.length}>
            <ContextColumnList loading={loadingHs} empty="Nada detectado en el registro de la empresa.">
              {hubspot.map((it, i) => (
                <ContextRow
                  key={i}
                  icon={CTX_ICONS.hubspot}
                  meta={`${HS_TYPE_LABEL[it.type] ?? it.type}${it.date ? ` · ${it.date}` : ""}`}
                  title={it.title || undefined}
                  snippet={it.snippet ?? undefined}
                />
              ))}
            </ContextColumnList>
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={included.length}>
            <ContextColumnList loading={loadingSessions} empty="Sin sesiones del prospecto.">
              {included.map((s) => (
                <ContextRow
                  key={s.sessionId}
                  icon={CTX_ICONS.meet}
                  meta={`${fmtDate(s.date)}${!s.hasTranscript ? " · sin transcripción" : ""}`}
                  title={s.title || "Sin título"}
                  onRemove={busyId === s.sessionId ? undefined : () => toggleSession(s.sessionId, false)}
                  removeTitle="Quitar del caso"
                />
              ))}
            </ContextColumnList>
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
              Buscar más sesiones
            </button>
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={transcripts.length}>
            <ContextColumnList loading={loadingTranscripts} empty="Sin notas, URLs ni transcripciones a mano.">
              {transcripts.map((t) => {
                const isUrl = isUrlTranscript(t);
                const busy = busyTranscriptId === t.id;
                return (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-2.5 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={CTX_ICONS.note} />
                        </svg>
                        <span className="truncate">
                          {isUrl
                            ? `URL · ${hostnameOf(t.fileUrl!)}${t.processedAt ? ` · leída ${fmtDate(t.processedAt)}` : ""}`
                            : t.source === "UPLOADED" ? "Archivo" : "Manual"}
                        </span>
                      </div>
                      {t.fileName && <p className="text-xs font-medium text-fg truncate mt-0.5">{t.fileName}</p>}
                      <p className="text-[11px] text-fg-muted truncate">{t.rawText.slice(0, 120)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {isUrl && (
                        <button
                          onClick={() => refetchUrl(t.id)}
                          disabled={busy}
                          title="Releer la página (actualiza el contenido)"
                          className="text-fg-muted hover:text-fg disabled:opacity-40 transition-colors text-xs px-0.5"
                        >
                          ↻
                        </button>
                      )}
                      <button
                        onClick={() => deleteTranscript(t.id)}
                        disabled={busy}
                        title="Eliminar esta fuente"
                        className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ContextColumnList>

            {/* Diagnóstico por URL: fetch server-side; congelado al pegar, releer manual. */}
            <div className="mt-2 flex gap-1.5">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addUrlSource(); }}
                placeholder="URL del diagnóstico…"
                className="flex-1 min-w-0 px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
              />
              <button
                onClick={addUrlSource}
                disabled={fetchingUrl || newUrl.trim().length === 0}
                className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
              >
                {fetchingUrl ? "Leyendo…" : "Leer"}
              </button>
            </div>

            {showAdd ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título (ej. Zoom con el prospecto)"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  placeholder="Pegá el transcript o resumen…"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
                />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => { setShowAdd(false); setNewTitle(""); setNewContent(""); }} className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-lg transition-colors">Cancelar</button>
                  <button onClick={addSource} disabled={savingSource || newContent.trim().length === 0} className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">{savingSource ? "Agregando…" : "Agregar"}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Agregar fuente
              </button>
            )}
          </ContextColumn>
        </div>
      </div>

      {/* Checklist de casos de uso del catálogo — INTERNO (para compartir pantalla):
          lo marcado se materializa en la sección "Casos de uso" con precios exactos.
          Solo se monta si hay catálogo aplicable; sin catálogo, nada cambia. */}
      {ucUnavailable && (
        <div className="border-t border-line px-5 py-3">
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            El catálogo de casos de uso no está disponible (tabla ausente en la base). No regeneres
            este caso hasta resolverlo — la sección de casos de uso saldría vacía.
          </p>
        </div>
      )}
      {ucEnabled && useCases.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <p className="text-xs font-semibold text-fg-muted mb-2">
            Casos de uso del catálogo{selectedUcCount > 0 ? ` (${selectedUcCount} seleccionados)` : ""}
          </p>
          <p className="text-[11px] text-fg-muted leading-relaxed mb-2.5">
            Marcá los que van en esta propuesta: entran a la sección &quot;Casos de uso&quot; con el texto y
            precio exactos del catálogo (el agente no los inventa ni los altera).
          </p>
          <ul className="space-y-1.5">
            {useCases.map((u) => (
              <li
                key={u.id}
                className={`rounded-lg border px-3 py-2.5 ${u.selected ? "border-brand/50 bg-brand/5" : "border-line"}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={u.selected}
                    // Se deshabilita TODO el checklist con un patch en vuelo: dos toggles
                    // concurrentes en filas distintas reordenados por la red revertirían
                    // el segundo (el load viejo pisa al nuevo).
                    disabled={ucBusyId !== null}
                    onChange={() => patchUseCase(u.id, !u.selected)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-fg font-medium block">
                      {u.title}
                      {u.price && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border border-line text-fg-muted">
                          {u.price}
                        </span>
                      )}
                      {!u.active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">
                          retirado del catálogo
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-fg-muted block mt-0.5">{u.description}</span>
                  </span>
                </label>
                {u.selected && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    <span className="text-[11px] text-fg-muted flex-shrink-0">Precio para este caso:</span>
                    <input
                      defaultValue={u.priceOverride ?? ""}
                      placeholder={u.price ?? "según catálogo"}
                      disabled={ucBusyId !== null}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (u.priceOverride ?? "")) patchUseCase(u.id, true, v || null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-44 px-2 py-1 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modal "Buscar más sesiones" */}
      <Modal open={showSearch} onClose={() => { setShowSearch(false); setSearch(""); }} title="Buscar sesiones del prospecto" size="md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título…"
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-3"
        />
        {filtered.length === 0 ? (
          <p className="text-xs text-fg-muted py-2">No se encontraron más sesiones del prospecto.</p>
        ) : (
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.sessionId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                    <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                    {c.applies && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 flex-shrink-0">Ventas</span>
                    )}
                    {!c.hasTranscript && (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">sin transcripción</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleSession(c.sessionId, true)}
                  disabled={busyId === c.sessionId}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  Agregar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </section>
  );
}
