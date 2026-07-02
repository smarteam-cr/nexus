"use client";

/**
 * components/landing/sections-website.tsx
 *
 * Secciones del template SITIO WEB (estructura de la propuesta RIGORA, 8 secciones).
 * La Portada reusa HeroSection (key "hero" → hereda portada con imagen y carry-forward)
 * y la "Arquitectura de conexión" reusa TechArchitectureSection (sections-shared.tsx).
 * Acá viven las 6 restantes. Mismo contrato inline-editable que sections.tsx.
 */
import { type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { CtaButton, CtaUrlField } from "./sections";
import type {
  SectionProps,
  WebDiagnosisData,
  SiteArchitectureData,
  WebScopeData,
  WebMethodologyData,
  WebInvestmentData,
  WebInvestLine,
  WhyUsData,
} from "./types";

// ── 2) Diagnóstico y contexto ────────────────────────────────────────────────
export const WebDiagnosisSection: FC<SectionProps<WebDiagnosisData>> = ({ data, editable, onChange }) => {
  const retos = data.retos ?? [];
  const set = (next: Partial<WebDiagnosisData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="Contexto del cliente y del proyecto…" onCommit={(v) => set({ intro: v })} />
      <div className="stl-grid stl-grid-3">
        {retos.map((r, i) => (
          <div key={i} className="stl-item stl-card">
            {editable && <RemoveBtn onClick={() => set({ retos: removeAt(retos, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={r.title}
              placeholder="Reto actual…" onCommit={(v) => set({ retos: replaceAt(retos, i, { ...r, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={r.detail}
              placeholder="Por qué duele hoy…" onCommit={(v) => set({ retos: replaceAt(retos, i, { ...r, detail: v }) })} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar reto" onClick={() => set({ retos: appendItem(retos, { title: "", detail: "" }) })} />}
      <div className="stl-grid stl-grid-2" style={{ marginTop: 28 }}>
        <div className="stl-field-card">
          <div className="stl-field-label">Por qué esta plataforma</div>
          <Editable as="div" className="stl-field-value" editable={editable} value={data.porQuePlataforma ?? ""}
            placeholder="Por qué Content Hub / la plataforma elegida…" onCommit={(v) => set({ porQuePlataforma: v })} />
        </div>
        <div className="stl-field-card">
          <div className="stl-field-label">Objetivo del proyecto</div>
          <Editable as="div" className="stl-field-value" editable={editable} value={data.objetivo ?? ""}
            placeholder="Qué debe lograr el sitio…" onCommit={(v) => set({ objetivo: v })} />
        </div>
      </div>
    </>
  );
};

// ── 3) Arquitectura del sitio (sitemap por fases) ────────────────────────────
export const SiteArchitectureSection: FC<SectionProps<SiteArchitectureData>> = ({ data, editable, onChange }) => {
  const fases = data.fases ?? [];
  const set = (next: Partial<SiteArchitectureData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.recorrido ?? ""}
        placeholder="Recorrido del usuario por el sitio…" onCommit={(v) => set({ recorrido: v })} />
      <div className="stl-grid stl-grid-2">
        {fases.map((f, i) => {
          const soon = (f.badge ?? "").trim() !== "";
          return (
            <div key={i} className={`stl-item stl-sitemap-phase${soon ? " stl-sitemap-phase--soon" : ""}`}>
              {editable && <RemoveBtn onClick={() => set({ fases: removeAt(fases, i) })} />}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Editable as="h3" className="stl-card-title" editable={editable} value={f.nombre}
                  placeholder="Fase 1 — Lanzamiento…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...f, nombre: v }) })} />
                {(soon || editable) && (
                  <span className="stl-sitemap-badge">
                    <Editable as="span" editable={editable} value={f.badge ?? ""} placeholder="Próximamente…"
                      onCommit={(v) => set({ fases: replaceAt(fases, i, { ...f, badge: v }) })} />
                  </span>
                )}
              </div>
              <div className="stl-page-chips">
                {(f.paginas ?? []).map((p, j) => (
                  <span key={j} className="stl-item stl-page-chip">
                    {editable && <RemoveBtn onClick={() => set({ fases: replaceAt(fases, i, { ...f, paginas: removeAt(f.paginas ?? [], j) }) })} />}
                    <Editable as="span" editable={editable} value={p} placeholder="Página…"
                      onCommit={(v) => set({ fases: replaceAt(fases, i, { ...f, paginas: replaceAt(f.paginas ?? [], j, v) }) })} />
                  </span>
                ))}
                {editable && <AddBtn label="Página" onClick={() => set({ fases: replaceAt(fases, i, { ...f, paginas: appendItem(f.paginas ?? [], "") }) })} />}
              </div>
            </div>
          );
        })}
      </div>
      {editable && <AddBtn label="Agregar fase" onClick={() => set({ fases: appendItem(fases, { nombre: "", badge: "", paginas: [] }) })} />}
    </>
  );
};

// ── 5) Alcance — checklist PLANA de entregables (≠ etapas: eso es el Cronograma) ──
export const WebScopeSection: FC<SectionProps<WebScopeData>> = ({ data, editable, onChange }) => {
  // Fallback LEGACY: data generada con el shape viejo por áreas (`bloques`) se
  // aplana a entregables para que canvases/snapshots previos no queden en blanco.
  const entregables =
    data.entregables?.length
      ? data.entregables
      : (data.bloques ?? []).flatMap((b) => (b.items ?? []).map((it) => ({ title: it, detail: "" })));
  const set = (next: Partial<WebScopeData>) => onChange?.({ ...data, ...next });
  const setEntregables = (list: { title: string; detail: string }[]) => set({ entregables: list });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        {entregables.map((e, i) => (
          <div key={i} className="stl-item stl-deliverable">
            {editable && <RemoveBtn onClick={() => setEntregables(removeAt(entregables, i))} />}
            <span className="stl-deliverable-check" aria-hidden>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Editable as="div" className="stl-deliverable-title" editable={editable} value={e.title}
                placeholder="Entregable (ej. Sitio en Content Hub)…"
                onCommit={(v) => setEntregables(replaceAt(entregables, i, { ...e, title: v }))} />
              {(e.detail || editable) && (
                <Editable as="p" className="stl-card-detail" editable={editable} value={e.detail ?? ""}
                  placeholder="Qué incluye (1 línea)…"
                  onCommit={(v) => setEntregables(replaceAt(entregables, i, { ...e, detail: v }))} />
              )}
            </div>
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar entregable" onClick={() => setEntregables(appendItem(entregables, { title: "", detail: "" }))} />}
      {(data.resultado || editable) && (
        <div className="stl-callout" style={{ marginTop: 28 }}>
          <div className="stl-field-label">Resultado</div>
          <Editable as="p" className="stl-field-value" editable={editable} value={data.resultado ?? ""}
            placeholder="Qué recibe el cliente al final…" onCommit={(v) => set({ resultado: v })} />
        </div>
      )}
    </>
  );
};

// ── 6) Metodología y cronograma ──────────────────────────────────────────────
export const WebMethodologySection: FC<SectionProps<WebMethodologyData>> = ({ data, editable, onChange }) => {
  const fases = data.fases ?? [];
  const set = (next: Partial<WebMethodologyData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div>
        {fases.map((p, i) => (
          <div key={i} className="stl-item stl-phase">
            {editable && <RemoveBtn onClick={() => set({ fases: removeAt(fases, i) })} />}
            <div className="stl-phase-num">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <Editable as="div" className="stl-phase-name" editable={editable} value={p.name}
                placeholder="Nombre de la fase…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, name: v }) })} />
              <Editable as="div" className="stl-phase-duration" editable={editable} value={p.duration}
                placeholder="Semanas 1-2…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, duration: v }) })} />
              <Editable as="p" className="stl-body" editable={editable} value={p.detail}
                placeholder="Qué pasa en esta fase…" onCommit={(v) => set({ fases: replaceAt(fases, i, { ...p, detail: v }) })} />
            </div>
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar fase" onClick={() => set({ fases: appendItem(fases, { name: "", detail: "", duration: "" }) })} />}
      {(data.cotizaAparte || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.cotizaAparte ?? ""}
          placeholder="Qué se cotiza aparte (contenido, fotografía, integraciones extra)…" onCommit={(v) => set({ cotizaAparte: v })} />
      )}
    </>
  );
};

// ── 7) Inversión (web) ───────────────────────────────────────────────────────
function InvestGroup({
  label, lines, editable, onChange, addLabel,
}: { label: string; lines: WebInvestLine[]; editable?: boolean; onChange: (l: WebInvestLine[]) => void; addLabel: string }) {
  if (!lines.length && !editable) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="stl-field-label">{label}</div>
      <div className="stl-invest" style={{ marginTop: 10 }}>
        {lines.map((l, i) => (
          <div key={i} className="stl-item stl-invest-row">
            {editable && <RemoveBtn onClick={() => onChange(removeAt(lines, i))} />}
            <div>
              <Editable as="div" className="stl-invest-concept" editable={editable} value={l.concepto}
                placeholder="Concepto…" onCommit={(v) => onChange(replaceAt(lines, i, { ...l, concepto: v }))} />
              <Editable as="div" className="stl-invest-detail" editable={editable} value={l.detalle}
                placeholder="Qué incluye…" onCommit={(v) => onChange(replaceAt(lines, i, { ...l, detalle: v }))} />
            </div>
            <Editable as="div" className="stl-invest-amount" editable={editable} value={l.monto}
              placeholder="[Rango]" onCommit={(v) => onChange(replaceAt(lines, i, { ...l, monto: v }))} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label={addLabel} onClick={() => onChange(appendItem(lines, { concepto: "", monto: "", detalle: "" }))} />}
    </div>
  );
}

export const WebInvestmentSection: FC<SectionProps<WebInvestmentData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<WebInvestmentData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <InvestGroup label="Inversión — Fase 1" lines={data.lineas ?? []} editable={editable}
        onChange={(l) => set({ lineas: l })} addLabel="Agregar línea" />
      <InvestGroup label="Extras opcionales" lines={data.extras ?? []} editable={editable}
        onChange={(l) => set({ extras: l })} addLabel="Agregar extra" />
      <InvestGroup label="Recurrente mensual" lines={data.recurrentes ?? []} editable={editable}
        onChange={(l) => set({ recurrentes: l })} addLabel="Agregar recurrente" />
      {(data.nota || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""}
          placeholder="Vigencia de la propuesta / condiciones…" onCommit={(v) => set({ nota: v })} />
      )}
    </>
  );
};

// ── 8) Por qué Smarteam + siguiente paso ─────────────────────────────────────
export const WhyUsSection: FC<SectionProps<WhyUsData>> = ({ data, editable, onChange }) => {
  const cards = data.cards ?? [];
  const set = (next: Partial<WhyUsData>) => onChange?.({ ...data, ...next });
  return (
    <>
      <div className="stl-grid stl-grid-2">
        {cards.map((c, i) => (
          <div key={i} className="stl-item stl-card">
            {editable && <RemoveBtn onClick={() => set({ cards: removeAt(cards, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={c.title}
              placeholder="Partner Elite / equipo / método…" onCommit={(v) => set({ cards: replaceAt(cards, i, { ...c, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={c.detail}
              placeholder="Por qué importa para este proyecto…" onCommit={(v) => set({ cards: replaceAt(cards, i, { ...c, detail: v }) })} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar card" onClick={() => set({ cards: appendItem(cards, { title: "", detail: "" }) })} />}
      <div className="stl-cta-wrap" style={{ marginTop: 36 }}>
        <Editable as="p" className="stl-lead" editable={editable} value={data.siguientePaso ?? ""}
          placeholder="Siguiente paso propuesto…" onCommit={(v) => set({ siguientePaso: v })} />
        {editable ? (
          <div style={{ marginTop: 20 }}>
            <Editable as="span" className="stl-btn" editable value={data.buttonLabel ?? ""}
              placeholder="Agendar siguiente paso…" onCommit={(v) => set({ buttonLabel: v })} />
            <CtaUrlField value={data.buttonUrl} onCommit={(v) => set({ buttonUrl: v.trim() })} />
          </div>
        ) : (
          <CtaButton label={data.buttonLabel} url={data.buttonUrl} />
        )}
      </div>
    </>
  );
};
