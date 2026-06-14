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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCanvasSections } from "./useCanvasSections";
import KickoffBlock from "./KickoffBlock";
import TimelineSection from "./TimelineSection";
import { useReveal, useHeroParallax } from "./useLandingMotion";
import type {
  KickoffLandingData,
  KickoffSection,
  KickoffTimelineData,
  KickoffPhase,
  RenderableBlock,
} from "@/lib/external/kickoff-view-types";

import { fmtFull } from "@/lib/timeline/weeks";

const MAXW = 760;
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

/** Palabra de acento (italic + azul) dentro de un título display. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{children}</span>;
}

/** Eyebrow + título (con palabra italic) por sección — presentacional, fijo.
 *  Las 6 secciones del canvas Kickoff son conocidas; fallback a section.label. */
const SECTION_META: Record<string, { eyebrow: string; title: ReactNode }> = {
  objetivos:      { eyebrow: "Lo que buscamos", title: <>Objetivos del <Accent>proyecto</Accent></> },
  alcance:        { eyebrow: "El trabajo",      title: <>Alcance: qué <Accent>incluye</Accent></> },
  tu_rol:         { eyebrow: "Tu parte",        title: <>Lo que necesitamos de tu <Accent>equipo</Accent></> },
  metricas_exito: { eyebrow: "La medición",     title: <>Cómo mediremos el <Accent>éxito</Accent></> },
  proximos_pasos: { eyebrow: "El arranque",     title: <><Accent>Próximos</Accent> pasos</> },
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
  addBlock?: (sectionId: string) => void;
  acceptAll?: () => void;
}

/* ── Router: elige modo según props (sin hooks → no viola reglas de hooks) ───── */
type KickoffLandingProps =
  | { data: KickoffLandingData; editable?: false }
  | { projectId: string; canvasId: string; editable?: boolean };

export default function KickoffLanding(props: KickoffLandingProps) {
  if ("data" in props) {
    // Modo EXTERNO: data ya resuelta server-side, read-only.
    return <KickoffLandingView sections={props.data.sections} timeline={props.data.timeline} clientLogoUrl={props.data.clientLogoUrl} editable={false} />;
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
  const {
    sections,
    loading,
    draftCount,
    acceptBlock,
    deleteBlock,
    saveBlock,
    regenerateBlock,
    addBlock,
    acceptAll,
    error,
    clearError,
  } = useCanvasSections(projectId, canvasId);

  const [timeline, setTimeline] = useState<KickoffTimelineData | null>(null);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);

  // Logo del cliente: mismo chip que la vista externa, también en el preview
  // interno (así el CSE lo ve sin tener que publicar). Endpoint guarded.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/client-logo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setClientLogoUrl(d?.logoUrl ?? null))
      .catch(() => setClientLogoUrl(null));
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
      clientLogoUrl={clientLogoUrl}
      draftCount={draftCount}
      error={error}
      clearError={clearError}
      saveBlock={saveBlock}
      regenerateBlock={regenerateBlock}
      acceptBlock={acceptBlock}
      deleteBlock={deleteBlock}
      addBlock={addBlock}
      acceptAll={acceptAll}
    />
  );
}

/* ── View presentacional: recibe data + handlers opcionales; cero data-fetching ─ */
function KickoffLandingView({
  sections,
  timeline,
  editable,
  clientLogoUrl = null,
  draftCount = 0,
  error = null,
  clearError,
  saveBlock,
  regenerateBlock,
  acceptBlock,
  deleteBlock,
  addBlock,
  acceptAll,
}: {
  sections: KickoffSection[];
  timeline: KickoffTimelineData | null;
  editable: boolean;
  /** Logo del cliente (solo modo externo); en interno va ausente → null. */
  clientLogoUrl?: string | null;
} & LandingHandlers) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useReveal(rootRef, [sections.length, timeline?.phases.length, editable]);
  useHeroParallax(heroRef);

  const hero = sections.find((s) => s.key === "bienvenida");
  const body = sections.filter((s) => s.key !== "bienvenida");
  const hasProximos = body.some((s) => s.key === "proximos_pasos");

  const phases = timeline?.phases ?? [];
  const totalWeeks = phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);
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
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="section-dark hero-backdrop" style={{ padding: "clamp(56px, 8vw, 96px) 24px clamp(48px, 6vw, 72px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          {clientLogoUrl && (
            <div className="reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
              {/* Chip blanco para contraste sobre el hero oscuro */}
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 16, padding: "14px 20px", boxShadow: "0 10px 30px rgba(0,0,0,0.22)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={clientLogoUrl} alt="" style={{ height: 46, width: "auto", maxWidth: 220, objectFit: "contain", display: "block" }} />
              </span>
            </div>
          )}
          <span className="eyebrow reveal">Kickoff del proyecto</span>
          <h1 className="font-display display-italic display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.06, color: "var(--dark-text)", marginTop: 16 }}>
            ¡Arranquemos juntos!
          </h1>
          {hero && hero.blocks.length > 0 && (
            <div className="reveal" data-stagger="2" style={{ marginTop: 18, maxWidth: 600, marginInline: "auto", fontSize: 17 }}>
              {hero.blocks.map((b) => (
                <KickoffBlock
                  key={b.id}
                  block={b}
                  editable={editable}
                  invert
                  onSave={saveBlock ? (u) => saveBlock(hero.id, b.id, u) : undefined}
                  onRegenerate={regenerateBlock ? (instr, base) => regenerateBlock(hero.id, b.id, instr, base) : undefined}
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
            {section.key === "proximos_pasos" && <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />}
            <section className={bg} style={{ padding: SECTION_PAD }}>
              <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
                <span className="eyebrow reveal">{SECTION_META[section.key]?.eyebrow ?? "Sección"}</span>
                <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
                  {SECTION_META[section.key]?.title ?? section.label}
                </h2>
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
                    />
                  ))}
                  {editable && addBlock && <AddBlock onClick={() => addBlock(section.id)} />}
                </div>
              </div>
            </section>
          </div>
        );
      })}

      {/* Si no hay sección "Próximos pasos", el cronograma va antes del cierre */}
      {!hasProximos && <TimelineSection phases={phases} anchor={timeline?.anchorStartDate ?? null} />}

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

function BlockRow({
  block,
  editable,
  onSave,
  onRegenerate,
  onAccept,
  onDelete,
}: {
  block: RenderableBlock;
  editable: boolean;
  onSave?: (u: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  onRegenerate?: (instruction: string, base?: { content?: string | null; data?: unknown }) => Promise<{ content?: string | null; data?: unknown } | null>;
  onAccept?: () => void;
  onDelete?: () => void;
}) {
  const isDraft = block.status === "DRAFT";
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
          {isDraft && <IconBtn title="Aceptar" color="#16a34a" onClick={() => onAccept?.()} path="M5 13l4 4L19 7" />}
          <IconBtn title="Eliminar bloque" color="#dc2626" onClick={() => onDelete?.()} path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </div>
      )}
      <KickoffBlock block={block} editable={editable} onSave={onSave} onRegenerate={onRegenerate} />
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

// TimelineSection vive en ./TimelineSection (D.1.5): la comparte esta landing
// y la página externa propia del cronograma — un solo render client-facing.
