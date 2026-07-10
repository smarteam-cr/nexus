"use client";

/**
 * components/landing/sections.tsx
 *
 * Componentes de SECCIÓN del business case, alineados al spec de 9 secciones
 * (HubSpot). Cada uno es vista (modo lectura, pulido) y editor inline (modo
 * `editable`): los textos se vuelven contentEditable y los arrays ganan agregar/
 * quitar. Branded Smarteam; estilos en app/landing-engine.css (scope .stl, hex
 * literal → theme-safe en el render externo).
 */
import { useEffect, useRef, useState, type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { HeroUploadButtons, BrandRow, TagRow } from "./hero-parts";
import { landingLang, t } from "./i18n";
import type {
  SectionProps,
  HeroData,
  PainData,
  BeforeAfterData,
  SolutionData,
  RoiData,
  PlanData,
  InvestmentData,
  InvestmentLine,
  PartnerData,
  CtaData,
} from "./types";

// ── Íconos ───────────────────────────────────────────────────────────────────
const IconAlert = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);
const IconClock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
  </svg>
);
const IconChart = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6m4 6V5m4 14v-9M5 21h14" />
  </svg>
);
const IconLink = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3m-1.9-5.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 5" />
  </svg>
);
const PAIN_ICONS = [IconAlert, IconClock, IconChart, IconLink];

// Sub-componentes reutilizables ───────────────────────────────────────────────

/** Card rotulada con un solo texto editable (solución / partner). */
function TextCard({
  label, value, editable, onCommit, placeholder,
}: { label: string; value: string; editable?: boolean; onCommit: (v: string) => void; placeholder: string }) {
  return (
    <div className="stl-field-card">
      <div className="stl-field-label">{label}</div>
      <Editable as="div" className="stl-field-value" editable={editable} value={value ?? ""} placeholder={placeholder} onCommit={onCommit} />
    </div>
  );
}

// ── 1) Hero ──────────────────────────────────────────────────────────────────
// Compuesto con las primitivas COMPARTIDAS de `hero-parts.tsx` (las mismas que usa
// el hero del Kickoff). Layout del BC: left-aligned, sin eyebrow ni stats.
export const HeroSection: FC<SectionProps<HeroData>> = ({ data, ctx, editable, onChange }) => {
  const tags = data.tags ?? [];
  const set = (next: Partial<HeroData>) => onChange?.({ ...data, ...next });
  return (
    <div style={{ maxWidth: 900 }}>
      {editable && (
        <HeroUploadButtons ctx={ctx} coverImageUrl={data.coverImageUrl} onCover={(url) => set({ coverImageUrl: url })} />
      )}
      <BrandRow brands={data.brands} ctx={ctx} editable={editable} onChange={(next) => set({ brands: next })} />
      <Editable as="h1" className="stl-hero-title" editable={editable} value={data.headline}
        placeholder="[Verbo de transformación] la [operación / proceso] de [cliente]…" onCommit={(v) => set({ headline: v })} />
      <Editable as="p" className="stl-lead" editable={editable} value={data.subhead}
        placeholder="Una frase que resume el dolor central y la apuesta…" onCommit={(v) => set({ subhead: v })} />
      <TagRow tags={tags} editable={editable} onChange={(next) => set({ tags: next })} />
    </div>
  );
};

// ── 2) Diagnóstico — los puntos de dolor reales ──────────────────────────────
export const PainSection: FC<SectionProps<PainData>> = ({ data, editable, onChange }) => {
  const items = data.items ?? [];
  const set = (next: Partial<PainData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-4">{nodes}</div>}>
        {(it, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            <div className="stl-card-icon" style={{ background: "rgba(245,158,11,0.10)", color: "#D97706" }}>{PAIN_ICONS[i % PAIN_ICONS.length]}</div>
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
              placeholder="Nombre del dolor…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={it.detail}
              placeholder="Descripción en 1-2 líneas (impacto medible si se mencionó)…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar dolor" onClick={() => set({ items: appendItem(items, { title: "", detail: "" }) })} />}
    </>
  );
};

// ── 3) Antes vs. después — dos columnas ──────────────────────────────────────
export const BeforeAfterSection: FC<SectionProps<BeforeAfterData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const before = data.before ?? [];
  const after = data.after ?? [];
  const set = (next: Partial<BeforeAfterData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-ba">
      <div className="stl-ba-now">
        <div className="stl-ba-head">{t(lang, "hoy")}</div>
        <SortableItems items={before} disabled={!editable} onReorder={(next) => set({ before: next })}
          container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
          {(b, i, handle) => (
            <div className="stl-item stl-ba-li">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ before: removeAt(before, i) })} />}
              <Editable as="span" editable={editable} value={b} placeholder="Proceso manual / herramienta desconectada…"
                onCommit={(v) => set({ before: replaceAt(before, i, v) })} />
            </div>
          )}
        </SortableItems>
        {editable && <AddBtn label="Agregar" onClick={() => set({ before: appendItem(before, "") })} />}
      </div>
      <div className="stl-ba-future">
        <div className="stl-ba-head">{t(lang, "conHubspotSmarteam")}</div>
        <SortableItems items={after} disabled={!editable} onReorder={(next) => set({ after: next })}
          container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
          {(a, i, handle) => (
            <div className="stl-item stl-ba-li">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ after: removeAt(after, i) })} />}
              <Editable as="span" editable={editable} value={a} placeholder="Qué queda automatizado / conectado…"
                onCommit={(v) => set({ after: replaceAt(after, i, v) })} />
            </div>
          )}
        </SortableItems>
        {editable && <AddBtn label="Agregar" onClick={() => set({ after: appendItem(after, "") })} />}
      </div>
    </div>
  );
};

// ── 4) Solución — qué se implementa (4 campos) ───────────────────────────────
export const SolutionSection: FC<SectionProps<SolutionData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const set = (next: Partial<SolutionData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-grid stl-grid-2">
      <TextCard label={t(lang, "hubsIncluidos")} value={data.hubs} editable={editable} placeholder="Sales / Marketing / Service / Data Hub…" onCommit={(v) => set({ hubs: v })} />
      <TextCard label={t(lang, "integracionesClave")} value={data.integraciones} editable={editable} placeholder="ERP / WhatsApp / sistema mencionado…" onCommit={(v) => set({ integraciones: v })} />
      <TextCard label={t(lang, "casosDeUsoPrincipales")} value={data.casosDeUso} editable={editable} placeholder="Pipeline / seguimiento / automatización / reportería…" onCommit={(v) => set({ casosDeUso: v })} />
      <TextCard label={t(lang, "usuariosAfectados")} value={data.usuarios} editable={editable} placeholder="Roles: vendedores, gerencia, CS…" onCommit={(v) => set({ usuarios: v })} />
    </div>
  );
};

// ── 5) ROI — números que respaldan la decisión ───────────────────────────────
export const RoiSection: FC<SectionProps<RoiData>> = ({ data, editable, onChange }) => {
  const metrics = data.metrics ?? [];
  const set = (next: Partial<RoiData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <SortableItems items={metrics} disabled={!editable} onReorder={(next) => set({ metrics: next })}
        container={(nodes) => <div className="stl-grid stl-grid-4">{nodes}</div>}>
        {(m, i, handle) => (
          <div className="stl-item stl-metric">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ metrics: removeAt(metrics, i) })} />}
            <Editable as="div" className="stl-metric-value" editable={editable} value={m.value}
              placeholder="[X]%" onCommit={(v) => set({ metrics: replaceAt(metrics, i, { ...m, value: v }) })} />
            <Editable as="div" className="stl-metric-label" editable={editable} value={m.label}
              placeholder="reducción en [proceso]…" onCommit={(v) => set({ metrics: replaceAt(metrics, i, { ...m, label: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar métrica" onClick={() => set({ metrics: appendItem(metrics, { value: "", label: "" }) })} />}
    </>
  );
};

// ── 6) Timeline — plan de implementación ─────────────────────────────────────
export const PlanSection: FC<SectionProps<PlanData>> = ({ data, editable, onChange }) => {
  const phases = data.phases ?? [];
  const set = (next: Partial<PlanData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <SortableItems items={phases} disabled={!editable} onReorder={(next) => set({ phases: next })}
        container={(nodes) => <div>{nodes}</div>}>
        {(p, i, handle) => (
          <div className="stl-item stl-phase">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ phases: removeAt(phases, i) })} />}
            <div className="stl-phase-num">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <Editable as="div" className="stl-phase-name" editable={editable} value={p.name}
                placeholder="Nombre de la fase…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, name: v }) })} />
              <Editable as="div" className="stl-phase-duration" editable={editable} value={p.duration}
                placeholder="Semanas 1-2…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, duration: v }) })} />
              <Editable as="p" className="stl-body" editable={editable} value={p.detail}
                placeholder="Qué pasa en esta fase…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, detail: v }) })} />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar fase" onClick={() => set({ phases: appendItem(phases, { name: "", detail: "", duration: "" }) })} />}
    </>
  );
};

// ── 7) Inversión — licencias + servicios (2 cards) ───────────────────────────
function InvestCard({
  label, line, editable, onChange, montoPh, detallePh,
}: { label: string; line: InvestmentLine; editable?: boolean; onChange: (l: InvestmentLine) => void; montoPh: string; detallePh: string }) {
  return (
    <div className="stl-field-card">
      <div className="stl-field-label">{label}</div>
      <Editable as="div" className="stl-invest-amount" editable={editable} value={line?.monto ?? ""} placeholder={montoPh} onCommit={(v) => onChange({ ...line, monto: v })} />
      <Editable as="div" className="stl-field-value" editable={editable} value={line?.detalle ?? ""} placeholder={detallePh} onCommit={(v) => onChange({ ...line, detalle: v })} />
    </div>
  );
}
export const InvestmentSection: FC<SectionProps<InvestmentData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const lic = data.licenciasHubspot ?? { monto: "", detalle: "" };
  const impl = data.implementacion ?? { monto: "", detalle: "" };
  const set = (next: Partial<InvestmentData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        <InvestCard label={t(lang, "licenciasHubspot")} line={lic} editable={editable} montoPh="[Monto o rango]" detallePh="Hubs × usuarios × descuento si aplica" onChange={(v) => set({ licenciasHubspot: v })} />
        <InvestCard label={t(lang, "implementacionSmarteam")} line={impl} editable={editable} montoPh="[Monto o rango]" detallePh="Set up + onboarding + integraciones" onChange={(v) => set({ implementacion: v })} />
      </div>
      <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""}
        placeholder="Si no hay precio en el transcript → 'A definir en propuesta formal'…" onCommit={(v) => set({ nota: v })} />
    </>
  );
};

// ── 8) Partner — por qué Smarteam (4 campos) ─────────────────────────────────
export const PartnerSection: FC<SectionProps<PartnerData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const set = (next: Partial<PartnerData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-grid stl-grid-2">
      <TextCard label={t(lang, "credencial")} value={data.credencial} editable={editable} placeholder="HubSpot Partner Elite" onCommit={(v) => set({ credencial: v })} />
      <TextCard label={t(lang, "experiencia")} value={data.experiencia} editable={editable} placeholder="+200 proyectos, +8 países LATAM" onCommit={(v) => set({ experiencia: v })} />
      <TextCard label={t(lang, "referenciaSectorial")} value={data.referenciaSectorial} editable={editable} placeholder="Cliente de referencia en industria similar…" onCommit={(v) => set({ referenciaSectorial: v })} />
      <TextCard label={t(lang, "equipoAsignado")} value={data.equipo} editable={editable} placeholder="Nombres del equipo si se mencionaron…" onCommit={(v) => set({ equipo: v })} />
    </div>
  );
};

/** Sin esquema (el CSE pegó "smarteamcr.com/contacto" en vez de una URL completa),
 *  el <a href> se resuelve RELATIVO a la página actual → termina en
 *  ".../external/smarteamcr.com/contacto". Antepone "https://" salvo que ya traiga
 *  un esquema (http/https/mailto/tel/...), sea protocol-relative ("//") o una ruta
 *  interna intencional ("/algo"). */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  // Whitelist de esquemas (no "cualquier palabra:") — un genérico [a-z][a-z0-9+.-]*:
  // también matchearía "localhost:3004/x" o "cliente:8080/ruta" (host:puerto sin
  // protocolo) y los dejaría igual de rotos (relativos) que el bug original.
  if (!v || /^(https?:|mailto:|tel:|\/\/|\/)/i.test(v)) return v;
  return `https://${v}`;
}

/** Botón del CTA en LECTURA: con `buttonUrl` navega (pestaña nueva por default,
 *  misma pestaña con `target="_self"`); sin URL, span. Normaliza defensivamente
 *  (dato ya guardado sin esquema, de antes del fix). */
export function CtaButton({
  label, url, target, style,
}: { label?: string; url?: string; target?: string; style?: React.CSSProperties }) {
  if (!label) return null;
  const href = url ? normalizeUrl(url) : "";
  if (href) {
    const self = target === "_self";
    return (
      <a className="stl-btn" style={style} href={href} target={self ? undefined : "_blank"}
        rel={self ? undefined : "noopener noreferrer"}>
        {label}
      </a>
    );
  }
  return <span className="stl-btn" style={style}>{label}</span>;
}

/** Input de texto que comitea en blur / Enter (como `Editable`), para los popovers
 *  de edición. Estado local para no re-guardar en cada tecla. */
function PopInput({
  value, placeholder, onCommit, style,
}: { value: string; placeholder: string; onCommit: (v: string) => void; style?: React.CSSProperties }) {
  const [v, setV] = useState(value);
  // Re-sincronizar con la prop cuando cambia por afuera, SIN efecto (patrón oficial de
  // "ajustar estado durante el render"): un useEffect acá dispara `set-state-in-effect`
  // y además pinta un frame con el valor viejo.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setV(value);
  }
  return (
    <input
      type="text"
      value={v}
      placeholder={placeholder}
      style={style}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

/** Editor del CTA (solo modo edición): el botón se ve como el real; al hacerle CLIC
 *  se abre un popover con el TEXTO, la URL y en qué pestaña abre. Clic afuera / Esc
 *  cierra. `buttonUrl`/`buttonTarget` viven fuera del schema del agente (el CSE los
 *  configura; sobreviven regeneraciones por carry-forward de keys no-schema). */
export function CtaEditor({
  label, url, target, labelPlaceholder, onLabel, onUrl, onTarget, style, wrapStyle,
}: {
  label?: string;
  url?: string;
  target?: string;
  labelPlaceholder: string;
  onLabel: (v: string) => void;
  onUrl: (v: string) => void;
  onTarget: (v: string) => void;
  /** Estilo del disparador — para superficies con su propio botón (pill teal del kickoff). */
  style?: React.CSSProperties;
  /** Estilo del contenedor (por defecto `marginTop: 26`, el del CTA del Business Case). */
  wrapStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    /**
     * Cerrar el popover DESMONTA sus inputs, y un input que se desmonta NO dispara
     * `blur` — que es donde `PopInput` comitea. Sin este `blur()` explícito, escribir
     * el enlace y cerrar con un clic afuera perdía el valor EN SILENCIO (el texto del
     * botón sobrevivía solo porque el CSE hacía blur al tocar otro campo del popover).
     * Blur ANTES de cerrar: el commit corre sincrónicamente y recién después desmonta.
     */
    const commitFocused = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && wrapRef.current?.contains(el)) el.blur();
    };
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        commitFocused();
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { commitFocused(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSelf = target === "_self";
  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.14)", fontSize: 13, color: "#1f2937", background: "#fff",
  };
  const fieldLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280",
  };
  const pill = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? "#168CF6" : "rgba(0,0,0,0.14)"}`,
    background: active ? "rgba(22,140,246,0.10)" : "#fff",
    color: active ? "#168CF6" : "#6b7280",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block", marginTop: 26, ...wrapStyle }}>
      <button type="button" className="stl-btn" onClick={() => setOpen((o) => !o)}
        title="Editar botón (texto, enlace, destino)" style={{ ...style, cursor: "pointer" }}>
        {label ? label : <span style={{ opacity: 0.6 }}>{labelPlaceholder}</span>}
        <span aria-hidden style={{ marginLeft: 8, opacity: 0.7, fontSize: "0.85em" }}>✎</span>
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            // Flota HACIA ARRIBA (anclado por `bottom`) para no empujar el scroll
            // de la landing hacia abajo al abrirlo (el CTA suele ir al final).
            position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
            zIndex: 30, width: 288, maxWidth: "88vw", background: "#fff", borderRadius: 12, padding: 14,
            border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 -12px 34px rgba(0,0,0,0.22)",
            textAlign: "left", display: "flex", flexDirection: "column", gap: 12, cursor: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={fieldLabel}>Texto del botón</span>
            <PopInput value={label ?? ""} placeholder={labelPlaceholder} onCommit={onLabel} style={field} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={fieldLabel}>Enlace (URL)</span>
            <PopInput value={url ?? ""} placeholder="https://… (vacío = sin link)" onCommit={(v) => onUrl(normalizeUrl(v))} style={field} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={fieldLabel}>Abre en</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={pill(!isSelf)} onClick={() => onTarget("_blank")}>Pestaña nueva</button>
              <button type="button" style={pill(isSelf)} onClick={() => onTarget("_self")}>Misma pestaña</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 9) CTA final ─────────────────────────────────────────────────────────────
export const CtaSection: FC<SectionProps<CtaData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<CtaData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-cta-wrap">
      <Editable as="h2" className="stl-hero-title" editable={editable} value={data.headline}
        placeholder="Estamos listos para iniciar con [cliente]…" onCommit={(v) => set({ headline: v })} />
      <Editable as="p" className="stl-lead" editable={editable} value={data.subhead}
        placeholder="Frase de cierre que retoma el dolor y la apuesta…" onCommit={(v) => set({ subhead: v })} />
      {editable ? (
        <CtaEditor label={data.buttonLabel} url={data.buttonUrl} target={data.buttonTarget}
          labelPlaceholder="Agendar siguiente paso…"
          onLabel={(v) => set({ buttonLabel: v })}
          onUrl={(v) => set({ buttonUrl: v })} onTarget={(v) => set({ buttonTarget: v })} />
      ) : (
        <CtaButton label={data.buttonLabel} url={data.buttonUrl} target={data.buttonTarget} />
      )}
    </div>
  );
};
