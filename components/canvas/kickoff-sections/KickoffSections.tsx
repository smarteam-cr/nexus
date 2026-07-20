"use client";

/**
 * components/canvas/kickoff-sections/KickoffSections.tsx
 *
 * Componentes de sección del Kickoff sobre el motor `LandingView` (SectionProps):
 *  - KickoffHeroSection  — bienvenida (selfTitled, backdrop): logos + título + intro + stats del timeline.
 *  - KickoffProseSection — objetivos/alcance/tu_rol/metricas_exito/proximos_pasos (data tipada).
 *  - KickoffTimelineSection — cronograma (ctxDriven): envuelve TimelineSection desde ctx.kickoff.timeline.
 *  - KickoffProcesosSection — procesos (ctxDriven): flowcharts desde ctx.kickoff.procesos.
 *  - KickoffCtaSection   — cierre estático (bookend del hero).
 *
 * TOLERANCIA A DATA LEGACY: los kickoffs viejos guardan prosa como markdown en
 * `content`; el adaptador lo inyecta como `data.__legacyMd`. Si la data tipada está
 * vacía y hay markdown, se renderiza con <Prose> (así los 133 y los snapshots
 * publicados se ven igual que hoy, sin migrar).
 *
 * Render bajo `.stl` (landing-engine.css) — desde la Ola 6 el vocabulario ex
 * `kl-*` (prose/compare/pair/edit) vive portado ahí y el wrapper legacy
 * `.kickoff-landing` ya no envuelve al motor. La ÚNICA pieza que aún lo necesita
 * es TimelineSection (archivo de la otra PC): KickoffTimelineSection la envuelve
 * en su propio `<div className="kickoff-landing">` (scope mínimo del CSS viejo).
 */
import { type FC } from "react";
import dynamic from "next/dynamic";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "@/components/landing/inline";
import { SortableItems } from "@/components/landing/sortable";
import { HeroUploadButtons, BrandRow, TagRow } from "@/components/landing/hero-parts";
import { CtaEditor, CtaButton } from "@/components/landing/sections";
import type { SectionProps } from "@/components/landing/types";
import { Prose, InlineMD } from "@/components/landing/prose";
import TimelineSection from "@/components/canvas/TimelineSection";
import { timelineSpan, fmtFull } from "@/lib/timeline/weeks";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";
import type { KickoffProceso } from "@/lib/external/kickoff-view-types";
import {
  normalizeProse,
  proseIsEmpty,
  normalizeHero,
  normalizeCompara,
  normalizeCta,
  ctaHref,
  type ProseData,
  type ProseComparison,
  type KickoffHeroData,
  type ComparaData,
  type CtaData,
} from "./types";

const FlowchartViewer = dynamic(() => import("@/components/flowchart/FlowchartViewer"), {
  ssr: false,
  loading: () => <div className="skeleton-shimmer" style={{ height: 440, borderRadius: 12 }} />,
});

function toFlowchartData(p: KickoffProceso): FlowchartData {
  const d = (p.data ?? {}) as { nodes?: unknown[]; edges?: unknown[]; description?: string };
  return {
    title: p.title ?? undefined,
    description: d.description,
    nodes: (d.nodes ?? []) as FlowchartData["nodes"],
    edges: (d.edges ?? []) as FlowchartData["edges"],
  };
}

/** Comparación "Hoy vs con el sistema" (display; el agente la llena). */
function ComparaBlock({ c }: { c: ProseComparison }) {
  return (
    <div className="stl-pair" style={{ marginTop: 4 }}>
      <div className="stl-compare-now">
        <div className="stl-compare-label">Hoy</div>
        <ul className="stl-compare-list">
          {c.hoy.map((x, i) => <li key={i}><InlineMD>{x}</InlineMD></li>)}
        </ul>
      </div>
      <div className="stl-compare-future">
        <div className="stl-compare-label">Con el sistema</div>
        <ul className="stl-compare-list">
          {c.conSistema.map((x, i) => <li key={i}><InlineMD>{x}</InlineMD></li>)}
        </ul>
      </div>
    </div>
  );
}

/** Aviso de sección heredada (bloque TEXT markdown, aún sin migrar a data tipada). */
function LegacyNote() {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-soft)", border: "1px dashed var(--border-strong)", borderRadius: 8, padding: "6px 10px" }}>
      Contenido heredado. Para editarlo por campos, regenerá el kickoff con IA (la edición por campos llega cuando el agente tipado lo regenera).
    </div>
  );
}

// ── Prosa ──────────────────────────────────────────────────────────────────────
export const KickoffProseSection: FC<SectionProps<ProseData>> = ({ data, editable, onChange }) => {
  const d = normalizeProse(data);
  // Sección LEGACY (bloque TEXT markdown, sin CARD tipado): read-only. La edición
  // tipada recién aplica cuando el bloque es CARD (curadas o regeneradas por el agente).
  if (d.__legacyMd) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {editable && <LegacyNote />}
        <Prose content={d.__legacyMd} />
      </div>
    );
  }

  const set = (next: Partial<ProseData>) => onChange?.({ ...d, ...next });
  const items = d.items;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(editable || d.intro) && (
        <Editable
          as="p"
          className="stl-prose"
          editable={editable}
          value={d.intro ?? ""}
          placeholder="Intro (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}
      <SortableItems
        items={items}
        disabled={!editable}
        onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}
      >
        {(it, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            <Editable
              as="h3"
              editable={editable}
              value={it.title}
              placeholder="Título…"
              onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })}
            />
            <Editable
              as="p"
              editable={editable}
              value={it.detail ?? ""}
              placeholder="Detalle (opcional)…"
              onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })}
            />
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn onClick={() => set({ items: appendItem(items, { title: "", detail: "" }) })} label="Agregar punto" />
      )}
      {d.compara && <ComparaBlock c={d.compara} />}
      {!editable && proseIsEmpty(d) && <p className="stl-prose" style={{ color: "var(--text-muted)" }}>—</p>}
    </div>
  );
};

// ── Hero (bienvenida) ────────────────────────────────────────────────────────
// Compuesto con las MISMAS primitivas que el hero del Business Case
// (`components/landing/hero-parts.tsx`): portada, logo del cliente, brand-row
// arrastrable y chips de tags. Diferencias del kickoff: centrado, con eyebrow, y
// con 3 stats DERIVADOS del cronograma (no editables — fuente única: ProjectTimeline).
export const KickoffHeroSection: FC<SectionProps<KickoffHeroData>> = ({ data, ctx, editable, onChange }) => {
  const d = normalizeHero(data);
  const isLegacy = !!d.__legacyMd;
  const canEdit = !!editable && !isLegacy; // legacy = read-only hasta regenerar
  const set = (next: Partial<KickoffHeroData>) => {
    const { __legacyMd: _omit, intro: _intro, ...clean } = d;
    void _omit;
    void _intro; // al guardar migramos `intro` → `subhead` (no lo re-escribimos)
    onChange?.({ ...clean, ...next });
  };

  const phases = ctx.kickoff?.timeline?.phases ?? [];
  const totalWeeks = timelineSpan(phases);
  const startLabel = ctx.kickoff?.timeline?.anchorStartDate ? fmtFull(ctx.kickoff.timeline.anchorStartDate) : "Por definir";

  const eyebrow = d.eyebrow?.trim() || "Kickoff del proyecto";
  const headline = d.headline?.trim() || "¡Arranquemos juntos!";

  return (
    <div className="stl-hero-centered" style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <HeroUploadButtons ctx={ctx} coverImageUrl={d.coverImageUrl} onCover={(url) => set({ coverImageUrl: url })} />
        </div>
      )}
      <BrandRow brands={d.brands} ctx={ctx} editable={canEdit} onChange={(next) => set({ brands: next })} />
      {canEdit ? (
        <Editable as="span" className="eyebrow" editable value={d.eyebrow ?? ""} placeholder="Kickoff del proyecto" onCommit={(v) => set({ eyebrow: v })} />
      ) : (
        <span className="eyebrow">{eyebrow}</span>
      )}
      {canEdit ? (
        <Editable
          as="h1"
          className="stl-hero-title"
          editable
          value={d.headline}
          placeholder="Inicio de proyecto: implementación de HubSpot e integración con…"
          onCommit={(v) => set({ headline: v })}
        />
      ) : (
        <h1 className="stl-hero-title">{headline}</h1>
      )}
      {isLegacy ? (
        <div style={{ marginTop: 18, maxWidth: 640, marginInline: "auto", textAlign: "left", display: "flex", flexDirection: "column", gap: 10 }}>
          {editable && <LegacyNote />}
          <Prose content={d.__legacyMd ?? ""} />
        </div>
      ) : (
        (canEdit || d.subhead) && (
          <div style={{ maxWidth: 640, marginInline: "auto" }}>
            <Editable as="p" className="stl-lead" editable={canEdit} value={d.subhead}
              placeholder="Una frase: qué arranca y qué cambia para el negocio…" onCommit={(v) => set({ subhead: v })} />
          </div>
        )
      )}
      {!isLegacy && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TagRow tags={d.tags} editable={canEdit} onChange={(next) => set({ tags: next })}
            placeholder="Hub / integración / alcance…" />
        </div>
      )}
      {/* Stats DERIVADOS del cronograma — no editables (evita los campos rotos del hero viejo). */}
      {phases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", marginTop: 38 }}>
          <HeroStat value={String(totalWeeks)} unit="semanas" label="Duración total" />
          <HeroStat value={startLabel} label="Arranque" />
          <HeroStat value={String(phases.length)} unit={phases.length === 1 ? "fase" : "fases"} label="Hoja de ruta" />
        </div>
      )}
    </div>
  );
};

// ── Hoy vs Con el sistema (sección propia, editable) ──────────────────────────
export const KickoffComparaSection: FC<SectionProps<ComparaData>> = ({ data, editable, onChange }) => {
  const d = normalizeCompara(data);
  const set = (next: Partial<ComparaData>) => onChange?.({ ...d, ...next });
  const col = (
    which: "hoy" | "conSistema",
    items: string[],
    cls: string,
    label: string,
    placeholder: string,
  ) => (
    <div className={cls}>
      <div className="stl-compare-label">{label}</div>
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ [which]: next })}
        container={(nodes) => <ul className="stl-compare-list">{nodes}</ul>}>
        {(item, i, handle) => (
          <li className="stl-item">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ [which]: removeAt(items, i) })} />}
            <Editable as="span" editable={editable} value={item} placeholder={placeholder}
              onCommit={(v) => set({ [which]: replaceAt(items, i, v) })} />
          </li>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar" onClick={() => set({ [which]: appendItem(items, "") })} />}
    </div>
  );
  const empty = !d.hoy.length && !d.conSistema.length;
  if (!editable && empty) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(editable || d.subhead) && (
        <Editable as="p" className="stl-prose" editable={editable} value={d.subhead ?? ""}
          placeholder="Una frase: de dónde partimos y a dónde llegamos…" onCommit={(v) => set({ subhead: v })} />
      )}
      <div className="stl-pair">
        {col("hoy", d.hoy, "stl-compare-now", "Hoy", "Cómo opera hoy (una línea)…")}
        {col("conSistema", d.conSistema, "stl-compare-future", "Con el sistema", "Cómo va a operar (una línea)…")}
      </div>
    </div>
  );
};

function HeroStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="font-display" style={{ color: "var(--dark-text)", fontSize: 28, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--dark-text-secondary)", marginLeft: 6 }}>{unit}</span>}
      </div>
      <div className="eyebrow" style={{ color: "var(--dark-text-muted)", marginTop: 7, fontSize: 11 }}>{label}</div>
    </div>
  );
}

// Procesos: más ancho que la prosa — los flowcharts necesitan lienzo. Igual al ancho
// del wrap del motor (.stl-wrap ≈ 1040) para alinear con el resto de las secciones.
const PROCESOS_MAXW = 1040;
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

// ── Cronograma (ctxDriven: rinde su propia sección o null) ─────────────────────
// El chrome de edición (ocultar / colapsar / arrastrar) lo pone el MOTOR (LandingView),
// igual que en cualquier otra sección — antes cada una traía su propio `HideWrap`.
export const KickoffTimelineSection: FC<SectionProps<unknown>> = ({ ctx }) => {
  const timeline = ctx.kickoff?.timeline;
  if (!timeline?.exists || (timeline.phases?.length ?? 0) === 0) return null;
  // Scope MÍNIMO del CSS legacy: TimelineSection (archivo caliente de la otra PC)
  // sigue usando las clases base de kickoff-landing.css (section-light, eyebrow,
  // font-display, reveal + vars del root). Este wrapper es lo único que queda del
  // `.kickoff-landing` que antes envolvía al motor entero; se borra en la pasada
  // coordinada que re-tokenice TimelineSection (anotada en DECISIONS).
  return (
    <div className="kickoff-landing">
      <TimelineSection phases={timeline.phases} anchor={timeline.anchorStartDate ?? null} />
    </div>
  );
};

// ── Procesos (ctxDriven: rinde su propia sección o null) ───────────────────────
export const KickoffProcesosSection: FC<SectionProps<unknown>> = ({ ctx, editable }) => {
  const procesos = ctx.kickoff?.procesos ?? [];
  const onStatus = ctx.kickoff?.onProcesoStatusChange;
  if (!procesos.length) return null;
  return (
    <section className="section-soft" style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: PROCESOS_MAXW, margin: "0 auto" }}>
        <span className="eyebrow reveal">Cómo trabajamos</span>
        <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
          Nuestros procesos
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {procesos.map((p) => (
            <div key={p.id} className="reveal">
              {editable && p.status && <ProcesoStatusBar status={p.status} onConfirm={onStatus ? (c) => onStatus(p.id, c) : undefined} />}
              {p.title && <h3 className="font-display" style={{ fontSize: 18, color: "var(--text)", marginBottom: 10 }}>{p.title}</h3>}
              <div style={{ height: "min(72vh, 780px)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg, #fff)" }}>
                <FlowchartViewer data={toFlowchartData(p)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

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
          <button onClick={() => onConfirm(false)} style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Pasar a borrador
          </button>
        ) : (
          <button onClick={() => onConfirm(true)} style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>
            Confirmar para el cliente
          </button>
        ))}
    </div>
  );
}

// ── Cierre / CTA (data-driven: rinde su propia sección dark full-bleed) ─────────
// Como el `cta` del Business Case: el CSE edita titular/subtítulo y configura el
// botón (texto + enlace). En read, el botón se muestra solo si tiene texto y enlace.
const CTA_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, background: "var(--brand-teal, #42E4B3)",
  color: "#0B1426", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: 999,
  textDecoration: "none", boxShadow: "0 10px 30px rgba(66,228,179,0.28)", border: "none", cursor: "pointer",
};
export const KickoffCtaSection: FC<SectionProps<CtaData>> = ({ data, editable, onChange }) => {
  const d = normalizeCta(data);
  // Editable SOLO si hay dónde persistir: si la sección aún no existe (pre-backfill),
  // se muestra en solo-lectura + aviso, para no perder la edición en silencio.
  const canEdit = !!editable && !d.__noSection;
  const set = (next: Partial<CtaData>) => onChange?.({ ...d, __noSection: undefined, ...next });
  const eyebrow = canEdit ? d.eyebrow ?? "" : (d.eyebrow?.trim() || "El siguiente paso");
  const headline = canEdit ? d.headline ?? "" : (d.headline?.trim() || "¡Estamos listos para empezar!");
  const subhead = canEdit ? d.subhead ?? "" : (d.subhead?.trim() || "");
  const href = ctaHref(d.buttonUrl ?? "");
  const showBtn = !!(d.buttonLabel ?? "").trim() && !!href;

  return (
    <section className="section-dark hero-backdrop" style={{ padding: "clamp(52px, 7vw, 84px) 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        {editable && d.__noSection && (
          <div style={{ marginBottom: 20, padding: "8px 14px", fontSize: 12, color: "var(--dark-text-secondary)", background: "rgba(255,255,255,0.06)", border: "1px dashed var(--dark-border-strong, rgba(255,255,255,0.16))", borderRadius: 8, display: "inline-block" }}>
            Este kickoff todavía no tiene la sección de cierre — corré el backfill (o regenerá) para configurar el CTA.
          </div>
        )}
        {canEdit ? (
          <Editable as="span" className="eyebrow reveal" editable value={eyebrow} placeholder="El siguiente paso" onCommit={(v) => set({ eyebrow: v })} />
        ) : (
          <span className="eyebrow reveal">{eyebrow}</span>
        )}
        {canEdit ? (
          <Editable
            as="h2"
            className="cta-title font-display display-italic display-tight reveal"
            editable
            value={headline}
            placeholder="¡Estamos listos para empezar!"
            onCommit={(v) => set({ headline: v })}
          />
        ) : (
          <h2 className="cta-title font-display display-italic display-tight reveal" data-stagger="1">
            {headline}
          </h2>
        )}
        {(canEdit || subhead) && (
          <div className="reveal" data-stagger="2" style={{ marginTop: 16, maxWidth: 560, marginInline: "auto", color: "var(--dark-text-secondary)", fontSize: 16 }}>
            <Editable as="p" editable={canEdit} value={subhead} placeholder="Subtítulo (2 frases): energía para arrancar, sin re-vender." onCommit={(v) => set({ subhead: v })} />
          </div>
        )}

        {/* Botón configurable — MISMO popover que el CTA del Business Case (texto /
            enlace / "Abre en"), con el pill del kickoff como disparador. */}
        {canEdit ? (
          <div className="reveal">
            <CtaEditor
              label={d.buttonLabel}
              url={d.buttonUrl}
              target={d.buttonTarget}
              labelPlaceholder="Agendá la primera sesión…"
              onLabel={(v) => set({ buttonLabel: v })}
              onUrl={(v) => set({ buttonUrl: v })}
              onTarget={(v) => set({ buttonTarget: v })}
              style={CTA_BTN}
              wrapStyle={{ marginTop: 30 }}
            />
            {!showBtn && (
              <p style={{ marginTop: 10, fontSize: 11, color: "var(--dark-text-muted)" }}>
                {(d.buttonLabel ?? "").trim()
                  ? "⚠ Falta el enlace: el cliente todavía NO ve este botón."
                  : "El botón se muestra al cliente cuando completás texto y enlace."}
              </p>
            )}
          </div>
        ) : (
          showBtn && (
            <div className="reveal" data-stagger="3" style={{ marginTop: 30 }}>
              <CtaButton label={d.buttonLabel} url={href} target={d.buttonTarget} style={CTA_BTN} />
            </div>
          )
        )}
      </div>
    </section>
  );
};
