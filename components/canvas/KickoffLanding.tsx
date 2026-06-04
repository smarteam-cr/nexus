"use client";

/**
 * components/canvas/KickoffLanding.tsx
 *
 * Render tipo LANDING del canvas "Kickoff" (Camino C), con el design system de
 * las landings de Smarteam (clases scopeadas bajo `.kickoff-landing` en
 * app/kickoff-landing.css). Componente PRESENTACIONAL reutilizable:
 *   - Fase A (interno): se monta en ProjectCanvasPanel con `editable` → el CSE
 *     revisa/acepta/edita los bloques in-situ (mismos endpoints vía useCanvasSections).
 *   - Fase C (externo): la misma plantilla con `editable={false}` en ruta pública.
 *
 * El CRONOGRAMA se lee directo de ProjectTimeline (GET /api/projects/[id]/timeline);
 * el agente NO lo regenera → fuente única.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCanvasSections } from "./useCanvasSections";
import type { BlockData } from "./BlockRenderer";
import KickoffBlock from "./KickoffBlock";
import { useReveal, useHeroParallax } from "./useLandingMotion";

interface Phase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  source: string;
}
interface TimelineData {
  exists: boolean;
  anchorStartDate: string | null;
  phases: Phase[];
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function addWeeks(iso: string, w: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + w * 7);
  return d;
}
function fmtDay(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** Pluralización simple: plural(1,"sesión","sesiones") → "1 sesión". */
function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

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

export default function KickoffLanding({
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
    addBlock,
    acceptAll,
    error,
    clearError,
  } = useCanvasSections(projectId, canvasId);

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setTimeline(
          d && d.exists
            ? { exists: true, anchorStartDate: d.anchorStartDate ?? null, phases: d.phases ?? [] }
            : { exists: false, anchorStartDate: null, phases: [] },
        );
      })
      .catch(() => setTimeline({ exists: false, anchorStartDate: null, phases: [] }));
  }, [projectId]);

  useReveal(rootRef, [loading, sections.length, timeline?.phases.length, editable]);
  useHeroParallax(heroRef);

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
          <button onClick={clearError} title="Cerrar" style={{ color: "#b91c1c", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="section-dark hero-backdrop" style={{ padding: "clamp(56px, 8vw, 96px) 24px clamp(48px, 6vw, 72px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <span className="eyebrow reveal">Kickoff del proyecto</span>
          <h1 className="font-display display-italic display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.06, color: "var(--dark-text)", marginTop: 16 }}>
            ¡Arranquemos juntos!
          </h1>
          {hero && hero.blocks.length > 0 && (
            <div className="reveal" data-stagger="2" style={{ marginTop: 18, maxWidth: 600, marginInline: "auto", fontSize: 17 }}>
              {hero.blocks.map((b) => (
                <KickoffBlock key={b.id} block={b} editable={editable} invert onSave={(u) => saveBlock(hero.id, b.id, u)} />
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
          {editable && draftCount > 0 && (
            <div className="reveal" style={{ marginTop: 30, display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid var(--dark-border-strong)" }}>
              <span style={{ color: "var(--dark-text-secondary)", fontSize: 13 }}>
                {draftCount} {draftCount === 1 ? "bloque" : "bloques"} sin revisar del agente
              </span>
              <button onClick={acceptAll} className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}>
                Aceptar todo
              </button>
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
                      onSave={(u) => saveBlock(section.id, block.id, u)}
                      onAccept={() => acceptBlock(section.id, block.id)}
                      onDelete={() => deleteBlock(section.id, block.id)}
                    />
                  ))}
                  {editable && <AddBlock onClick={() => addBlock(section.id)} />}
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
  onAccept,
  onDelete,
}: {
  block: BlockData;
  editable: boolean;
  onSave: (u: { content?: string; data?: unknown }) => void | boolean | Promise<void | boolean>;
  onAccept: () => void;
  onDelete: () => void;
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
          {isDraft && <IconBtn title="Aceptar" color="#16a34a" onClick={onAccept} path="M5 13l4 4L19 7" />}
          <IconBtn title="Eliminar bloque" color="#dc2626" onClick={onDelete} path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </div>
      )}
      <KickoffBlock block={block} editable={editable} onSave={onSave} />
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

function TimelineSection({ phases, anchor }: { phases: Phase[]; anchor: string | null }) {
  if (!phases.length) return null;
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  let cum = 0;
  const rows = sorted.map((p) => {
    const start = cum;
    cum += p.durationWeeks || 1;
    return { p, start, end: cum };
  });

  return (
    <section className="section-light" style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto" }}>
        <span className="eyebrow reveal">Hoja de ruta</span>
        <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
          Cronograma del <Accent>proyecto</Accent>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(({ p, start, end }, i) => {
            const range = anchor
              ? `${fmtDay(addWeeks(anchor, start))} – ${fmtDay(addWeeks(anchor, end))}`
              : `Semana ${start + 1}${end > start + 1 ? `–${end}` : ""}`;
            return (
              <div key={p.id} className="card reveal" data-stagger={Math.min(5, i + 1)} style={{ display: "flex", gap: 18, alignItems: "baseline", padding: "18px 22px" }}>
                <div className="font-display" style={{ color: "var(--brand-blue)", fontSize: 26, lineHeight: 1, flexShrink: 0, minWidth: 34 }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-display" style={{ color: "var(--text)", fontSize: 17, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {range}
                    {p.durationWeeks ? ` · ${plural(p.durationWeeks, "semana", "semanas")}` : ""}
                    {p.sessionCount ? ` · ${plural(p.sessionCount, "sesión", "sesiones")}` : ""}
                  </div>
                  {p.notes?.trim() && <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>{p.notes}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
