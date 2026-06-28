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
 *
 * Reusa los motion hooks del kickoff (useReveal / useHeroParallax) buscando
 * `.reveal` / `.hero-backdrop` dentro del contenedor.
 */
import { useEffect, useRef } from "react";
import { useReveal, useHeroParallax } from "../canvas/useLandingMotion";
import { Editable } from "./inline";
import type { LandingConfig, LandingContext } from "./types";

export interface LandingSectionData {
  key: string;
  data: unknown;
  /** Override del brief del agente (Fase B). null/undefined → usa el brief de la config. */
  brief?: string | null;
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

export default function LandingView({
  config,
  ctx,
  sections,
  mode = "read",
  showBriefs = true,
  onSectionChange,
  onBriefChange,
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
  // Modo edición: controles por sección (IA / confirmar / estado) que el workspace
  // inyecta en la esquina de cada sección. No se usa en el render externo (read).
  renderOverlay?: (key: string) => React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  useReveal(rootRef, [sections.length, mode]);
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

  return (
    <div className="stl" ref={rootRef}>
      {config.sections.map((def) => {
        const sec = byKey.get(def.key);
        const raw = sec?.data;
        const briefOverride = sec?.brief;
        const effectiveBrief = briefOverride != null ? briefOverride : (def.brief ?? "");
        const data = {
          ...(def.empty as Record<string, unknown>),
          ...((raw as Record<string, unknown>) ?? {}),
        };
        // En lectura, omitir secciones sin contenido (no se publicó / no se confirmó).
        if (!editable && isBlank(data)) return null;
        const isHero = !!def.backdrop;
        const Comp = def.Component;
        return (
          <section
            key={def.key}
            ref={isHero ? heroRef : undefined}
            className={`stl-sec stl-${def.theme}${isHero ? " hero-backdrop" : ""}`}
          >
            {editable && renderOverlay && (
              <div className="stl-overlay">{renderOverlay(def.key)}</div>
            )}
            <div className={`stl-wrap${editable ? "" : " reveal"}`}>
              {!def.selfTitled && (
                <header className="stl-sec-head">
                  {def.eyebrow && <span className="stl-eyebrow">{def.eyebrow}</span>}
                  <h2 className="stl-title">{def.label}</h2>
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
      })}
    </div>
  );
}
