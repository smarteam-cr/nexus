"use client";

/**
 * components/landing/sections-roles.tsx
 *
 * Componentes de SECCIÓN de los perfiles de puesto (Roles), sobre el MISMO motor de
 * landing (`LandingView`) que los business cases y el kickoff. Cada uno es vista
 * (modo lectura, pulido) y editor inline (modo `editable`): reusan las primitivas
 * del motor (`Editable`, `SortableItems`, `RemoveBtn`, `AddBtn`) → edición WYSIWYG
 * in-situ + drag&drop de ítems. Estilos en app/landing-engine.css (scope `.stl`).
 *
 * El contenido de un rol se guarda como JSON estructurado por sección en
 * `RoleProfile.content` (NO en CanvasBlock — se reusa la PRESENTACIÓN, no el motor
 * de datos; ver docs/DECISIONS.md). El hero (title/area/summary) vive en los
 * metadatos del rol; el resto de las secciones en `content[sectionKey]`.
 */
import { useState, type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import type { SectionProps } from "./types";

// ── Data shapes por sección (el `empty` en roles.defs.ts los espeja) ──────────
export interface RoleHeroData { title: string; area?: string; summary?: string }
export interface RoleProseData { md?: string }
export interface RoleCardItem { title: string; detail: string }
export interface RoleCardsData { items: RoleCardItem[] }
export type RoleKpiKind = "prediccion" | "arrastre";
export interface RoleKpiItem { title: string; kind: RoleKpiKind; objetivo: string; medicion: string }
export interface RoleKpiData { intro?: string; items: RoleKpiItem[] }
export interface RoleLevel { level: string; titulo: string; alcance: string; impacto: string }
export interface RoleMaturityData { intro?: string; levels: RoleLevel[] }

// ── Íconos ───────────────────────────────────────────────────────────────────
const IconCheck = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
  </svg>
);
const IconAlert = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0z" />
  </svg>
);

const KPI_TIP: Record<RoleKpiKind, string> = {
  prediccion:
    "Métrica de PREDICCIÓN: lo que la persona controla y ejecuta día a día — adelanta el resultado.",
  arrastre:
    "Métrica de ARRASTRE: el impacto comercial final — llega después, como consecuencia de la ejecución.",
};
const KPI_LABEL: Record<RoleKpiKind, string> = { prediccion: "Predicción", arrastre: "Arrastre" };

/** Textarea markdown que comitea en blur (perfil / transición). No-controlado
 *  respecto de la prop: se re-sincroniza SIN efecto (patrón "ajustar estado durante
 *  el render") para no pisar lo que la persona está tipeando ni pintar un frame viejo. */
function MdTextarea({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return (
    <div>
      <textarea
        className="stl-md-editor"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onCommit(v); }}
      />
      <p className="stl-md-hint">
        Markdown: viñetas con <code>-</code>, negrita con <code>**texto**</code>, subtítulos con <code>###</code>.
      </p>
    </div>
  );
}

// ── Hero — title (metadatos) + área (eyebrow) + resumen (lead) ────────────────
export const RoleHeroSection: FC<SectionProps<RoleHeroData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<RoleHeroData>) => onChange?.({ ...data, ...next });
  return (
    <div style={{ maxWidth: 760 }}>
      <Editable as="span" className="stl-eyebrow" editable={editable} value={data.area ?? ""}
        placeholder="Área (ej. Marketing)…" onCommit={(v) => set({ area: v })} />
      <Editable as="h1" className="stl-hero-title" editable={editable} value={data.title}
        placeholder="Nombre del puesto…" onCommit={(v) => set({ title: v })} />
      <Editable as="p" className="stl-lead" editable={editable} value={data.summary ?? ""}
        placeholder="Resumen de una línea (subtítulo)…" onCommit={(v) => set({ summary: v })} />
    </div>
  );
};

// ── Prosa markdown — perfil de puesto / período de transición ─────────────────
export const RoleProseSection: FC<SectionProps<RoleProseData>> = ({ data, editable, onChange }) => {
  const md = data.md ?? "";
  if (!editable) {
    if (!md.trim()) return null;
    return (
      <div className="stl-body stl-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </div>
    );
  }
  return <MdTextarea value={md} placeholder="Escribí en markdown…" onCommit={(v) => onChange?.({ ...data, md: v })} />;
};

// ── Cards genéricas (responsabilidades / caminos de éxito / de fracaso) ───────
function RoleCards({
  data, editable, onChange, variant, addLabel,
}: SectionProps<RoleCardsData> & { variant: "neutral" | "success" | "failure"; addLabel: string }) {
  const items = data.items ?? [];
  const set = (next: Partial<RoleCardsData>) => onChange?.({ ...data, ...next });
  const flag = variant === "success" ? IconCheck : variant === "failure" ? IconAlert : null;
  const cls = variant === "success" ? " is-success" : variant === "failure" ? " is-failure" : "";
  return (
    <>
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
        {(it, i, handle) => (
          <div className={`stl-item stl-card${cls}`}>
            {handle}
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            {flag && <div className="stl-card-flag">{flag}</div>}
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
              placeholder="Título…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={it.detail}
              placeholder="Descripción en 1-2 líneas…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label={addLabel} onClick={() => set({ items: appendItem(items, { title: "", detail: "" }) })} />}
    </>
  );
}

export const RoleResponsibilitiesSection: FC<SectionProps<RoleCardsData>> = (p) => (
  <RoleCards {...p} variant="neutral" addLabel="Agregar responsabilidad" />
);
export const RoleSuccessSection: FC<SectionProps<RoleCardsData>> = (p) => (
  <RoleCards {...p} variant="success" addLabel="Agregar camino de éxito" />
);
export const RoleFailureSection: FC<SectionProps<RoleCardsData>> = (p) => (
  <RoleCards {...p} variant="failure" addLabel="Agregar camino de fracaso" />
);

// ── KPIs — cards con tag predicción/arrastre + objetivo + medición ────────────
export const RoleKpiSection: FC<SectionProps<RoleKpiData>> = ({ data, editable, onChange }) => {
  const items = data.items ?? [];
  const set = (next: Partial<RoleKpiData>) => onChange?.({ ...data, ...next });
  const cycleKind = (k: RoleKpiKind): RoleKpiKind => (k === "prediccion" ? "arrastre" : "prediccion");
  return (
    <>
      {(editable || (data.intro ?? "").trim()) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una línea de encuadre (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2" style={{ marginTop: 18 }}>{nodes}</div>}>
        {(it, i, handle) => {
          const kind: RoleKpiKind = it.kind === "arrastre" ? "arrastre" : "prediccion";
          const tagCls = `stl-kpi-tag is-${kind}`;
          return (
            <div className="stl-item stl-card stl-kpi">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
              <div className="stl-kpi-head">
                {editable ? (
                  <button type="button" className={tagCls} data-tip={KPI_TIP[kind]}
                    title="Cambiar tipo (predicción ↔ arrastre)"
                    onClick={() => set({ items: replaceAt(items, i, { ...it, kind: cycleKind(kind) }) })}>
                    {KPI_LABEL[kind]}
                  </button>
                ) : (
                  <span className={tagCls} data-tip={KPI_TIP[kind]}>{KPI_LABEL[kind]}</span>
                )}
                <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
                  placeholder="Nombre del KPI…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
              </div>
              <div>
                <div className="stl-kpi-field-label">Objetivo</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.objetivo}
                  placeholder="Qué se busca…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, objetivo: v }) })} />
              </div>
              <div>
                <div className="stl-kpi-field-label">Medición</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.medicion}
                  placeholder="Cómo se mide…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, medicion: v }) })} />
              </div>
            </div>
          );
        }}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar KPI"
          onClick={() => set({ items: appendItem(items, { title: "", kind: "prediccion", objetivo: "", medicion: "" }) })} />
      )}
    </>
  );
};

// ── Ruta de madurez — escalera L1→L5 ─────────────────────────────────────────
export const RoleMaturitySection: FC<SectionProps<RoleMaturityData>> = ({ data, editable, onChange }) => {
  const levels = data.levels ?? [];
  const set = (next: Partial<RoleMaturityData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(editable || (data.intro ?? "").trim()) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una línea sobre la evolución del puesto (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={levels} disabled={!editable} onReorder={(next) => set({ levels: next })}
        container={(nodes) => <div className="stl-ladder" style={{ marginTop: 18 }}>{nodes}</div>}>
        {(lv, i, handle) => (
          <div className="stl-item stl-rung">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ levels: removeAt(levels, i) })} />}
            <Editable as="div" className="stl-rung-badge" editable={editable} value={lv.level}
              placeholder="L1" onCommit={(v) => set({ levels: replaceAt(levels, i, { ...lv, level: v }) })} />
            <div className="stl-rung-body">
              <Editable as="div" className="stl-rung-title" editable={editable} value={lv.titulo}
                placeholder="Nombre del nivel…" onCommit={(v) => set({ levels: replaceAt(levels, i, { ...lv, titulo: v }) })} />
              <Editable as="p" className="stl-rung-scope" editable={editable} value={lv.alcance}
                placeholder="Qué domina / hace en este nivel…" onCommit={(v) => set({ levels: replaceAt(levels, i, { ...lv, alcance: v }) })} />
              <p className="stl-rung-impact">
                <span className="stl-rung-impact-label">Impacto: </span>
                <Editable as="span" editable={editable} value={lv.impacto}
                  placeholder="El impacto en el negocio…" onCommit={(v) => set({ levels: replaceAt(levels, i, { ...lv, impacto: v }) })} />
              </p>
            </div>
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar nivel"
          onClick={() => set({ levels: appendItem(levels, { level: "", titulo: "", alcance: "", impacto: "" }) })} />
      )}
    </>
  );
};
