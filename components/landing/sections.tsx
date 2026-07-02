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
import { Fragment, useRef, useState, type FC } from "react";
import { useToast } from "@/components/ui/Toast";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
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

/** Botón "Portada" del hero (solo edición): sube una imagen al endpoint del BC
 *  (`ctx.imageUploadUrl`) y la guarda en `data.coverImageUrl` (fuera del schema del
 *  agente — sobrevive regeneraciones vía carry-forward, patrón `brands`). */
function CoverButton({
  coverImageUrl, uploadUrl, onSet,
}: { coverImageUrl?: string | null; uploadUrl: string; onSet: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff",
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) onSet(body.url);
      else toast.error(body.error ?? "No se pudo subir la imagen.");
    } catch {
      toast.error("No se pudo subir la imagen (error de red).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" style={pill} disabled={busy} onClick={() => inputRef.current?.click()}>
        🖼 {busy ? "Subiendo…" : coverImageUrl ? "Cambiar portada" : "Portada"}
      </button>
      {coverImageUrl && (
        <button type="button" style={{ ...pill, background: "transparent" }} disabled={busy} onClick={() => onSet(null)}>
          ✕ Quitar
        </button>
      )}
    </div>
  );
}

/** Botón "Logo del cliente" (solo edición): sube al endpoint del CLIENTE
 *  (`ctx.clientLogoUploadUrl` → Client.logoUrl) y avisa vía ctx.onClientLogoChange. */
function ClientLogoButton({
  hasLogo, uploadUrl, onChanged,
}: { hasLogo: boolean; uploadUrl: string; onChanged: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff",
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
      if (res.ok && body.logoUrl) onChanged(body.logoUrl);
      else toast.error(body.error ?? "No se pudo subir el logo.");
    } catch {
      toast.error("No se pudo subir el logo (error de red).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" style={pill} disabled={busy} onClick={() => inputRef.current?.click()}>
        ⛭ {busy ? "Subiendo…" : hasLogo ? "Cambiar logo del cliente" : "Logo del cliente"}
      </button>
    </>
  );
}

// ── 1) Hero ──────────────────────────────────────────────────────────────────
export const HeroSection: FC<SectionProps<HeroData>> = ({ data, ctx, editable, onChange }) => {
  const tags = data.tags ?? [];
  const set = (next: Partial<HeroData>) => onChange?.({ ...data, ...next });
  // Brand-row EDITABLE: si el CSE no la tocó (brands vacío) cae a los defaults.
  // Los LOGOS reales (cliente + Smarteam de la config global) van como imagen;
  // los defaults de texto solo cubren lo que no tiene logo.
  const hasLogo = !!ctx.clientLogoUrl;
  const hasSmarteamLogo = !!ctx.smarteamLogoUrl;
  const brands =
    data.brands && data.brands.length
      ? data.brands
      : [
          ...(hasLogo ? [] : [ctx.clientName || "Cliente"]),
          ...(hasSmarteamLogo ? [] : ["Smarteam"]),
          "HubSpot",
        ];
  return (
    <div style={{ maxWidth: 900 }}>
      {editable && (ctx.imageUploadUrl || ctx.clientLogoUploadUrl) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ctx.imageUploadUrl && (
            <CoverButton coverImageUrl={data.coverImageUrl} uploadUrl={ctx.imageUploadUrl}
              onSet={(url) => set({ coverImageUrl: url })} />
          )}
          {ctx.clientLogoUploadUrl && ctx.onClientLogoChange && (
            <div style={{ marginBottom: 18 }}>
              <ClientLogoButton hasLogo={hasLogo} uploadUrl={ctx.clientLogoUploadUrl} onChanged={ctx.onClientLogoChange} />
            </div>
          )}
        </div>
      )}
      <div className="stl-brandrow">
        {hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="stl-brand-logo" src={ctx.clientLogoUrl!} alt={ctx.clientName} />
        )}
        {hasSmarteamLogo && (
          <>
            {hasLogo && <span className="stl-brand-x">×</span>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="stl-brand-logo" src={ctx.smarteamLogoUrl!} alt="Smarteam" />
          </>
        )}
        {brands.map((b, i) => {
          // Brand de texto con logo configurado (HubSpot / Insider One / Smarteam) →
          // se pinta la imagen. Sin logo → badge de texto editable, como siempre.
          const brandLogo = ctx.brandLogos?.[b.trim().toLowerCase()];
          return (
            <Fragment key={i}>
              {(i > 0 || hasLogo || hasSmarteamLogo) && <span className="stl-brand-x">×</span>}
              {brandLogo ? (
                <span className="stl-item" style={{ display: "inline-flex", alignItems: "center" }}>
                  {editable && <RemoveBtn onClick={() => set({ brands: removeAt(brands, i) })} />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="stl-brand-logo" src={brandLogo} alt={b} />
                </span>
              ) : (
                <span className="stl-item stl-brand-badge">
                  {editable && <RemoveBtn onClick={() => set({ brands: removeAt(brands, i) })} />}
                  <Editable as="span" editable={editable} value={b} placeholder="Marca / plataforma…"
                    onCommit={(v) => set({ brands: replaceAt(brands, i, v) })} />
                </span>
              )}
            </Fragment>
          );
        })}
        {editable && <AddBtn label="Marca" onClick={() => set({ brands: appendItem(brands, "") })} />}
      </div>
      <Editable as="h1" className="stl-hero-title" editable={editable} value={data.headline}
        placeholder="[Verbo de transformación] la [operación / proceso] de [cliente]…" onCommit={(v) => set({ headline: v })} />
      <Editable as="p" className="stl-lead" editable={editable} value={data.subhead}
        placeholder="Una frase que resume el dolor central y la apuesta…" onCommit={(v) => set({ subhead: v })} />
      {(tags.length > 0 || editable) && (
        <div className="stl-tags">
          {tags.map((t, i) => (
            <span key={i} className="stl-item stl-tag">
              {editable && <RemoveBtn onClick={() => set({ tags: removeAt(tags, i) })} />}
              <Editable as="span" editable={editable} value={t} placeholder="Hub / integración / diferenciador…"
                onCommit={(v) => set({ tags: replaceAt(tags, i, v) })} />
            </span>
          ))}
          {editable && <AddBtn label="Tag" onClick={() => set({ tags: appendItem(tags, "") })} />}
        </div>
      )}
    </div>
  );
};

// ── 2) Diagnóstico — los puntos de dolor reales ──────────────────────────────
export const PainSection: FC<SectionProps<PainData>> = ({ data, editable, onChange }) => {
  const items = data.items ?? [];
  const set = (next: Partial<PainData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-4">
        {items.map((it, i) => (
          <div key={i} className="stl-item stl-card">
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            <div className="stl-card-icon" style={{ background: "rgba(245,158,11,0.10)", color: "#D97706" }}>{PAIN_ICONS[i % PAIN_ICONS.length]}</div>
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
              placeholder="Nombre del dolor…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={it.detail}
              placeholder="Descripción en 1-2 líneas (impacto medible si se mencionó)…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar dolor" onClick={() => set({ items: appendItem(items, { title: "", detail: "" }) })} />}
    </>
  );
};

// ── 3) Antes vs. después — dos columnas ──────────────────────────────────────
export const BeforeAfterSection: FC<SectionProps<BeforeAfterData>> = ({ data, editable, onChange }) => {
  const before = data.before ?? [];
  const after = data.after ?? [];
  const set = (next: Partial<BeforeAfterData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-ba">
      <div className="stl-ba-now">
        <div className="stl-ba-head">Hoy</div>
        <ul className="stl-ba-list">
          {before.map((b, i) => (
            <li key={i} className="stl-item stl-ba-li">
              {editable && <RemoveBtn onClick={() => set({ before: removeAt(before, i) })} />}
              <Editable as="span" editable={editable} value={b} placeholder="Proceso manual / herramienta desconectada…"
                onCommit={(v) => set({ before: replaceAt(before, i, v) })} />
            </li>
          ))}
        </ul>
        {editable && <AddBtn label="Agregar" onClick={() => set({ before: appendItem(before, "") })} />}
      </div>
      <div className="stl-ba-future">
        <div className="stl-ba-head">Con HubSpot + Smarteam</div>
        <ul className="stl-ba-list">
          {after.map((a, i) => (
            <li key={i} className="stl-item stl-ba-li">
              {editable && <RemoveBtn onClick={() => set({ after: removeAt(after, i) })} />}
              <Editable as="span" editable={editable} value={a} placeholder="Qué queda automatizado / conectado…"
                onCommit={(v) => set({ after: replaceAt(after, i, v) })} />
            </li>
          ))}
        </ul>
        {editable && <AddBtn label="Agregar" onClick={() => set({ after: appendItem(after, "") })} />}
      </div>
    </div>
  );
};

// ── 4) Solución — qué se implementa (4 campos) ───────────────────────────────
export const SolutionSection: FC<SectionProps<SolutionData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<SolutionData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-grid stl-grid-2">
      <TextCard label="Hubs incluidos" value={data.hubs} editable={editable} placeholder="Sales / Marketing / Service / Data Hub…" onCommit={(v) => set({ hubs: v })} />
      <TextCard label="Integraciones clave" value={data.integraciones} editable={editable} placeholder="ERP / WhatsApp / sistema mencionado…" onCommit={(v) => set({ integraciones: v })} />
      <TextCard label="Casos de uso principales" value={data.casosDeUso} editable={editable} placeholder="Pipeline / seguimiento / automatización / reportería…" onCommit={(v) => set({ casosDeUso: v })} />
      <TextCard label="Usuarios afectados" value={data.usuarios} editable={editable} placeholder="Roles: vendedores, gerencia, CS…" onCommit={(v) => set({ usuarios: v })} />
    </div>
  );
};

// ── 5) ROI — números que respaldan la decisión ───────────────────────────────
export const RoiSection: FC<SectionProps<RoiData>> = ({ data, editable, onChange }) => {
  const metrics = data.metrics ?? [];
  const set = (next: Partial<RoiData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-4">
        {metrics.map((m, i) => (
          <div key={i} className="stl-item stl-metric">
            {editable && <RemoveBtn onClick={() => set({ metrics: removeAt(metrics, i) })} />}
            <Editable as="div" className="stl-metric-value" editable={editable} value={m.value}
              placeholder="[X]%" onCommit={(v) => set({ metrics: replaceAt(metrics, i, { ...m, value: v }) })} />
            <Editable as="div" className="stl-metric-label" editable={editable} value={m.label}
              placeholder="reducción en [proceso]…" onCommit={(v) => set({ metrics: replaceAt(metrics, i, { ...m, label: v }) })} />
          </div>
        ))}
      </div>
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
      <div>
        {phases.map((p, i) => (
          <div key={i} className="stl-item stl-phase">
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
        ))}
      </div>
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
export const InvestmentSection: FC<SectionProps<InvestmentData>> = ({ data, editable, onChange }) => {
  const lic = data.licenciasHubspot ?? { monto: "", detalle: "" };
  const impl = data.implementacion ?? { monto: "", detalle: "" };
  const set = (next: Partial<InvestmentData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        <InvestCard label="Licencias HubSpot / año" line={lic} editable={editable} montoPh="[Monto o rango]" detallePh="Hubs × usuarios × descuento si aplica" onChange={(v) => set({ licenciasHubspot: v })} />
        <InvestCard label="Implementación Smarteam" line={impl} editable={editable} montoPh="[Monto o rango]" detallePh="Set up + onboarding + integraciones" onChange={(v) => set({ implementacion: v })} />
      </div>
      <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""}
        placeholder="Si no hay precio en el transcript → 'A definir en propuesta formal'…" onCommit={(v) => set({ nota: v })} />
    </>
  );
};

// ── 8) Partner — por qué Smarteam (4 campos) ─────────────────────────────────
export const PartnerSection: FC<SectionProps<PartnerData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<PartnerData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-grid stl-grid-2">
      <TextCard label="Credencial" value={data.credencial} editable={editable} placeholder="HubSpot Partner Elite" onCommit={(v) => set({ credencial: v })} />
      <TextCard label="Experiencia" value={data.experiencia} editable={editable} placeholder="+200 proyectos, +8 países LATAM" onCommit={(v) => set({ experiencia: v })} />
      <TextCard label="Referencia sectorial" value={data.referenciaSectorial} editable={editable} placeholder="Cliente de referencia en industria similar…" onCommit={(v) => set({ referenciaSectorial: v })} />
      <TextCard label="Equipo asignado" value={data.equipo} editable={editable} placeholder="Nombres del equipo si se mencionaron…" onCommit={(v) => set({ equipo: v })} />
    </div>
  );
};

/** Botón del CTA en LECTURA: con `buttonUrl` navega en pestaña nueva; sin URL, span. */
export function CtaButton({ label, url }: { label?: string; url?: string }) {
  if (!label) return null;
  if (url?.trim()) {
    return (
      <a className="stl-btn" href={url.trim()} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return <span className="stl-btn">{label}</span>;
}

/** Editor de la URL del botón (solo modo edición): fuera del schema del agente —
 *  el CSE la configura y sobrevive regeneraciones (carry-forward de keys no-schema). */
export function CtaUrlField({ value, onCommit }: { value?: string; onCommit: (v: string) => void }) {
  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, fontSize: 12, opacity: 0.75 }}>
      <span>URL del botón:</span>
      <Editable as="span" editable value={value ?? ""} placeholder="https://… (vacío = sin link)"
        onCommit={onCommit} />
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
        <div style={{ marginTop: 26 }}>
          <Editable as="span" className="stl-btn" editable value={data.buttonLabel}
            placeholder="Agendar siguiente paso…" onCommit={(v) => set({ buttonLabel: v })} />
          <CtaUrlField value={data.buttonUrl} onCommit={(v) => set({ buttonUrl: v.trim() })} />
        </div>
      ) : (
        <CtaButton label={data.buttonLabel} url={data.buttonUrl} />
      )}
    </div>
  );
};
