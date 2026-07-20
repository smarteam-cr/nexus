"use client";

/**
 * components/landing/LandingView.tsx
 *
 * MOTOR de render de una landing por secciones estructuradas. Recorre
 * `config.sections` (en orden) y, por cada una, busca su `data` (desde el hook en
 * modo edición, o desde el snapshot publicado en modo lectura), la mergea con el
 * `empty` de la sección y renderiza su `Component`.
 *
 * - `mode="read"`  → render público (cliente): sin handlers, theme-safe (hex literal).
 * - `mode="edit"`  → workspace interno: pasa `editable` + `onChange` por sección.
 *   · `onToggleHidden` → chrome ESTANDARIZADO de ocultar (badge + toggle de ojo,
 *     mismo look que el kickoff — fuente única de estilo entre landings).
 *   · `onReorder` → drag & drop de secciones (dnd-kit, handle ⠿ en el chrome).
 *
 * Reusa los motion hooks del kickoff (useReveal / useHeroParallax) buscando
 * `.reveal` / `.hero-backdrop` dentro del contenedor.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCss } from "@dnd-kit/utilities";
import { useReveal, useHeroParallax } from "../canvas/useLandingMotion";
import { Editable } from "./inline";
import type { LandingConfig, LandingContext, SectionDef } from "./types";

export interface LandingSectionData {
  key: string;
  data: unknown;
  /** Override del brief del agente (Fase B). null/undefined → usa el brief de la config. */
  brief?: string | null;
  /** Título/eyebrow de cara al cliente editados por el CSE. null → default de la config. */
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  /** El CSE ocultó la sección: marcada en el editor, no se publica al cliente. */
  hidden?: boolean;
}

/** Una sección está "en blanco" si todos sus strings y arrays lo están. En lectura
 *  (render externo) se omite, para no mostrar encabezados de secciones sin contenido. */
function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(isBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(isBlank);
  return false;
}

/** Toggle de ojo (mostrar/ocultar al cliente). Heredó el look del HideToggle del
 *  renderer legacy del kickoff (KickoffLanding, borrado en la Ola 4) — hoy esta
 *  es LA fuente de estilo del toggle entre landings. */
function HideToggle({ hidden, label, onToggle }: { hidden: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? `Mostrar ${label} al cliente` : `Ocultar ${label} del cliente`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px",
        borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600, lineHeight: 1,
        border: `1px solid ${hidden ? "rgba(245,158,11,0.6)" : "rgba(0,0,0,0.12)"}`,
        background: hidden ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.92)",
        color: hidden ? "#b45309" : "#6b7280", backdropFilter: "blur(4px)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {hidden ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
        ) : (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      {hidden ? "Oculto" : "Visible"}
    </button>
  );
}

/** Caret ▸/▾ de una sección OCULTA: la colapsa a solo el título, o la vuelve a abrir. */
function CollapseToggle({ collapsed, label, onToggle }: { collapsed: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? `Ver ${label}` : `Contraer ${label}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26,
        borderRadius: 999, cursor: "pointer", fontSize: 11, lineHeight: 1,
        border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.92)", color: "#6b7280",
        backdropFilter: "blur(4px)", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {collapsed ? "▸" : "▾"}
    </button>
  );
}

/** ⓘ junto al título de una sección: hover muestra `def.tip` (tooltip CSS-only,
 *  `[data-tip]` en landing-engine.css). Enfocable por teclado (tabIndex) → el tooltip
 *  también aparece con foco. Additivo: solo se pinta si la def trae `tip` (roles). */
function TipIcon({ text }: { text: string }) {
  return (
    <span className="stl-tip" data-tip={text} tabIndex={0} role="note" aria-label={text}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9.25" />
        <path strokeLinecap="round" d="M12 11.5v4.5" />
        <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

type DragHandleProps = Record<string, unknown> | null;

/** Wrapper sortable de una sección (drag & drop). Hook incondicional adentro →
 *  solo se monta cuando el D&D está activo (modo edición con onReorder). */
function SortableSection({
  id,
  children,
}: {
  id: string;
  children: (handleProps: DragHandleProps, isDragging: boolean) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        // Translate SOLO (sin scale): las secciones tienen alturas muy distintas y
        // un strategy que escale (hoy no; el vertical trae un to-do) las deformaría.
        transform: DndCss.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children({ ...attributes, ...listeners }, isDragging)}
    </div>
  );
}

export default function LandingView({
  config,
  ctx,
  sections,
  mode = "read",
  showBriefs = true,
  onSectionChange,
  onBriefChange,
  onTitleChange,
  onEyebrowChange,
  onToggleHidden,
  onReorder,
  renderOverlay,
}: {
  config: LandingConfig;
  ctx: LandingContext;
  sections: LandingSectionData[];
  mode?: "edit" | "read";
  // Mostrar/editar la guía del agente por sección. Solo la Plantilla (v0) del business
  // case la activa; los casos generados la ocultan. Default true → kickoff sin cambios.
  showBriefs?: boolean;
  onSectionChange?: (key: string, data: unknown) => void;
  // Modo edición: el CSE edita la GUÍA del agente por sección (override persistido).
  onBriefChange?: (key: string, brief: string) => void;
  // Modo edición: el CSE edita el TÍTULO y el EYEBROW de cara al cliente por sección.
  onTitleChange?: (key: string, title: string) => void;
  onEyebrowChange?: (key: string, eyebrow: string) => void;
  // Modo edición: ocultar/mostrar sección (chrome estandarizado estilo kickoff).
  onToggleHidden?: (key: string, hidden: boolean) => void;
  // Modo edición: drag & drop de secciones — recibe las KEYS en el orden nuevo.
  onReorder?: (orderedKeys: string[]) => void;
  // Modo edición: controles por sección (IA / limpiar) que el workspace inyecta en
  // la esquina de cada sección. No se usa en el render externo (read).
  renderOverlay?: (key: string) => React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  // `mode === "edit"` → revelar al instante (sin animación de entrada) y captar el
  // contenido async (cronograma/procesos/cierre del editor) vía MutationObserver.
  useReveal(rootRef, [sections.length, mode], mode === "edit");
  useHeroParallax(heroRef);

  // Red de seguridad: si el IntersectionObserver no dispara (pestaña en segundo
  // plano, observer con hipo), revelamos todo a los 1.5s para NUNCA dejar la
  // página del cliente en blanco. En una pestaña visible el observer revela antes.
  useEffect(() => {
    const t = setTimeout(() => {
      rootRef.current
        ?.querySelectorAll(".reveal:not(.is-visible)")
        .forEach((el) => el.classList.add("is-visible"));
    }, 1500);
    return () => clearTimeout(t);
  }, [sections.length, mode]);

  const byKey = new Map(sections.map((s) => [s.key, s]));
  const editable = mode === "edit";
  const sortEnabled = editable && !!onReorder;

  // Secciones OCULTAS que el CSE desplegó a mano. Efímero (no se persiste): una sección
  // oculta arranca colapsada en cada visita.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  /** Ocultar SIEMPRE colapsa (si no, la sección quedaría abierta y "oculta" a la vez). */
  const setHidden = useCallback(
    (key: string, hide: boolean) => {
      if (hide) setExpanded((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : prev));
      onToggleHidden?.(key, hide);
    },
    [onToggleHidden],
  );

  // Sensor con umbral: un clic normal (editar texto inline) no inicia drag.
  // + teclado en el handle (Enter/Space levanta, flechas mueven) — accesibilidad.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Solo las secciones NO-pinneadas se reordenan (el kickoff pinnea hero/cronograma/
  // procesos/cierre; el BC no pinnea nada → sortableKeys === todas las keys).
  const sortableKeys = config.sections.filter((d) => !d.pinned).map((d) => d.key);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sortableKeys.indexOf(String(active.id));
    const to = sortableKeys.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder?.(arrayMove(sortableKeys, from, to));
  };

  const renderSection = (def: SectionDef, dragHandle: DragHandleProps = null) => {
    const sec = byKey.get(def.key);
    const raw = sec?.data;
    const briefOverride = sec?.brief;
    const effectiveBrief = briefOverride != null ? briefOverride : (def.brief ?? "");
    // Título/eyebrow efectivos: override del CSE gana; si no, el default de la config.
    const effTitle = (sec?.titleOverride ?? "").trim() || def.label;
    const effEyebrow = sec?.eyebrowOverride != null ? sec.eyebrowOverride : (def.eyebrow ?? "");
    const hidden = sec?.hidden === true;
    const data = {
      ...(def.empty as Record<string, unknown>),
      ...((raw as Record<string, unknown>) ?? {}),
    };
    // En lectura, omitir secciones sin contenido o que el CSE ocultó. Las `pinned`
    // (hero/cierre) y `ctxDriven` (cronograma/procesos: se alimentan de ctx, no de
    // data) NUNCA se omiten por isBlank — su Component decide si devuelve null.
    const alwaysRender = def.pinned || def.ctxDriven;
    if (!editable && ((!alwaysRender && isBlank(data)) || hidden)) return null;
    const isHero = !!def.backdrop;
    // Una sección OCULTA se colapsa a su título: el CSE la sigue viendo en su lugar (puede
    // arrastrarla y volver a mostrarla) sin que le coma la pantalla. El caret la despliega.
    const collapsed = editable && hidden && !expanded.has(def.key);
    // Portada con imagen (hero): capa de fondo + degradado a nivel SECCIÓN
    // (hermana de .stl-wrap — dentro del wrap no cubriría el full-bleed).
    const coverUrl =
      isHero && typeof data.coverImageUrl === "string" && data.coverImageUrl.trim()
        ? (data.coverImageUrl as string)
        : null;
    const Comp = def.Component;

    /* Chrome ESTANDARIZADO: badge de oculto + controles del workspace + caret de
       colapsar + toggle de ojo + handle de drag, arriba a la derecha. */
    const chrome = editable && (renderOverlay || onToggleHidden || dragHandle) && (
      <div className="stl-overlay" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {hidden && <span className="stl-hidden-badge">No visible para el cliente</span>}
        {!collapsed && renderOverlay?.(def.key)}
        {hidden && <CollapseToggle collapsed={collapsed} label={effTitle} onToggle={() => toggleExpanded(def.key)} />}
        {onToggleHidden && !def.noHide && (
          <HideToggle hidden={hidden} label={effTitle} onToggle={() => setHidden(def.key, !hidden)} />
        )}
        {dragHandle && (
          <button
            type="button"
            className="stl-drag-handle"
            title="Arrastra para reordenar la sección"
            aria-label={`Reordenar la sección ${effTitle}`}
            {...dragHandle}
          >
            ⠿
          </button>
        )}
      </div>
    );

    /* Barra de una sección colapsada: solo el título, clickeable para desplegarla.
       El cuerpo NO se desmonta (se esconde con display:none) — desmontarlo perdería lo
       que el CSE está tipeando (los campos comitean en `blur`, y un input que se desmonta
       no lo dispara) y re-dispararía los fetch de las secciones curadas al reabrirlas. */
    const collapsedBar = collapsed && (
      <button type="button" className="stl-collapsed-bar" aria-expanded={false} onClick={() => toggleExpanded(def.key)}>
        <span aria-hidden>▸</span>
        <span className="stl-collapsed-title">{effTitle}</span>
      </button>
    );
    const hideWhenCollapsed = collapsed ? ({ display: "none" } as const) : undefined;

    // Secciones `ctxDriven` (kickoff: cronograma/procesos/cierre): se alimentan de ctx, no de
    // data, y rinden su PROPIA sección full-bleed (o `null` si están vacías) — SIN el wrapper
    // `.stl-sec` del motor. En LECTURA se pintan peladas (DOM del cliente idéntico al de antes).
    // En EDICIÓN, las que se pueden ocultar o arrastrar reciben el chrome del motor dentro de un
    // contenedor relativo; `ctxEmpty` evita dejar ese chrome flotando sobre la nada.
    if (def.ctxDriven) {
      const body = (
        <Comp
          data={data}
          ctx={ctx}
          editable={editable}
          onChange={editable ? (d: unknown) => onSectionChange?.(def.key, d) : undefined}
        />
      );
      const needsChrome = editable && (!def.pinned || !def.noHide);
      if (!needsChrome) return <Fragment key={def.key}>{body}</Fragment>;
      if (def.ctxEmpty?.(ctx)) return null; // nada que envolver (sin cronograma / sin procesos)
      return (
        <div key={def.key} className={`stl-ctx-sec${hidden ? " stl-hidden" : ""}${collapsed ? " stl-collapsed" : ""}`}>
          {chrome}
          {collapsedBar}
          <div style={hideWhenCollapsed}>{body}</div>
        </div>
      );
    }

    return (
      <section
        key={def.key}
        ref={isHero ? heroRef : undefined}
        className={`stl-sec stl-${def.theme}${isHero ? " hero-backdrop" : ""}${editable && hidden ? " stl-hidden" : ""}${collapsed ? " stl-collapsed" : ""}`}
      >
        {coverUrl && !collapsed && (
          <div className="stl-sec-cover" style={{ backgroundImage: `url(${coverUrl})` }} aria-hidden />
        )}
        {chrome}
        {collapsed && <div className="stl-wrap">{collapsedBar}</div>}
        <div className={`stl-wrap${editable ? "" : " reveal"}`} style={hideWhenCollapsed}>
          {!def.selfTitled && (
            <header className="stl-sec-head">
              {editable ? (
                <Editable as="span" className="stl-eyebrow" editable value={effEyebrow}
                  placeholder="Eyebrow…" onCommit={(v) => onEyebrowChange?.(def.key, v)} />
              ) : (
                effEyebrow && <span className="stl-eyebrow">{effEyebrow}</span>
              )}
              <div className="stl-title-line">
                {editable ? (
                  <Editable as="h2" className="stl-title" editable value={effTitle}
                    placeholder={def.label} onCommit={(v) => onTitleChange?.(def.key, v)} />
                ) : (
                  <h2 className="stl-title">{effTitle}</h2>
                )}
                {def.tip && <TipIcon text={def.tip} />}
              </div>
            </header>
          )}
          {/* Guía del agente — ayuda EDITABLE solo en la Plantilla del editor (el
              cliente no la ve). El agente la lee al generar. Vacío → brief de la config. */}
          {editable && showBriefs && (def.brief || briefOverride != null) && (
            <Editable
              as="p"
              className="stl-brief"
              editable
              value={effectiveBrief}
              placeholder="Guía para el agente en esta sección…"
              onCommit={(v) => onBriefChange?.(def.key, v)}
            />
          )}
          <Comp
            data={data}
            ctx={ctx}
            editable={editable}
            onChange={editable ? (d: unknown) => onSectionChange?.(def.key, d) : undefined}
          />
        </div>
      </section>
    );
  };

  const body = sortEnabled ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
        {config.sections.map((def) =>
          def.pinned ? (
            // Pinneada: posición fija, sin handle ni wrapper sortable.
            <Fragment key={def.key}>{renderSection(def)}</Fragment>
          ) : (
            <SortableSection key={def.key} id={def.key}>
              {(handleProps) => renderSection(def, handleProps)}
            </SortableSection>
          ),
        )}
      </SortableContext>
    </DndContext>
  ) : (
    config.sections.map((def) => renderSection(def))
  );

  return (
    <div className="stl" ref={rootRef}>
      {body}
    </div>
  );
}
