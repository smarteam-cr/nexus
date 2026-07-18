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
/** El eje lead/lag de 4DX: `prediccion` = medida de predicción (lead), `arrastre` =
 *  medida de arrastre (lag). Lo comparten las secciones de medidas y el marcador. */
export type RoleKpiKind = "prediccion" | "arrastre";
export interface RoleLevel { level: string; titulo: string; alcance: string; impacto: string }
export interface RoleMaturityData { intro?: string; levels: RoleLevel[] }

// ── 4DX (The 4 Disciplines of Execution) ────────────────────────────────────
// D1 · WIG: UNA meta con línea de llegada, "de X a Y para [fecha]".
export interface RoleWigData { desde: string; hasta: string; fecha: string; contexto?: string }
// D2 · Medidas. Mismo shape para arrastre (lag: el resultado) y predicción (lead: la
// acción semanal controlable); los rótulos de `detail`/`meta` cambian por variante.
export interface RoleMeasureItem { title: string; detail: string; meta: string }
export interface RoleMeasuresData { intro?: string; items: RoleMeasureItem[] }
// D3 · Marcador: QUÉ gráfico crear en HubSpot por cada medida (no datos en vivo).
export type RoleChartKind = "gauge" | "bar" | "line" | "number";
export interface RoleScoreItem {
  measure: string;
  kind: RoleKpiKind;
  chart: RoleChartKind;
  /** Objeto/fuente + filtro del reporte a crear en HubSpot. */
  fuente: string;
  /** Cómo se ve "ganar" de un vistazo (el test de los 5 segundos). */
  ganar: string;
}
export interface RoleScoreboardData { intro?: string; items: RoleScoreItem[] }
// D4 · Cadencia: la WIG Session semanal + los touchpoints del rol.
export interface RoleCadenceItem { evento: string; quienes: string; cuando: string; formato: string }
export interface RoleCadenceData { intro?: string; items: RoleCadenceItem[] }

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
  return <MdTextarea value={md} placeholder="Escribe en markdown…" onCommit={(v) => onChange?.({ ...data, md: v })} />;
};

// ── Cards genéricas (responsabilidades / caminos de éxito / de fracaso) ───────
function RoleCards({
  data, editable, onChange, variant, addLabel,
}: SectionProps<RoleCardsData> & { variant: "neutral" | "success" | "failure"; addLabel: string }) {
  // `content` es Json opaco en la frontera HTTP: si llega algo que no es array, el
  // `.map` de SortableItems reventaría el componente cliente. El guard es el único
  // seguro entre esa columna y el render.
  const items = Array.isArray(data.items) ? data.items : [];
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

// ── Ruta de madurez — escalera L1→L5 ─────────────────────────────────────────
export const RoleMaturitySection: FC<SectionProps<RoleMaturityData>> = ({ data, editable, onChange }) => {
  const levels = Array.isArray(data.levels) ? data.levels : [];
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

// ═══ 4DX ═════════════════════════════════════════════════════════════════════
// La página no explica 4DX (no hay sección de metodología): el título va en llano, el
// término técnico en el eyebrow y la teoría en el tooltip ⓘ de cada sección.

// ── D1 · WIG — "de X a Y para [fecha]" (banda dark) ──────────────────────────
export const RoleWigSection: FC<SectionProps<RoleWigData>> = ({ data, editable, onChange }) => {
  const set = (next: Partial<RoleWigData>) => onChange?.({ ...data, ...next });
  return (
    <div className="stl-wig">
      <div className="stl-wig-row">
        <div className="stl-wig-part">
          <div className="stl-wig-label">De</div>
          <Editable as="div" className="stl-wig-value" editable={editable} value={data.desde}
            placeholder="Dónde estamos hoy…" onCommit={(v) => set({ desde: v })} />
        </div>
        <span className="stl-wig-arrow" aria-hidden>→</span>
        <div className="stl-wig-part">
          <div className="stl-wig-label">a</div>
          <Editable as="div" className="stl-wig-value is-target" editable={editable} value={data.hasta}
            placeholder="La meta…" onCommit={(v) => set({ hasta: v })} />
        </div>
        <div className="stl-wig-part">
          <div className="stl-wig-label">para</div>
          <Editable as="div" className="stl-wig-value" editable={editable} value={data.fecha}
            placeholder="Fecha límite…" onCommit={(v) => set({ fecha: v })} />
        </div>
      </div>
      <Editable as="p" className="stl-wig-context" editable={editable} value={data.contexto ?? ""}
        placeholder="Por qué ESTA es la meta que más importa…" onCommit={(v) => set({ contexto: v })} />
    </div>
  );
};

// ── D2 · Medidas (arrastre / predicción) ─────────────────────────────────────
const MEASURE_META: Record<"lag" | "lead", { detailLabel: string; metaLabel: string; add: string; detailPh: string; metaPh: string }> = {
  lag: {
    detailLabel: "Qué mide",
    metaLabel: "Objetivo del resultado",
    add: "Agregar medida de arrastre",
    detailPh: "El resultado que estás persiguiendo…",
    metaPh: "De cuánto a cuánto, y para cuándo…",
  },
  lead: {
    detailLabel: "Acción semanal",
    metaLabel: "Meta semanal",
    add: "Agregar medida de predicción",
    detailPh: "La acción concreta que SÍ controlas cada semana…",
    metaPh: "Cuántas veces por semana (número)…",
  },
};

function RoleMeasures({
  data, editable, onChange, variant,
}: SectionProps<RoleMeasuresData> & { variant: "lag" | "lead" }) {
  // `content` es Json opaco en la frontera HTTP: si llega algo que no es array, el
  // `.map` de SortableItems reventaría el componente cliente. El guard es el único
  // seguro entre esa columna y el render.
  const items = Array.isArray(data.items) ? data.items : [];
  const m = MEASURE_META[variant];
  const set = (next: Partial<RoleMeasuresData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(editable || (data.intro ?? "").trim()) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una línea de encuadre (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-grid stl-grid-2" style={{ marginTop: 18 }}>{nodes}</div>}>
        {(it, i, handle) => (
          <div className="stl-item stl-card stl-kpi">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            {/* SIN tag de predicción/arrastre: todas las cards de esta sección son del mismo
                tipo, así que repetirlo en cada una es ruido — el eyebrow y el ⓘ ya lo dicen.
                (En el marcador sí va, porque ahí se mezclan las dos.) */}
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.title}
              placeholder="Nombre de la medida…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, title: v }) })} />
            <div>
              <div className="stl-kpi-field-label">{m.detailLabel}</div>
              <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.detail}
                placeholder={m.detailPh} onCommit={(v) => set({ items: replaceAt(items, i, { ...it, detail: v }) })} />
            </div>
            <div>
              <div className="stl-kpi-field-label">{m.metaLabel}</div>
              <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.meta}
                placeholder={m.metaPh} onCommit={(v) => set({ items: replaceAt(items, i, { ...it, meta: v }) })} />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn label={m.add} onClick={() => set({ items: appendItem(items, { title: "", detail: "", meta: "" }) })} />
      )}
    </>
  );
}

export const RoleLagSection: FC<SectionProps<RoleMeasuresData>> = (p) => <RoleMeasures {...p} variant="lag" />;
export const RoleLeadSection: FC<SectionProps<RoleMeasuresData>> = (p) => <RoleMeasures {...p} variant="lead" />;

// ── D3 · Marcador — qué gráfico crear en HubSpot por cada medida ─────────────
/**
 * Previews del TIPO de gráfico, en SVG a mano: decorativos y ESTÁTICOS (sin datos
 * vivos, sin timers ni rAF). Dependency-free y SSR-safe a propósito — el motor `.stl`
 * también se renderiza en externo/PDF, donde una librería de charts (canvas, `ssr:false`)
 * rompería, y un loop perpetuo cuelga la captura de pantalla.
 */
const CHART_TRACK = "#E5E7EB";
function ChartGauge({ tone }: { tone: string }) {
  const r = 26, C = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke={CHART_TRACK} strokeWidth="8" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${C * 0.68} ${C}`} transform="rotate(-90 36 36)" />
    </svg>
  );
}
function ChartBar({ tone }: { tone: string }) {
  const bars = [0.45, 0.72, 0.58, 0.92];
  return (
    <svg width="68" height="68" viewBox="0 0 72 72" aria-hidden>
      <line x1="6" y1="62" x2="66" y2="62" stroke={CHART_TRACK} strokeWidth="2" />
      {bars.map((h, i) => (
        <rect key={i} x={9 + i * 15} y={60 - h * 44} width="10" height={h * 44} rx="3"
          fill={tone} opacity={0.5 + i * 0.16} />
      ))}
    </svg>
  );
}
function ChartLine({ tone }: { tone: string }) {
  const pts: [number, number][] = [[8, 52], [22, 45], [36, 48], [50, 29], [64, 18]];
  return (
    <svg width="68" height="68" viewBox="0 0 72 72" aria-hidden>
      <line x1="6" y1="62" x2="66" y2="62" stroke={CHART_TRACK} strokeWidth="2" />
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={tone}
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.8" fill={tone} />)}
    </svg>
  );
}
function ChartNumber({ tone }: { tone: string }) {
  return (
    <svg width="68" height="68" viewBox="0 0 72 72" aria-hidden>
      <rect x="7" y="21" width="58" height="30" rx="8" fill="none" stroke={CHART_TRACK} strokeWidth="2" />
      <text x="36" y="42" textAnchor="middle" fontSize="17" fontWeight="700" fill={tone}>87%</text>
    </svg>
  );
}

const CHART_ORDER: RoleChartKind[] = ["gauge", "bar", "line", "number"];
const CHART_VIZ: Record<RoleChartKind, FC<{ tone: string }>> = {
  gauge: ChartGauge, bar: ChartBar, line: ChartLine, number: ChartNumber,
};
const CHART_LABEL: Record<RoleChartKind, string> = {
  gauge: "Medidor",
  bar: "Barras",
  line: "Línea (tendencia)",
  number: "Número único",
};

export const RoleScoreboardSection: FC<SectionProps<RoleScoreboardData>> = ({ data, editable, onChange }) => {
  const all = Array.isArray(data.items) ? data.items : [];
  // En LECTURA un ítem recién agregado y sin llenar no debe pintar una card fantasma: su
  // `kind`/`chart` son strings no vacíos, así que el `isBlank` del motor no lo detecta.
  const items = editable ? all : all.filter((it) => `${it.measure}${it.fuente}${it.ganar}`.trim());
  const set = (next: Partial<RoleScoreboardData>) => onChange?.({ ...data, ...next });
  if (!editable && items.length === 0 && !(data.intro ?? "").trim()) return null;
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
          const chart: RoleChartKind = CHART_ORDER.includes(it.chart) ? it.chart : "bar";
          const tone = kind === "arrastre" ? "#1FBE91" : "#168CF6";
          const Viz = CHART_VIZ[chart];
          const nextChart = () => CHART_ORDER[(CHART_ORDER.indexOf(chart) + 1) % CHART_ORDER.length];
          return (
            <div className="stl-item stl-card stl-score">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
              <div className="stl-score-top">
                <div className="stl-score-viz"><Viz tone={tone} /></div>
                <div className="stl-score-id">
                  {/* El marcador (D3) tiene que mostrar predicción Y arrastre: en edición el tag
                      es un toggle, si no una medida nueva quedaría clavada en "Predicción". */}
                  {editable ? (
                    <button type="button" className={`stl-kpi-tag is-${kind}`} data-tip={KPI_TIP[kind]}
                      title="Cambiar tipo (predicción ↔ arrastre)"
                      onClick={() => set({ items: replaceAt(items, i, { ...it, kind: kind === "arrastre" ? "prediccion" : "arrastre" }) })}>
                      {KPI_LABEL[kind]}
                    </button>
                  ) : (
                    <span className={`stl-kpi-tag is-${kind}`} data-tip={KPI_TIP[kind]}
                      tabIndex={0} role="note" aria-label={KPI_TIP[kind]}>{KPI_LABEL[kind]}</span>
                  )}
                  <Editable as="h3" className="stl-card-title" editable={editable} value={it.measure}
                    placeholder="Medida a trackear…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, measure: v }) })} />
                  {editable ? (
                    <button type="button" className="stl-score-chart" title="Cambiar el tipo de gráfico"
                      onClick={() => set({ items: replaceAt(items, i, { ...it, chart: nextChart() }) })}>
                      {CHART_LABEL[chart]} ⟳
                    </button>
                  ) : (
                    <span className="stl-score-chart is-static">{CHART_LABEL[chart]}</span>
                  )}
                </div>
              </div>
              <div className="stl-score-hs">
                {/* Solo el puntero: qué gráfico es y dónde vive. El cómo armarlo (filtros,
                    propiedades) es trabajo de HubSpot, no de la página del puesto. */}
                <div className="stl-score-hs-label">En HubSpot</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.fuente}
                  placeholder="Dashboard o reporte donde vive…"
                  onCommit={(v) => set({ items: replaceAt(items, i, { ...it, fuente: v }) })} />
              </div>
              <div>
                <div className="stl-kpi-field-label">Vas ganando cuando</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.ganar}
                  placeholder="Cómo se ve ganar de un vistazo…"
                  onCommit={(v) => set({ items: replaceAt(items, i, { ...it, ganar: v }) })} />
              </div>
            </div>
          );
        }}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar gráfico del marcador"
          onClick={() => set({ items: appendItem(items, { measure: "", kind: "prediccion", chart: "bar", fuente: "", ganar: "" }) })} />
      )}
    </>
  );
};

// ── D4 · Cadencia de responsabilidad ────────────────────────────────────────
export const RoleCadenceSection: FC<SectionProps<RoleCadenceData>> = ({ data, editable, onChange }) => {
  // `content` es Json opaco en la frontera HTTP: si llega algo que no es array, el
  // `.map` de SortableItems reventaría el componente cliente. El guard es el único
  // seguro entre esa columna y el render.
  const items = Array.isArray(data.items) ? data.items : [];
  const set = (next: Partial<RoleCadenceData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(editable || (data.intro ?? "").trim()) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.intro ?? ""}
          placeholder="Una línea de encuadre (opcional)…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
        container={(nodes) => <div className="stl-ladder" style={{ marginTop: 18 }}>{nodes}</div>}>
        {(it, i, handle) => (
          <div className="stl-item stl-card stl-cadence">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={it.evento}
              placeholder="Nombre del evento (ej. WIG Session semanal)…"
              onCommit={(v) => set({ items: replaceAt(items, i, { ...it, evento: v }) })} />
            <div className="stl-cadence-meta">
              <div>
                <div className="stl-kpi-field-label">Quiénes</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.quienes}
                  placeholder="Quién participa…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, quienes: v }) })} />
              </div>
              <div>
                <div className="stl-kpi-field-label">Cuándo</div>
                <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.cuando}
                  placeholder="Día, hora y duración…" onCommit={(v) => set({ items: replaceAt(items, i, { ...it, cuando: v }) })} />
              </div>
            </div>
            <div>
              <div className="stl-kpi-field-label">Formato</div>
              <Editable as="div" className="stl-kpi-field-value" editable={editable} value={it.formato}
                placeholder="Qué pasa en la sesión, paso a paso…"
                onCommit={(v) => set({ items: replaceAt(items, i, { ...it, formato: v }) })} />
            </div>
          </div>
        )}
      </SortableItems>
      {editable && (
        <AddBtn label="Agregar evento de cadencia"
          onClick={() => set({ items: appendItem(items, { evento: "", quienes: "", cuando: "", formato: "" }) })} />
      )}
    </>
  );
};
