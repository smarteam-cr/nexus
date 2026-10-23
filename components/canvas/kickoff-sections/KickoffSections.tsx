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
import { CardGrid } from "@/components/landing/card-grid";
import { PartesDeLaSeccion } from "@/components/landing/partes";
import { ProsaConDiseno } from "@/components/landing/prosa-con-diseno";
import { HeroUploadButtons, BrandRow, TagRow, HeroStatFecha, FilaDeDatos } from "@/components/landing/hero-parts";
import { CtaEditor, CtaButton } from "@/components/landing/sections";
import { resolveHeroTitle } from "@/lib/landing/hero-title";
import { landingLang, t } from "@/components/landing/i18n";
import type { DisenoDeProsa, SectionProps } from "@/components/landing/types";
import { Prose, InlineMD } from "@/components/landing/prose";
import { IconCheck } from "@/components/ui/AcceptReject";
import { DiagramStatic } from "@/components/landing/diagram-static";
import { DiagramaResponsive } from "@/components/landing/diagram-responsive";
import TimelineSection from "@/components/canvas/TimelineSection";
import { fmtFull } from "@/lib/timeline/weeks";
import { arranqueSugerido, ymdDeFechaLocal } from "@/lib/timeline/fecha-de-arranque";
import {
  cronogramaParaLaFila,
  cronogramaVacio,
  datosEfectivos,
  plegarMetricas,
  resolverDatos,
} from "@/lib/kickoff/datos-de-la-portada";
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
/** La ayuda de la intro según el diseño: en el desafío es una pregunta, en el enfoque una frase. */
const AYUDA_DE_LA_INTRO: Record<DisenoDeProsa, string> = {
  tarjetas: "Una frase que enmarca la sección…",
  datos: "Una frase que enmarca la sección…",
  numerada: "La pregunta que lo resume…",
  check: "Una frase que enmarca la sección…",
  enfoque: "El enfoque en una frase…",
};

export const KickoffProseSection: FC<SectionProps<ProseData>> = ({ data, editable, onChange, sectionDiseno }) => {
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

  /* ⛔ Se escribe sobre la data CRUDA, no sobre la normalizada (2026-10-23): `normalizeProse` se queda solo con su forma,
     y escribir `{ ...d, ...next }` borraba en silencio todo lo que vive fuera de ella — la marca de revisión del enfoque
     (`revisadaAt`), las piezas (`__partes`), el módulo de la biblioteca. Editar una frase del enfoque ya revisado lo
     devolvía a sugerencia sin que nadie lo notara. */
  const base: Record<string, unknown> = { ...((data ?? {}) as unknown as Record<string, unknown>) };
  delete base.__legacyMd;
  const set = (next: Record<string, unknown>) => onChange?.({ ...base, ...next } as unknown as ProseData);
  const items = d.items;
  const diseno: DisenoDeProsa = sectionDiseno ?? "tarjetas";
  const introGrande = diseno === "numerada" || diseno === "enfoque";

  return (
    <>
      {/* Las piezas (2026-10-23): el subtítulo, la intro y el cuerpo se arrastran y se quitan como un ítem; una vacía no
          deja hueco en edición y se agrega con «+». ⭐ El SUBTÍTULO se pinta ACÁ o el chat diría «aplicado» sobre algo
          invisible — el defecto que `TarjetasData.intro` ya tiene documentado. */}
      <PartesDeLaSeccion
        data={base}
        editable={editable}
        onCambios={(cambios) => set(cambios)}
        className={`stl-partes-prosa stl-partes-${diseno}`}
        partes={[
          {
            id: "subhead",
            rotulo: "Subtítulo",
            opcional: true,
            conContenido: !!d.subhead?.trim(),
            alQuitar: { subhead: "" },
            render: () => (
              <Editable
                as="p"
                className="stl-lead"
                editable={editable}
                value={d.subhead ?? ""}
                placeholder="Subtítulo…"
                onCommit={(v) => set({ subhead: v })}
              />
            ),
          },
          {
            id: "intro",
            rotulo: "Introducción",
            opcional: true,
            conContenido: !!d.intro?.trim(),
            alQuitar: { intro: "" },
            render: () => (
              <Editable
                as="p"
                className={introGrande ? "stl-prosa-pregunta" : "stl-prose"}
                editable={editable}
                value={d.intro ?? ""}
                placeholder={AYUDA_DE_LA_INTRO[diseno]}
                onCommit={(v) => set({ intro: v })}
              />
            ),
          },
          {
            id: "cuerpo",
            rotulo: "Puntos",
            conContenido: items.length > 0 || !!d.compara,
            render: () => (
              <div>
                {/* Las tarjetas de siempre (kickoff y los demás); el diagnóstico elige su diseño por la definición. */}
                {diseno === "tarjetas" ? (
                  <CardGrid
                    items={items}
                    editable={editable}
                    onItems={(next) => set({ items: next })}
                    columnas={2}
                    addLabel="Agregar punto"
                    placeholderTitulo="Título corto…"
                    placeholderDetalle="Una línea que lo explique…"
                  />
                ) : (
                  <ProsaConDiseno diseno={diseno} items={items} editable={editable} onItems={(next) => set({ items: next })} />
                )}
                {d.compara && <ComparaBlock c={d.compara} />}
              </div>
            ),
          },
        ]}
      />
      {!editable && proseIsEmpty(d) && <p className="stl-prose" style={{ color: "var(--text-muted)" }}>—</p>}
    </>
  );
};

// ── Hero (bienvenida) ────────────────────────────────────────────────────────
// Compuesto con las MISMAS primitivas que el hero del Business Case
// (`components/landing/hero-parts.tsx`): portada, logo del cliente, brand-row
// arrastrable y chips de tags. Diferencias del kickoff: centrado, con eyebrow, y
// con la fila de datos clave (lib/kickoff/datos-de-la-portada.ts).
export const KickoffHeroSection: FC<SectionProps<KickoffHeroData>> = ({
  data, ctx, editable, onChange, sectionTitle, sectionEyebrow,
}) => {
  const d = normalizeHero(data);
  const isLegacy = !!d.__legacyMd;
  const canEdit = !!editable && !isLegacy; // legacy = read-only hasta regenerar
  const set = (next: Partial<KickoffHeroData>) => {
    const { __legacyMd: _omit, intro: _intro, ...clean } = d;
    void _omit;
    void _intro; // al guardar migramos `intro` → `subhead` (no lo re-escribimos)
    onChange?.({ ...clean, ...next });
  };

  const lang = landingLang(ctx.lang);
  /* De dónde salen los números de la fila: el cronograma que esta superficie puede ver (el vivo en el
     editor y el PDF, el publicado en la vista del cliente) y, si ese no aporta nada, la portada que se
     congeló al «Subir» (cronograma sin publicar u oculto del kickoff). Así el cliente ve los números
     que el CSE vio, y no una fila vacía. */
  const cronoVisible = cronogramaParaLaFila(ctx.kickoff?.timeline);
  const cronoDeLaFila = cronogramaVacio(cronoVisible) && ctx.kickoff?.portada ? ctx.kickoff.portada : cronoVisible;
  const datos = datosEfectivos(d);
  const resueltos = resolverDatos(
    datos,
    cronoDeLaFila,
    {
      duracion: t(lang, "duracionTotal"),
      arranque: t(lang, "arranque"),
      fases: t(lang, "hojaDeRuta"),
      semanas: t(lang, "semanas"),
      fase: t(lang, "fase"),
      fasesPlural: t(lang, "fases"),
      porDefinir: t(lang, "porDefinir"),
    },
    fmtFull,
  );
  // Sin arranque, el calendario PROPONE la reunión de kickoff (o hoy). Proponer no escribe.
  const sugerida = ctx.kickoff?.onSetArranque
    ? arranqueSugerido(ctx.kickoff.arranqueDeLaReunion, ymdDeFechaLocal(new Date()))
    : null;

  // El respaldo sale del documento (rótulo declarado en su definición), no de un texto
  // escrito acá: es lo que impide que una portada le preste su identidad a otra.
  const eyebrow = d.eyebrow?.trim() || (sectionEyebrow ?? "").trim();
  const { titulo, bajada } = resolveHeroTitle({
    escrito: d.titulo, titular: d.headline, rotulo: sectionTitle,
  });

  return (
    <div className="stl-hero-centered" style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <HeroUploadButtons ctx={ctx} coverImageUrl={d.coverImageUrl} onCover={(url) => set({ coverImageUrl: url })} />
        </div>
      )}
      <BrandRow
        brands={d.brands}
        ctx={ctx}
        editable={canEdit}
        onChange={(next) => set({ brands: next })}
        logoScale={d.logoScale}
        onLogoScale={(pct) => set({ logoScale: pct ?? undefined })}
      />
      {canEdit ? (
        <Editable as="span" className="eyebrow" editable value={d.eyebrow ?? ""} placeholder={sectionEyebrow ?? ""} onCommit={(v) => set({ eyebrow: v })} />
      ) : (
        eyebrow && <span className="eyebrow">{eyebrow}</span>
      )}
      {canEdit ? (
        <Editable
          as="h1"
          className="stl-hero-title"
          editable
          value={titulo}
          placeholder={sectionTitle ?? ""}
          onCommit={(v) => set({ titulo: v })}
        />
      ) : (
        <h1 className="stl-hero-title">{titulo}</h1>
      )}
      {/* El titular del caso, cuando NO subió a título. */}
      {(canEdit || bajada) && (
        <div style={{ maxWidth: 640, marginInline: "auto" }}>
          <Editable as="p" className="stl-lead" editable={canEdit} value={bajada}
            placeholder="El titular del caso en una frase…"
            onCommit={(v) => set({ titulo, headline: v })} />
        </div>
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
      {/* ⭐ La FILA DE DATOS CLAVE (2026-10-20): una lista que se edita como las etiquetas —agregar
          «3 integraciones», quitar el que no aplica, editar texto y rótulo, reordenar—, con los
          tres de siempre (duración, arranque, fases) saliendo del cronograma mientras nadie los
          pise. La lógica vive en lib/kickoff/datos-de-la-portada.ts; el número de arranque es el
          calendario que mueve el ancla del cronograma (una sola fecha para el kickoff, el
          cronograma y el enlace del cliente).
          El editor, la vista del cliente y el PDF pasan por este mismo bloque: lo que cambia es de
          dónde salen los números (`cronoDeLaFila`), no cómo se pintan. */}
      {/* Un hero heredado (markdown) es de solo lectura, pero conserva su fila: la vista del cliente
          de los kickoffs viejos siempre la mostró. */}
      <FilaDeDatos
        datos={datos}
        resueltos={resueltos}
        editable={canEdit}
        onChange={(next) => set(plegarMetricas(next))}
        fecha={
          ctx.kickoff?.onSetArranque
            ? (r) => (
                <HeroStatFecha
                  valor={ctx.kickoff?.timeline?.anchorStartDate?.slice(0, 10) ?? null}
                  etiqueta={r.valor}
                  sugerida={sugerida}
                  onCambiar={async (ymd) => {
                    await ctx.kickoff!.onSetArranque!(ymd);
                    // La fecha real manda: un texto escrito antes (a mano o por chat) dejaría de coincidir.
                    const conTexto = datos.some((x) => x.fuente === "arranque" && x.valor?.trim());
                    if (conTexto) set(plegarMetricas(datos.map((x) => (x.fuente === "arranque" ? { ...x, valor: "" } : x))));
                  }}
                />
              )
            : undefined
        }
      />
    </div>
  );
};

// ── Hoy vs Con el sistema (sección propia, editable) ──────────────────────────
export const KickoffComparaSection: FC<SectionProps<ComparaData>> = ({
  data,
  editable,
  onChange,
  sectionRotulosDeListas,
}) => {
  const d = normalizeCompara(data);
  /* ⭐ Los rótulos salen de la DEFINICIÓN, que ya los declaraba para la línea del acuerdo del chat
     («se agrega X a la lista «Hoy»»). Estaban escritos a mano acá también: dos copias del mismo
     rótulo, y el día que una cambie la cajita prometería una columna y la página mostraría otra. */
  const rotulo = (k: "hoy" | "conSistema", porDefecto: string) =>
    sectionRotulosDeListas?.[k]?.trim() || porDefecto;
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
        {col("hoy", d.hoy, "stl-compare-now", rotulo("hoy", "Hoy"), "Cómo opera hoy (una línea)…")}
        {col("conSistema", d.conSistema, "stl-compare-future", rotulo("conSistema", "Con el sistema"), "Cómo va a operar (una línea)…")}
      </div>
    </div>
  );
};

/** Procesos: más ancho que la prosa — los diagramas necesitan lienzo.
 *  Rinden su propia sección (se alimentan del contexto), así que repiten el contenedor
 *  del motor. Se lee del MISMO token para que ensanchar la página no los deje angostos:
 *  antes era un número propio y quedaba desalineado con las secciones de al lado. */
const PROCESOS_MAXW = "var(--stl-w-pagina)";
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

// ── Cronograma (ctxDriven: rinde su propia sección o null) ─────────────────────
// El chrome de edición (ocultar / colapsar / arrastrar) lo pone el MOTOR (LandingView),
// igual que en cualquier otra sección — antes cada una traía su propio `HideWrap`.
export const KickoffTimelineSection: FC<SectionProps<unknown>> = ({ ctx, sectionTitle, sectionEyebrow }) => {
  const timeline = ctx.kickoff?.timeline;
  if (!timeline?.exists || (timeline.phases?.length ?? 0) === 0) return null;
  // Scope MÍNIMO del CSS legacy: TimelineSection (archivo caliente de la otra PC)
  // sigue usando las clases base de kickoff-landing.css (section-light, eyebrow,
  // font-display, reveal + vars del root). Este wrapper es lo único que queda del
  // `.kickoff-landing` que antes envolvía al motor entero; se borra en la pasada
  // coordinada que re-tokenice TimelineSection (anotada en DECISIONS).
  return (
    <div className="kickoff-landing">
      {/* El título y el rótulo bajan desde el motor: acá estaban escritos a mano DOS niveles más
          adentro, así que renombrar la sección no se veía. */}
      <TimelineSection
        phases={timeline.phases}
        anchor={timeline.anchorStartDate ?? null}
        titulo={sectionTitle}
        rotulo={sectionEyebrow}
        pdf={ctx.pdfMode}
      />
    </div>
  );
};

// ── Procesos (ctxDriven: rinde su propia sección o null) ───────────────────────
export const KickoffProcesosSection: FC<SectionProps<unknown>> = ({
  ctx,
  editable,
  sectionTitle,
  sectionEyebrow,
}) => {
  const procesos = ctx.kickoff?.procesos ?? [];
  const onStatus = ctx.kickoff?.onProcesoStatusChange;
  if (!procesos.length) return null;
  /* ⭐ El motor YA le pasaba estos dos a todas las secciones, y ésta los ignoraba escribiendo los
     mismos textos a mano. Con eso, renombrar «Procesos» desde el chat decía «aplicado» y no
     cambiaba nada en pantalla: el título viajaba hasta acá y se descartaba. */
  return (
    <section className="section-soft" style={{ padding: SECTION_PAD }}>
      <div style={{ maxWidth: PROCESOS_MAXW, margin: "0 auto" }}>
        <span className="eyebrow reveal">{sectionEyebrow?.trim() || "Cómo trabajamos"}</span>
        <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
          {sectionTitle?.trim() || "Nuestros procesos"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {procesos.map((p) => (
            <div key={p.id} className="reveal">
              {editable && p.status && <ProcesoStatusBar status={p.status} onConfirm={onStatus ? (c) => onStatus(p.id, c) : undefined} />}
              {p.title && <h3 className="font-display" style={{ fontSize: 18, color: "var(--text)", marginBottom: 10 }}>{p.title}</h3>}
              {ctx.pdfMode ? (
                /* PDF (Puppeteer): SVG estático y SÍNCRONO. `FlowchartViewer` monta con
                   `ssr:false` y el export dispara en cuanto las fuentes y las imágenes están
                   listas — el canvas de React Flow todavía no existe, así que se imprimiría
                   el ESQUELETO en vez del proceso. Mismo tratamiento que sections-diagram.
                   Sin alto fijo a propósito: `DiagramStatic` se dimensiona solo, y meterlo en
                   una caja de `min(72vh,780px)` con overflow lo recortaría. Además `vh` en el
                   PDF se resuelve contra el viewport del runner (1600px), no contra la hoja. */
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff" }}>
                  <DiagramStatic diagram={toFlowchartData(p)} />
                </div>
              ) : (
                <DiagramaResponsive diagram={toFlowchartData(p)} alto="min(72vh, 780px)">
                  <FlowchartViewer data={toFlowchartData(p)} />
                </DiagramaResponsive>
              )}
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
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 700, lineHeight: 1, padding: "4px 10px", borderRadius: 999,
          ...(confirmed
            ? { color: "#047857", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)" }
            : { color: "#b45309", background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)" }),
        }}
      >
        {confirmed ? <><IconCheck className="w-3 h-3" />Visible para el cliente</> : "Borrador — el cliente no lo ve"}
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
  // Naranja de marca como FONDO (a 16px el par AA exige el profundo #C2400F + blanco).
  display: "inline-flex", alignItems: "center", gap: 8, background: "#C2400F",
  color: "#fff", fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: 100,
  textDecoration: "none", boxShadow: "0 8px 26px -10px rgba(232,72,28,0.55)", border: "none", cursor: "pointer",
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
              labelPlaceholder="Agenda la primera sesión…"
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
                  : "El botón se muestra al cliente cuando completas texto y enlace."}
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
