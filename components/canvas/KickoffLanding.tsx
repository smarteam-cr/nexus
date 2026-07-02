"use client";

/**
 * components/canvas/KickoffLanding.tsx
 *
 * Render tipo LANDING del canvas "Kickoff" (Camino C), con el design system de
 * las landings de Smarteam (clases scopeadas bajo `.kickoff-landing` en
 * app/kickoff-landing.css).
 *
 * Dos modos, MISMA presentación (Fase C.1):
 *   - INTERNO (CSE): <KickoffLanding projectId canvasId editable /> → KickoffLandingInternal
 *     usa useCanvasSections + fetch del timeline (endpoints guarded) y permite
 *     revisar/aceptar/editar bloques in-situ.
 *   - EXTERNO (cliente): <KickoffLanding data={...} /> → render read-only desde
 *     props (data ya resuelta server-side, token-scoped, solo bloques CONFIRMED).
 *     NO toca endpoints internos ni trae campos internos (source/status/agentRunId).
 *
 * Las reglas de hooks obligan a separar la parte con hooks (Internal) de la
 * presentacional (View): el router de abajo elige una u otra según props.
 *
 * El CRONOGRAMA se lee del ProjectTimeline; el agente NO lo regenera → fuente única.
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useCanvasSections } from "./useCanvasSections";
import PublishBar from "./PublishBar";
import KickoffBlock from "./KickoffBlock";
import TimelineSection from "./TimelineSection";
import { useReveal, useHeroParallax } from "./useLandingMotion";
import type {
  KickoffLandingData,
  KickoffSection,
  KickoffTimelineData,
  KickoffPhase,
  KickoffProceso,
  RenderableBlock,
} from "@/lib/external/kickoff-view-types";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";

import { fmtFull, timelineSpan } from "@/lib/timeline/weeks";

// FlowchartViewer (@xyflow) es pesado y necesita window → lazy + sin SSR. Solo se carga
// cuando hay procesos que renderizar.
const FlowchartViewer = dynamic(() => import("@/components/flowchart/FlowchartViewer"), {
  ssr: false,
  loading: () => <div className="skeleton-shimmer" style={{ height: 440, borderRadius: 12 }} />,
});

/** Mapea un proceso del cliente al shape que espera FlowchartViewer. */
function toFlowchartData(p: KickoffProceso): FlowchartData {
  const d = (p.data ?? {}) as { nodes?: unknown[]; edges?: unknown[]; description?: string };
  return {
    title: p.title ?? undefined,
    description: d.description,
    nodes: (d.nodes ?? []) as FlowchartData["nodes"],
    edges: (d.edges ?? []) as FlowchartData["edges"],
  };
}

const MAXW = 760;
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

/** Palabra de acento (italic + azul) dentro de un título display. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{children}</span>;
}

/** Eyebrow + título (con palabra italic) por sección — presentacional, fijo.
 *  Las 6 secciones del canvas Kickoff son conocidas; fallback a section.label. */
// `title` = título styled por defecto (con palabra accent). `titleText` = la versión en
// texto plano, que siembra el editor inline cuando el CSE personaliza el título.
const SECTION_META: Record<string, { eyebrow: string; title: ReactNode; titleText: string }> = {
  objetivos:      { eyebrow: "Lo que buscamos", title: <>Objetivos del <Accent>proyecto</Accent></>, titleText: "Objetivos del proyecto" },
  alcance:        { eyebrow: "El trabajo",      title: <>Alcance: qué <Accent>incluye</Accent></>, titleText: "Alcance: qué incluye" },
  tu_rol:         { eyebrow: "Tu parte",        title: <>Lo que necesitamos de tu <Accent>equipo</Accent></>, titleText: "Lo que necesitamos de tu equipo" },
  metricas_exito: { eyebrow: "La medición",     title: <>Cómo mediremos el <Accent>éxito</Accent></>, titleText: "Cómo mediremos el éxito" },
  proximos_pasos: { eyebrow: "El arranque",     title: <><Accent>Próximos</Accent> pasos</>, titleText: "Próximos pasos" },
};

/* ── Handlers del modo interno (todos opcionales: ausentes en modo externo) ──── */
interface LandingHandlers {
  draftCount?: number;
  error?: string | null;
  clearError?: () => void;
  saveBlock?: (sectionId: string, blockId: string, updates: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  regenerateBlock?: (sectionId: string, blockId: string, instruction: string, base?: { content?: string | null; data?: unknown }) => Promise<{ content?: string | null; data?: unknown } | null>;
  acceptBlock?: (sectionId: string, blockId: string) => void;
  deleteBlock?: (sectionId: string, blockId: string) => void;
  /** Deshacer de 1 nivel un bloque (vuelve a su versión previa). */
  undoBlock?: (sectionId: string, blockId: string) => void;
  addBlock?: (sectionId: string) => void;
  /** Edita el título de cara al cliente de una sección (titleOverride). */
  renameSection?: (sectionId: string, title: string) => void;
  /** Edita el eyebrow (título pequeño) de una sección (eyebrowOverride). */
  setEyebrow?: (sectionId: string, eyebrow: string) => void;
  /** Deshacer de 1 nivel el título o el eyebrow de una sección. */
  undoSection?: (sectionId: string, which: "title" | "eyebrow") => void;
  acceptAll?: () => void;
  /** #3 — claves OCULTAS del kickoff (id de sección, "procesos", "cronograma", id de proceso). */
  hiddenKeys?: Set<string>;
  /** #3 — togglear la visibilidad de una clave (solo editor). */
  onToggleHidden?: (key: string, hidden: boolean) => void;
  /** Hay cambios sin subir (visibilidad staged y/o procesos en borrador). */
  dirty?: boolean;
  publishing?: boolean;
  /** Subir al cliente: confirma procesos en borrador + persiste la visibilidad. */
  onPublishKickoff?: () => void;
}

/* ── Router: elige modo según props (sin hooks → no viola reglas de hooks) ───── */
type KickoffLandingProps =
  | { data: KickoffLandingData; editable?: false }
  | { projectId: string; canvasId: string; editable?: boolean };

export default function KickoffLanding(props: KickoffLandingProps) {
  if ("data" in props) {
    // Modo EXTERNO: data ya resuelta server-side, read-only.
    return <KickoffLandingView sections={props.data.sections} timeline={props.data.timeline} clientLogoUrl={props.data.clientLogoUrl} platformLogos={props.data.platformLogos} procesos={props.data.procesos} editable={false} />;
  }
  // Modo INTERNO: hooks + fetch.
  return <KickoffLandingInternal projectId={props.projectId} canvasId={props.canvasId} editable={props.editable} />;
}

/* ── Modo interno (CSE): hooks de datos + skeleton, delega el render al View ──── */
function KickoffLandingInternal({
  projectId,
  canvasId,
  editable = false,
}: {
  projectId: string;
  canvasId: string;
  editable?: boolean;
}) {
  // D.3 staging — contenido (bloques/secciones) editado después del último "Subir".
  // setContentDirty(true) enciende la barra en el acto (callback del hook); el GET
  // inicial lo hidrata del server (contentUpdatedAt > publishedSnapshotAt) para
  // sobrevivir al remonte.
  const [contentDirty, setContentDirty] = useState(false);
  const {
    sections,
    loading,
    draftCount,
    acceptBlock,
    deleteBlock,
    saveBlock,
    regenerateBlock,
    undoBlock,
    addBlock,
    renameSection,
    setEyebrow,
    undoSection,
    acceptAll,
    error,
    clearError,
  } = useCanvasSections(`/api/projects/${projectId}`, canvasId, () => setContentDirty(true));

  const [timeline, setTimeline] = useState<KickoffTimelineData | null>(null);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [platformLogos, setPlatformLogos] = useState<string[]>([]);
  const [procesos, setProcesos] = useState<KickoffProceso[]>([]);
  // #3 — claves ocultas del kickoff (secciones/procesos/cronograma). El editor las
  // muestra atenuadas con un toggle; la vista del cliente las omite (server-side).
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // edición LOCAL (staged)
  const [savedHiddenKeys, setSavedHiddenKeys] = useState<Set<string>>(new Set()); // baseline persistido
  const [publishing, setPublishing] = useState(false);

  // Procesos del cliente (diagramas) — el preview interno los muestra todos. Endpoint guarded.
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

  // D.3 staging — estado de subida del CONTENIDO: hidrata la barra "cambios sin subir"
  // al montar (contentUpdatedAt > publishedSnapshotAt), sin esperar a una edición nueva.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/kickoff-content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContentDirty(!!d?.dirty))
      .catch(() => {});
  }, [projectId]);

  // STAGED: el toggle solo cambia el set LOCAL; se persiste recién al "Subir cambios al cliente".
  const toggleHidden = (key: string, hidden: boolean) => {
    setHiddenKeys((prev) => {
      const n = new Set(prev);
      if (hidden) n.add(key);
      else n.delete(key);
      return n;
    });
  };

  // ¿Hay cambios de visibilidad sin persistir? (set local distinto del baseline guardado)
  const visibilityDirty =
    hiddenKeys.size !== savedHiddenKeys.size || [...hiddenKeys].some((k) => !savedHiddenKeys.has(k));
  // Cambios sin subir = visibilidad staged O contenido editado tras el último "Subir".
  const dirty = visibilityDirty || contentDirty;

  // Subir al cliente TODO lo pendiente: confirma los procesos en borrador y persiste la
  // visibilidad (secciones/procesos ocultos). Es el "Subir cambios al cliente".
  const publishChanges = async () => {
    setPublishing(true);
    try {
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
      // D.3 staging — congelar el snapshot del CONTENIDO (bloques + overrides): el
      // cliente lo ve recién ahora. Tras subir, ya no hay "cambios sin subir".
      await fetch(`/api/projects/${projectId}/kickoff-content`, { method: "POST" }).catch(() => {});
      setContentDirty(false);
    } catch {
      /* dejar el estado local; el usuario puede reintentar */
    }
    setPublishing(false);
  };

  // Logo del cliente + logos de plataforma (HubSpot/Insider según tags): mismo chip
  // que la vista externa, también en el preview interno. Endpoint guarded.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/client-logo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setClientLogoUrl(d?.logoUrl ?? null);
        setPlatformLogos(Array.isArray(d?.platformLogos) ? d.platformLogos : []);
      })
      .catch(() => {
        setClientLogoUrl(null);
        setPlatformLogos([]);
      });
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Preview FIEL a la superficie externa (mismos gates que kickoff-view.ts):
        // D.1.5 — regla unificada: sin timelinePublishedAt el cliente NO ve la
        // sección de cronograma (ni siquiera con el kickoff publicado) → acá
        // tampoco se muestra. Y las acciones por semana solo con el detalle
        // confirmado, solo título+semana — el detalle vive en el canvas Cronograma.
        if (!d || !d.exists || !d.timelinePublishedAt) {
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

  if (loading) {
    return (
      <div className="kickoff-landing">
        <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <KickoffLandingView
      sections={sections}
      timeline={timeline}
      editable={editable}
      hiddenKeys={hiddenKeys}
      onToggleHidden={toggleHidden}
      dirty={dirty}
      publishing={publishing}
      onPublishKickoff={publishChanges}
      clientLogoUrl={clientLogoUrl}
      platformLogos={platformLogos}
      procesos={procesos}
      draftCount={draftCount}
      error={error}
      clearError={clearError}
      saveBlock={saveBlock}
      regenerateBlock={regenerateBlock}
      acceptBlock={acceptBlock}
      deleteBlock={deleteBlock}
      undoBlock={undoBlock}
      addBlock={addBlock}
      renameSection={renameSection}
      setEyebrow={setEyebrow}
      undoSection={undoSection}
      acceptAll={acceptAll}
    />
  );
}

/* ── View presentacional: recibe data + handlers opcionales; cero data-fetching ─ */
export function KickoffLandingView({
  sections,
  timeline,
  editable,
  hiddenKeys,
  onToggleHidden,
  dirty,
  publishing,
  onPublishKickoff,
  clientLogoUrl = null,
  platformLogos = [],
  procesos = [],
  draftCount = 0,
  error = null,
  clearError,
  saveBlock,
  regenerateBlock,
  acceptBlock,
  deleteBlock,
  undoBlock,
  addBlock,
  renameSection,
  setEyebrow,
  undoSection,
  acceptAll,
}: {
  sections: KickoffSection[];
  timeline: KickoffTimelineData | null;
  editable: boolean;
  /** Logo del cliente (solo modo externo); en interno va ausente → null. */
  clientLogoUrl?: string | null;
  /** Logos de PLATAFORMA (HubSpot / Insider One, config global según tags del proyecto). */
  platformLogos?: string[];
  /** Diagramas de proceso del cliente (sección "Procesos"). */
  procesos?: KickoffProceso[];
} & LandingHandlers) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useReveal(rootRef, [sections.length, timeline?.phases.length, procesos.length, editable]);
  useHeroParallax(heroRef);

  const hero = sections.find((s) => s.key === "bienvenida");
  const body = sections.filter((s) => s.key !== "bienvenida");
  const hasProximos = body.some((s) => s.key === "proximos_pasos");
  // Procesos sin confirmar: el cliente solo ve los CONFIRMED → CTA para subirlos.
  const draftProcesos = editable ? procesos.filter((p) => p.status === "DRAFT") : [];

  const phases = timeline?.phases ?? [];
  // "Duración total" = LARGO DE CALENDARIO (timelineSpan = max end de los rangos), NO la suma de
  // duraciones (eso es esfuerzo). Con fases en paralelo la suma sobrecuenta el tiempo real del
  // proyecto; el span coincide con las barras del Gantt. Con todo secuencial, span === suma (cero regresión).
  const totalWeeks = timelineSpan(phases);
  const startLabel = timeline?.anchorStartDate ? fmtFull(timeline.anchorStartDate) : "Por definir";

  return (
    <div ref={rootRef} className="kickoff-landing">
      {/* Error de guardado — no silencioso (modo interno) */}
      {editable && error && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => clearError?.()} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* Revisión del agente — CHROME DE NEXUS (interno), NO parte del landing del
          cliente. Barra sticky con estética de app (clara, marca Nexus) para que se lea
          como un mensaje de la herramienta, no como contenido del kickoff. */}
      {editable && draftCount > 0 && acceptAll && (
        <div style={{ position: "sticky", top: 0, zIndex: 49, display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#eef2ff", borderBottom: "1px solid #c7d2fe", color: "#3730a3", fontSize: 13, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Nexus
          </span>
          <span style={{ flex: 1 }}>
            El agente generó {draftCount} {draftCount === 1 ? "bloque" : "bloques"} sin revisar — solo vos los ves.
          </span>
          <button onClick={acceptAll} className="btn-primary" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
            Aceptar todo
          </button>
        </div>
      )}
      {/* Barra ÚNICA de guardar/subir — IDÉNTICA a la del cronograma. El kickoff
          auto-guarda cada cambio al instante (interno); la barra muestra "Cambios
          guardados" y el único paso al cliente es "Subir" (snapshot + visibilidad +
          procesos, todo de una). Sticky porque el landing es largo. */}
      {editable && onPublishKickoff && (
        <PublishBar
          sticky
          hideWhenClean
          unpublished={dirty || draftProcesos.length > 0}
          onPublish={onPublishKickoff}
          publishing={publishing}
          savedMessage={`Cambios guardados${draftProcesos.length > 0 ? ` (${draftProcesos.length} ${draftProcesos.length === 1 ? "proceso sin confirmar" : "procesos sin confirmar"})` : ""} — el cliente todavía no los ve.`}
        />
      )}
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="section-dark hero-backdrop" style={{ padding: "clamp(56px, 8vw, 96px) 24px clamp(48px, 6vw, 72px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          {(clientLogoUrl || platformLogos.length > 0) && (
            <div className="reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              {/* Chip blanco para contraste sobre el hero oscuro: cliente × plataforma(s) */}
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 14, background: "#fff", borderRadius: 16, padding: "14px 20px", boxShadow: "0 10px 30px rgba(0,0,0,0.22)" }}>
                {clientLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clientLogoUrl} alt="" style={{ height: 46, width: "auto", maxWidth: 220, objectFit: "contain", display: "block" }} />
                )}
                {platformLogos.map((url, i) => (
                  <Fragment key={i}>
                    {(clientLogoUrl || i > 0) && (
                      <span style={{ color: "#94a3b8", fontSize: 14, fontWeight: 600 }}>×</span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ height: 34, width: "auto", maxWidth: 160, objectFit: "contain", display: "block" }} />
                  </Fragment>
                ))}
              </span>
            </div>
          )}
          <EditableHeading
            tag="span"
            editable={editable}
            override={hero?.eyebrowOverride}
            previous={hero?.previousEyebrowOverride}
            defaultNode="Kickoff del proyecto"
            defaultText="Kickoff del proyecto"
            onSave={hero && setEyebrow ? (v) => setEyebrow(hero.id, v) : undefined}
            onUndo={hero && undoSection ? () => undoSection(hero.id, "eyebrow") : undefined}
            className="eyebrow"
          />
          <EditableHeading
            tag="h1"
            editable={editable}
            override={hero?.titleOverride}
            previous={hero?.previousTitleOverride}
            defaultNode="¡Arranquemos juntos!"
            defaultText="¡Arranquemos juntos!"
            onSave={hero && renameSection ? (v) => renameSection(hero.id, v) : undefined}
            onUndo={hero && undoSection ? () => undoSection(hero.id, "title") : undefined}
            className="font-display display-italic display-tight"
            style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.06, color: "var(--dark-text)", marginTop: 16 }}
          />
          {hero && hero.blocks.length > 0 && (
            <div className="reveal" data-stagger="2" style={{ marginTop: 18, maxWidth: 600, marginInline: "auto", fontSize: 17, display: "flex", flexDirection: "column", gap: editable ? 14 : 6 }}>
              {hero.blocks.map((b) => (
                // BlockRow (no KickoffBlock pelado) → el hero gana el mismo chrome de edición
                // que el cuerpo: editar inline, ✨IA, aceptar y BORRAR por bloque. invert =
                // prosa clara sobre el hero oscuro. En vista cliente (editable=false) BlockRow
                // no pinta controles → idéntico al render anterior.
                <BlockRow
                  key={b.id}
                  block={b}
                  editable={editable}
                  invert
                  onSave={saveBlock ? (u) => saveBlock(hero.id, b.id, u) : undefined}
                  onRegenerate={regenerateBlock ? (instr, base) => regenerateBlock(hero.id, b.id, instr, base) : undefined}
                  onAccept={acceptBlock ? () => acceptBlock(hero.id, b.id) : undefined}
                  onDelete={deleteBlock ? () => deleteBlock(hero.id, b.id) : undefined}
                  onUndo={undoBlock ? () => undoBlock(hero.id, b.id) : undefined}
                />
              ))}
            </div>
          )}
          {phases.length > 0 && (
            <div className="reveal" data-stagger="3" style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", marginTop: 38 }}>
              <Stat value={String(totalWeeks)} unit="semanas" label="Duración total" />
              <Stat value={startLabel} label="Arranque" />
              <Stat value={String(phases.length)} unit={phases.length === 1 ? "fase" : "fases"} label="Hoja de ruta" />
            </div>
          )}
        </div>
      </section>

      {/* ── CUERPO ───────────────────────────────────────────────────────── */}
      {body.map((section, i) => {
        const bg = i % 2 === 0 ? "section-light" : "section-soft";
        return (
          <div key={section.id}>
            {section.key === "proximos_pasos" && (
              phases.length > 0 ? (
                <HideableSection editable={editable} hiddenKeys={hiddenKeys} onToggleHidden={onToggleHidden} sectionKey="cronograma" label="el cronograma">
                  <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />
                </HideableSection>
              ) : (
                <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />
              )
            )}
            <HideableSection editable={editable} hiddenKeys={hiddenKeys} onToggleHidden={onToggleHidden} sectionKey={section.id} label="esta sección">
            <section className={bg} style={{ padding: SECTION_PAD }}>
              <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
                <EditableHeading
                  tag="span"
                  editable={editable}
                  override={section.eyebrowOverride}
                  previous={section.previousEyebrowOverride}
                  defaultNode={SECTION_META[section.key]?.eyebrow ?? "Sección"}
                  defaultText={SECTION_META[section.key]?.eyebrow ?? "Sección"}
                  onSave={setEyebrow ? (v) => setEyebrow(section.id, v) : undefined}
                  onUndo={undoSection ? () => undoSection(section.id, "eyebrow") : undefined}
                  className="eyebrow"
                />
                <EditableHeading
                  tag="h2"
                  editable={editable}
                  override={section.titleOverride}
                  previous={section.previousTitleOverride}
                  defaultNode={SECTION_META[section.key]?.title ?? section.label}
                  defaultText={SECTION_META[section.key]?.titleText ?? section.label}
                  onSave={renameSection ? (v) => renameSection(section.id, v) : undefined}
                  onUndo={undoSection ? () => undoSection(section.id, "title") : undefined}
                  className="font-display display-tight"
                  style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}
                />
                <div className={`reveal${section.key === "tu_rol" ? " kl-panel" : ""}`} data-stagger="2" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {section.blocks.length === 0 && !editable && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>—</p>}
                  {section.blocks.map((block) => (
                    <BlockRow
                      key={block.id}
                      block={block}
                      editable={editable}
                      onSave={saveBlock ? (u) => saveBlock(section.id, block.id, u) : undefined}
                      onRegenerate={regenerateBlock ? (instr, base) => regenerateBlock(section.id, block.id, instr, base) : undefined}
                      onAccept={acceptBlock ? () => acceptBlock(section.id, block.id) : undefined}
                      onDelete={deleteBlock ? () => deleteBlock(section.id, block.id) : undefined}
                      onUndo={undoBlock ? () => undoBlock(section.id, block.id) : undefined}
                    />
                  ))}
                  {editable && addBlock && <AddBlock onClick={() => addBlock(section.id)} />}
                </div>
              </div>
            </section>
            </HideableSection>
          </div>
        );
      })}

      {/* Si no hay sección "Próximos pasos", el cronograma va antes del cierre */}
      {!hasProximos && (
        phases.length > 0 ? (
          <HideableSection editable={editable} hiddenKeys={hiddenKeys} onToggleHidden={onToggleHidden} sectionKey="cronograma" label="el cronograma">
            <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />
          </HideableSection>
        ) : (
          <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />
        )
      )}

      {/* ── PROCESOS ─── diagramas del cliente (si hay). Render read-only del flowchart. */}
      {procesos.length > 0 && (
        <HideableSection editable={editable} hiddenKeys={hiddenKeys} onToggleHidden={onToggleHidden} sectionKey="procesos" label="los procesos">
          <section className="section-soft" style={{ padding: SECTION_PAD }}>
            <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
              <span className="eyebrow reveal">Cómo trabajamos</span>
              <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
                Nuestros <Accent>procesos</Accent>
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {procesos.map((p) => {
                  const content = (
                    <>
                      {editable && p.status && (
                        <ProcesoStatusBar status={p.status} />
                      )}
                      {p.title && (
                        <h3 className="font-display" style={{ fontSize: 18, color: "var(--text)", marginBottom: 10 }}>{p.title}</h3>
                      )}
                      <div style={{ height: "min(72vh, 780px)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg, #fff)" }}>
                        <FlowchartViewer data={toFlowchartData(p)} />
                      </div>
                    </>
                  );
                  // El toggle por proceso solo tiene sentido con 2+ procesos; con 1, basta el de la sección.
                  return procesos.length > 1 ? (
                    <HideableSection key={p.id} editable={editable} hiddenKeys={hiddenKeys} onToggleHidden={onToggleHidden} sectionKey={p.id} label="este proceso">
                      <div className="reveal">{content}</div>
                    </HideableSection>
                  ) : (
                    <div key={p.id} className="reveal">{content}</div>
                  );
                })}
              </div>
            </div>
          </section>
        </HideableSection>
      )}

      {/* Cierre dark — bookend editorial con el hero */}
      <section className="section-dark hero-backdrop" style={{ padding: "clamp(52px, 7vw, 84px) 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <span className="eyebrow reveal">El siguiente paso</span>
          <h2 className="font-display display-italic display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(28px, 4vw, 44px)", color: "var(--dark-text)", lineHeight: 1.1, marginTop: 14 }}>
            ¡Estamos listos para empezar!
          </h2>
          <p className="reveal" data-stagger="2" style={{ color: "var(--dark-text-secondary)", fontSize: 16, marginTop: 16, maxWidth: 560, marginInline: "auto" }}>
            Tu equipo de Smarteam ya tiene todo lo necesario para arrancar. Coordinamos la primera sesión y damos juntos el primer paso.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-componentes ──────────────────────────────────────────────────────── */

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="font-display" style={{ color: "var(--dark-text)", fontSize: 28, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--dark-text-secondary)", marginLeft: 6 }}>{unit}</span>}
      </div>
      <div className="eyebrow" style={{ color: "var(--dark-text-muted)", marginTop: 7, fontSize: 11 }}>
        {label}
      </div>
    </div>
  );
}

function IconBtn({ title, color, onClick, path }: { title: string; color: string; onClick: () => void; path: string }) {
  return (
    <button onClick={onClick} title={title} style={{ display: "inline-flex", padding: 2, color, background: "transparent", border: "none", cursor: "pointer", borderRadius: 4 }}>
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d={path} />
      </svg>
    </button>
  );
}

/* ── Estado de confirmación de un proceso del cliente (solo editor) ─────────── */
function ProcesoStatusBar({ status, onConfirm }: { status: string; onConfirm?: (confirmed: boolean) => void }) {
  const confirmed = status === "CONFIRMED";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span
        style={{
          fontSize: 11, fontWeight: 700, lineHeight: 1, padding: "4px 10px", borderRadius: 999,
          ...(confirmed
            ? { color: "#047857", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)" }
            : { color: "#b45309", background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)" }),
        }}
      >
        {confirmed ? "✓ Visible para el cliente" : "Borrador — el cliente no lo ve"}
      </span>
      {onConfirm &&
        (confirmed ? (
          <button
            onClick={() => onConfirm(false)}
            style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Pasar a borrador
          </button>
        ) : (
          <button
            onClick={() => onConfirm(true)}
            style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}
          >
            Confirmar para el cliente
          </button>
        ))}
    </div>
  );
}

/* ── #3 — visibilidad por sección/proceso (solo editor) ─────────────────────── */
function HideToggle({ hidden, label, onToggle }: { hidden: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? `Mostrar ${label} al cliente` : `Ocultar ${label} del cliente`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px",
        borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, lineHeight: 1,
        border: `1px solid ${hidden ? "rgba(245,158,11,0.6)" : "rgba(0,0,0,0.12)"}`,
        background: hidden ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.92)",
        color: hidden ? "#b45309" : "#6b7280", backdropFilter: "blur(4px)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {hidden ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
        ) : (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      {hidden ? "Oculto" : "Ocultar"}
    </button>
  );
}

/** Envuelve una sección/proceso del kickoff: en el editor agrega un toggle flotante
 *  de ocultar/mostrar y atenúa el contenido si está oculto. En la vista del cliente
 *  (editable=false) es transparente (el filtrado real lo hace kickoff-view.ts). */
function HideableSection({
  editable, hiddenKeys, onToggleHidden, sectionKey, label, children,
}: {
  editable: boolean;
  hiddenKeys?: Set<string>;
  onToggleHidden?: (key: string, hidden: boolean) => void;
  sectionKey: string;
  label: string;
  children: ReactNode;
}) {
  if (!editable || !onToggleHidden) return <>{children}</>;
  const hidden = !!hiddenKeys?.has(sectionKey);
  return (
    <div style={{ position: "relative", ...(hidden ? { outline: "2px dashed rgba(245,158,11,0.55)", outlineOffset: -4, borderRadius: 10 } : {}) }}>
      <div style={{ position: "absolute", top: 12, right: 16, zIndex: 30, display: "flex", alignItems: "center", gap: 8 }}>
        {hidden && (
          <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, color: "#b45309", background: "rgba(245,158,11,0.16)", border: "1px solid rgba(245,158,11,0.5)", borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
            No visible para el cliente
          </span>
        )}
        <HideToggle hidden={hidden} label={label} onToggle={() => onToggleHidden(sectionKey, !hidden)} />
      </div>
      <div style={hidden ? { opacity: 0.42, filter: "grayscale(0.55)" } : undefined}>
        {children}
      </div>
    </div>
  );
}

function BlockRow({
  block,
  editable,
  invert = false,
  onSave,
  onRegenerate,
  onAccept,
  onDelete,
  onUndo,
}: {
  block: RenderableBlock;
  editable: boolean;
  /** Prosa light-on-dark (hero oscuro) — se reenvía a KickoffBlock. */
  invert?: boolean;
  onSave?: (u: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  onRegenerate?: (instruction: string, base?: { content?: string | null; data?: unknown }) => Promise<{ content?: string | null; data?: unknown } | null>;
  onAccept?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
}) {
  const isDraft = block.status === "DRAFT";
  // Hay versión previa persistida → se puede deshacer el último cambio (1 nivel).
  const b = block as RenderableBlock & { previousContent?: string | null; previousData?: unknown };
  const canUndo = !!onUndo && (b.previousContent != null || b.previousData != null);
  return (
    <div className="group/row" style={{ position: "relative" }}>
      {/* Franja de controles con su PROPIO espacio, encima del bloque — nunca
          solapa el contenido. Solo modo interno; el cliente no ve esto. El estado
          (Borrador/Editado) lo señala el pill aquí (ya no una barra lateral). */}
      {editable && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, minHeight: 22 }}>
          {isDraft && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-blue)", background: "var(--brand-blue-soft)", padding: "2px 7px", borderRadius: 999 }}>Borrador</span>
          )}
          {!isDraft && block.source === "MODIFIED" && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-teal-dark)", background: "var(--brand-teal-soft)", padding: "2px 7px", borderRadius: 999 }}>Editado</span>
          )}
          <div style={{ flex: 1 }} />
          {canUndo && (
            <button
              onClick={() => onUndo?.()}
              title="Deshacer el último cambio"
              style={{ fontSize: 11, color: "var(--text-muted, #6b7280)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}
            >
              ↶ Deshacer
            </button>
          )}
          {isDraft && <IconBtn title="Aceptar" color="#16a34a" onClick={() => onAccept?.()} path="M5 13l4 4L19 7" />}
          <IconBtn title="Eliminar bloque" color="#dc2626" onClick={() => onDelete?.()} path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </div>
      )}
      <KickoffBlock block={block} editable={editable} invert={invert} onSave={onSave} onRegenerate={onRegenerate} />
    </div>
  );
}

function AddBlock({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 4, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", background: "transparent", border: "1px dashed var(--border-strong)", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
    >
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Agregar bloque
    </button>
  );
}

/** Título de sección editable inline (h1 del hero / h2 del cuerpo). Sin override →
 *  título styled de la plantilla; con override → texto plano del CSE. Editar solo en
 *  modo interno (onSave presente). En vista cliente es un heading normal. */
function SectionHeading({
  tag: Tag,
  editable,
  override,
  defaultNode,
  defaultText,
  onSave,
  className,
  style,
}: {
  tag: "h1" | "h2" | "span";
  editable: boolean;
  override?: string | null;
  defaultNode: ReactNode;
  defaultText: string;
  onSave?: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = editable && !!onSave;

  if (canEdit && editing) {
    // El input hereda la tipografía del heading (mismo className), menos `reveal`
    // (su animación de opacity dejaría el input invisible al remontar en edición).
    const inputClassName = (className ?? "").split(" ").filter((c) => c !== "reveal").join(" ");
    return (
      <InlineTitleInput
        initial={override || defaultText}
        className={inputClassName}
        style={style}
        onSave={(v) => { onSave!(v); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Tag
      className={className}
      style={canEdit ? { ...style, cursor: "text" } : style}
      onClick={canEdit ? () => setEditing(true) : undefined}
      title={canEdit ? "Clic para editar el título" : undefined}
    >
      {override ? override : defaultNode}
    </Tag>
  );
}

/** Wrapper de un título/eyebrow editable: contenedor `.reveal` ESTABLE (arregla el bug de
 *  invisibilidad al remontar) + el heading interno SIN reveal + botón "Deshacer" cuando hay
 *  una versión previa persistida (deshacer de 1 nivel; toggle actual↔previous). */
function EditableHeading({
  tag,
  editable,
  override,
  previous,
  defaultNode,
  defaultText,
  onSave,
  onUndo,
  className,
  style,
  wrapperStyle,
}: {
  tag: "h1" | "h2" | "span";
  editable: boolean;
  override?: string | null;
  previous?: string | null;
  defaultNode: ReactNode;
  defaultText: string;
  onSave?: (v: string) => void;
  onUndo?: () => void;
  className?: string;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}) {
  const showUndo = editable && !!onUndo && previous != null;
  return (
    <div className="reveal" data-stagger="1" style={{ position: "relative", ...wrapperStyle }}>
      <SectionHeading
        tag={tag}
        editable={editable}
        override={override}
        defaultNode={defaultNode}
        defaultText={defaultText}
        onSave={onSave}
        className={className}
        style={style}
      />
      {showUndo && (
        <button
          onClick={() => onUndo!()}
          title="Deshacer el último cambio"
          style={{ position: "absolute", top: 0, right: 0, fontSize: 11, color: "#9ca3af", background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
        >
          ↶ Deshacer
        </button>
      )}
    </div>
  );
}

/** Input inline para editar un título; guarda al Enter o al perder foco, cancela con Esc. */
function InlineTitleInput({
  initial,
  onSave,
  onCancel,
  className,
  style,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // commit una sola vez (Enter dispara onSave y luego onBlur volvería a dispararlo).
  const commit = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onSave(v.trim());
    else onCancel();
  };
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(true); }
        if (e.key === "Escape") { e.preventDefault(); commit(false); }
      }}
      className={className}
      style={{ ...style, width: "100%", maxWidth: "100%", textAlign: "inherit", background: "transparent", border: "1px dashed currentColor", borderRadius: 8, padding: "4px 10px", outline: "none" }}
    />
  );
}

// TimelineSection vive en ./TimelineSection (D.1.5): la comparte esta landing
// y la página externa propia del cronograma — un solo render client-facing.
