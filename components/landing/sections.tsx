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
import { useEffect, useRef, useState, type CSSProperties, type FC, type PointerEvent as ReactPointerEvent } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { HeroUploadButtons, BrandRow, TagRow } from "./hero-parts";
import { resolveHeroTitle } from "@/lib/landing/hero-title";
import {
  acotarRango,
  rangoDeFase,
  reescribirDuracion,
  semanaEnX,
  spanDelPlan,
  textoSemanas,
  type RangoSemanas,
} from "@/lib/landing/plan-weeks";
import { landingLang, t, type LandingLang } from "./i18n";
import type {
  SectionProps,
  HeroData,
  PainData,
  BeforeAfterData,
  RoiData,
  Phase,
  PlanData,
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
export const HeroSection: FC<SectionProps<HeroData>> = ({
  data, ctx, editable, onChange, sectionTitle, sectionEyebrow,
}) => {
  const tags = data.tags ?? [];
  const set = (next: Partial<HeroData>) => onChange?.({ ...data, ...next });
  // El TÍTULO nunca falta. Y el titular del caso es título O bajada, nunca los dos:
  // mientras el documento no tenga título propio, su titular sigue arriba (así los ya
  // generados no cambian solos de aspecto).
  const { titulo, bajada } = resolveHeroTitle({
    escrito: data.titulo, titular: data.headline, rotulo: sectionTitle,
  });
  const eyebrow = (sectionEyebrow ?? "").trim();
  return (
    <div style={{ maxWidth: 900 }}>
      {editable && (
        <HeroUploadButtons ctx={ctx} coverImageUrl={data.coverImageUrl} onCover={(url) => set({ coverImageUrl: url })} />
      )}
      <BrandRow
        brands={data.brands}
        ctx={ctx}
        editable={editable}
        onChange={(next) => set({ brands: next })}
        logoScale={data.logoScale}
        onLogoScale={(pct) => set({ logoScale: pct ?? undefined })}
      />
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {/* El título es editable, pero el placeholder es el rótulo del propio documento:
          así lo que se ve mientras está vacío ya es el texto correcto, no una plantilla
          de otro documento. */}
      <Editable as="h1" className="stl-hero-title" editable={editable} value={titulo}
        placeholder={sectionTitle ?? ""} onCommit={(v) => set({ titulo: v })} />
      {/* El titular del caso, cuando NO subió a título. Al escribirlo se FIJA también el
          título que se está viendo: sin eso, el texto recién escrito saltaba arriba
          (porque el titular se vuelve a promocionar) y la portada se sentía inestable. */}
      {(editable || bajada) && (
        <Editable as="p" className="stl-lead" editable={editable} value={bajada}
          placeholder="El titular del caso en una frase…"
          onCommit={(v) => set({ titulo, headline: v })} />
      )}
      {(editable || data.subhead) && (
        <Editable as="p" className="stl-lead" editable={editable} value={data.subhead}
          placeholder="El resumen en una o dos frases…" onCommit={(v) => set({ subhead: v })} />
      )}
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

// ── 4) Solución — se mudó a sections-hubs.tsx (`HubsClienteSection`), que es la que
//    registra la key `solucion` y lleva adentro esta versión de 4 campos como rama
//    legacy para lo ya generado.

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

/**
 * El aviso de la PRIMERA fase: esa etapa es el diagnóstico y puede mover las fechas de las
 * que siguen. Va derivado de la posición (`i === 0`) y no de un campo que alguien tenga que
 * acordarse de marcar — si dependiera de una casilla, la propuesta que se olvida de marcarla
 * es justo la que sale comprometiendo fechas exactas antes de diagnosticar.
 * `data.avisoFase1 === "no"` lo apaga para la propuesta que no arranque con diagnóstico.
 */
function avisoActivo(data: PlanData, i: number): boolean {
  return i === 0 && (data.avisoFase1 ?? "") !== "no";
}

/**
 * El Gantt: una barra por fase sobre un eje de semanas. Grid y `<div>`s — cero SVG, cero
 * canvas, cero scroller: los tres patrones que `pdf-mode-coverage` marca.
 *
 * En EDICIÓN la barra se arrastra (mover) y se estira de los extremos (alargar), igual que en
 * el Gantt del cronograma interno: pointer events nativos, sin dnd-kit —que ahí está cableado
 * para reordenar filas— y midiendo el ancho de semana contra la pista. Al soltar reescribe las
 * DOS caras del dato: `semanas` (la máquina) y `duration` (lo que lee el cliente en la lista),
 * porque las dos vistas no pueden decir cosas distintas del mismo plan.
 *
 * En LECTURA no hay handlers ni tiradores: el prospecto mira el plan, no lo edita.
 */
const PlanGantt: FC<{
  phases: Phase[];
  data: PlanData;
  lang: LandingLang;
  editable?: boolean;
  onRango?: (i: number, r: RangoSemanas) => void;
}> = ({ phases, data, lang, editable, onRango }) => {
  /* Preview local del arrastre: el commit va UNA vez al soltar. Escribir en cada `pointermove`
     dispararía un PUT por semana cruzada — el `onChange` de una sección persiste de inmediato. */
  const [preview, setPreview] = useState<{ i: number; r: RangoSemanas } | null>(null);
  const ultimo = useRef<{ i: number; r: RangoSemanas } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const fases = preview
    ? phases.map((p, k) => (k === preview.i ? { ...p, semanas: textoSemanas(preview.r) } : p))
    : phases;
  const span = spanDelPlan(fases);

  /* La geometría se lee FRESCA en cada movimiento (rect + columnas del `dataset`) en vez de
     congelarla al empezar: así, cuando estirar una fase alarga el eje, la barra sigue pegada
     al cursor en lugar de quedarse atrás. */
  const arrastrar = (e: ReactPointerEvent, i: number, r: RangoSemanas, modo: "mover" | "ini" | "fin") => {
    if (!editable || !onRango) return;
    e.preventDefault();
    e.stopPropagation();
    /* La pista se busca VIVA en cada movimiento por su posición, en vez de cerrar sobre el nodo
       del `pointerdown`: si un re-render lo reemplaza, el nodo viejo queda desconectado, mide
       0×0 y el arrastre se vuelve loco. Verificado arrastrando en Chrome — ver `semanaEnX`. */
    const pistaViva = () =>
      (raiz.current?.querySelectorAll(".stl-gantt-track")[i] as HTMLElement | undefined) ?? null;
    const semanaEn = (clientX: number) => {
      const pista = pistaViva();
      if (!pista) return null;
      const rect = pista.getBoundingClientRect();
      return semanaEnX({
        x: clientX,
        left: rect.left,
        width: rect.width,
        cols: Number(pista.dataset.cols) || 0,
        desde: Number(pista.dataset.desde) || 1,
      });
    };
    const agarre = semanaEn(e.clientX);
    if (agarre == null) return;
    const offset = agarre - r.inicio; // dónde agarró la barra, en semanas
    const largo = r.fin - r.inicio;
    ultimo.current = null;

    const mover = (ev: PointerEvent) => {
      const w = semanaEn(ev.clientX);
      if (w == null) return; // sin geometría no se mueve nada: mejor quieto que en la semana 1
      const crudo: RangoSemanas =
        modo === "mover"
          ? { inicio: w - offset, fin: w - offset + largo }
          : modo === "ini"
            ? { inicio: Math.min(w, r.fin), fin: r.fin }
            : { inicio: r.inicio, fin: Math.max(w, r.inicio) };
      const next = acotarRango(crudo);
      ultimo.current = { i, r: next };
      setPreview({ i, r: next });
    };
    const soltar = () => {
      const fin = ultimo.current;
      ultimo.current = null;
      setPreview(null);
      if (fin) onRango(fin.i, fin.r);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  if (!span) return null;
  const total = span.fin - span.inicio + 1;
  const semanas = Array.from({ length: total }, (_, k) => span.inicio + k);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="stl-gantt" ref={raiz} role="table" aria-label={t(lang, "vistaDelPlan")}>
      <div className="stl-gantt-row stl-gantt-head" role="row">
        <div className="stl-gantt-lbl" role="columnheader" />
        <div className="stl-gantt-weeks" style={{ "--stl-gantt-cols": total } as CSSProperties}>
          {semanas.map((w) => (
            <span key={w} className="stl-gantt-wk" role="columnheader">
              {t(lang, "semanaAbrev")}
              {w}
            </span>
          ))}
        </div>
      </div>
      {fases.map((p, i) => {
        const r = rangoDeFase(p);
        const flag = avisoActivo(data, i);
        const detalle = (p.detail ?? "").trim();
        return (
          <div key={i} className="stl-gantt-row" role="row">
            <div className="stl-gantt-lbl" role="rowheader">
              <span className="stl-gantt-titulo">
                <span className="stl-gantt-name">{p.name}</span>
                {/* El mismo ⓘ CSS-only del motor: el detalle de la fase, que en el Gantt no se
                    repite para no duplicar la lista, sigue estando a un hover de distancia. */}
                {detalle && (
                  <span className="stl-tip" data-tip={detalle} tabIndex={0} role="note" aria-label={detalle}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 9v4.5M10 6.4v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
              </span>
              {flag && <span className="stl-phase-flag">{t(lang, "avisoPlanChip")}</span>}
              {/* Sin rango no se inventa una barra: se dice que no hay semanas. */}
              <span className="stl-gantt-rango">{r ? p.duration : t(lang, "sinSemanas")}</span>
            </div>
            <div className="stl-gantt-track" data-cols={total} data-desde={span.inicio}>
              {r && (
                <div
                  className={`stl-gantt-bar${flag ? " is-flag" : ""}${editable && onRango ? " is-draggable" : ""}`}
                  style={{ left: pct(r.inicio - span.inicio), width: pct(r.fin - r.inicio + 1) }}
                  onPointerDown={editable && onRango ? (e) => arrastrar(e, i, r, "mover") : undefined}
                  role="cell"
                  aria-label={`${p.name} — ${p.duration}`}
                >
                  {editable && onRango && (
                    <>
                      <span
                        className="stl-gantt-grip stl-gantt-grip--ini"
                        onPointerDown={(e) => arrastrar(e, i, r, "ini")}
                        aria-hidden
                      />
                      <span
                        className="stl-gantt-grip stl-gantt-grip--fin"
                        onPointerDown={(e) => arrastrar(e, i, r, "fin")}
                        aria-hidden
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {avisoActivo(data, 0) && phases.length > 0 && (
        <p className="stl-phase-aviso stl-gantt-aviso">{t(lang, "avisoPlanLinea")}</p>
      )}
    </div>
  );
};

export const PlanSection: FC<SectionProps<PlanData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const phases = data.phases ?? [];
  const set = (next: Partial<PlanData>) => onChange?.({ ...data, ...next });

  /* La vista es EFÍMERA a propósito: en la propuesta publicada el documento está congelado y
     no hay a dónde escribirla, y su valor es explorar el plan en la reunión. Al recargar
     vuelve a "lista" — que es como se ve hoy, así que ninguna propuesta ya publicada cambia
     de aspecto. Mismo criterio que el check por línea de la Inversión. */
  const [vista, setVista] = useState<"lista" | "gantt">("lista");

  /* En el PDF no hay quién apriete el toggle, así que se imprime la LISTA: es la vista con
     todo el contenido (nombre + semanas + detalle) y el Gantt es una forma de mirar esos
     mismos datos. Esconder una vista en papel solo sería perder contenido si dijera algo que
     la otra no dice — que es lo que pasaba con las píldoras de Hubs. */
  const hayGantt = !ctx.pdfMode && spanDelPlan(phases) != null;
  const enGantt = hayGantt && vista === "gantt";

  return (
    <>
      {hayGantt && (
        <div className="stl-vista-bar" role="group" aria-label={t(lang, "vistaDelPlan")}>
          <button type="button" className={`stl-vista-btn${!enGantt ? " is-on" : ""}`}
            aria-pressed={!enGantt} onClick={() => setVista("lista")}>
            {t(lang, "verEnLista")}
          </button>
          <button type="button" className={`stl-vista-btn${enGantt ? " is-on" : ""}`}
            aria-pressed={enGantt} onClick={() => setVista("gantt")}>
            {t(lang, "verEnGantt")}
          </button>
        </div>
      )}

      {enGantt ? (
        <PlanGantt
          phases={phases}
          data={data}
          lang={lang}
          editable={editable}
          /* Arrastrar reescribe las DOS caras: `semanas` (de donde sale la barra) y `duration`
             (lo que el cliente lee en la lista). Si solo se escribiera una, las dos vistas
             contarían planes distintos y el prospecto lo detecta leyendo dos veces. */
          onRango={
            onChange
              ? (i, r) => {
                  const p = phases[i];
                  if (!p) return;
                  set({
                    phases: replaceAt(phases, i, {
                      ...p,
                      semanas: textoSemanas(r),
                      duration: reescribirDuracion(p.duration, r, {
                        singular: t(lang, "semanaSingular"),
                        plural: t(lang, "semanaPlural"),
                      }),
                    }),
                  });
                }
              : undefined
          }
        />
      ) : (
        <SortableItems items={phases} disabled={!editable} onReorder={(next) => set({ phases: next })}
          container={(nodes) => <div>{nodes}</div>}>
          {(p, i, handle) => (
            <div className="stl-item stl-phase">
              {handle}
              {editable && <RemoveBtn onClick={() => set({ phases: removeAt(phases, i) })} />}
              <div className="stl-phase-num">{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div className="stl-phase-head">
                  <Editable as="div" className="stl-phase-name" editable={editable} value={p.name}
                    placeholder="Nombre de la fase…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, name: v }) })} />
                  {avisoActivo(data, i) && <span className="stl-phase-flag">{t(lang, "avisoPlanChip")}</span>}
                </div>
                <Editable as="div" className="stl-phase-duration" editable={editable} value={p.duration}
                  placeholder="Semanas 1-2…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, duration: v }) })} />
                {avisoActivo(data, i) && <p className="stl-phase-aviso">{t(lang, "avisoPlanLinea")}</p>}
                <Editable as="p" className="stl-body" editable={editable} value={p.detail}
                  placeholder="Qué pasa en esta fase…" onCommit={(v) => set({ phases: replaceAt(phases, i, { ...p, detail: v }) })} />
                {/* Solo-editor: el campo que rescata una fase que el Gantt no pudo ubicar
                    ("Mes 4"). Aparece únicamente cuando hace falta, para no pedirle a Ventas
                    que llene un dato que el texto libre ya resolvió. */}
                {editable && !rangoDeFase(p) && (p.duration ?? "").trim() !== "" && (
                  <label className="stl-phase-fix">
                    <span>⚠ No se puede ubicar en la línea de tiempo. Semanas:</span>
                    <input type="text" value={p.semanas ?? ""} placeholder="6-10"
                      onChange={(e) => set({ phases: replaceAt(phases, i, { ...p, semanas: e.target.value }) })} />
                  </label>
                )}
              </div>
            </div>
          )}
        </SortableItems>
      )}

      {editable && !enGantt && (
        <AddBtn label="Agregar fase" onClick={() => set({ phases: appendItem(phases, { name: "", detail: "", duration: "" }) })} />
      )}
      {/* El apagador del aviso vive con la sección, no con la fase: es una decisión sobre el
          documento ("esta propuesta no arranca con un diagnóstico"), no sobre una fila. */}
      {editable && phases.length > 0 && (
        <label className="stl-phase-off">
          <input type="checkbox" checked={(data.avisoFase1 ?? "") !== "no"}
            onChange={(e) => set({ avisoFase1: e.target.checked ? "" : "no" })} />
          <span>Avisar que la primera etapa puede mover las fechas siguientes</span>
        </label>
      )}
    </>
  );
};

/* ── 7) Inversión ────────────────────────────────────────────────────────────
   Ya NO vive acá. Las dos secciones de inversión que convivían bajo la misma key —las 2
   tarjetas fijas de HubSpot y la tabla con total de sitio web— se unificaron en
   `InvestmentSection` (sections-website.tsx), que lleva adentro la rama legacy con estas
   mismas tarjetas para que lo ya publicado se siga viendo igual. */

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
    border: `1px solid ${active ? "#0B58D3" : "rgba(0,0,0,0.14)"}`,
    background: active ? "rgba(11,88,211,0.10)" : "#fff",
    color: active ? "#0B58D3" : "#6b7280",
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
        placeholder="¿[Pregunta sobre el dolor del cliente]?" onCommit={(v) => set({ headline: v })} />
      <Editable as="p" className="stl-lead" editable={editable} value={data.subhead}
        placeholder="Aterriza la pregunta en su operación — sin venderte de más…" onCommit={(v) => set({ subhead: v })} />
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
