/**
 * components/landing/configs/exploracion.ts
 *
 * Lado CLIENT del registry del canvas "Exploración": mapa `sectionType → componente` +
 * `landingConfigForExploracion()`. Espeja `configs/desarrollo.ts`. Las defs server-safe
 * viven en `exploracion.defs.ts`.
 *
 * REUSO (solo UN componente nuevo): de las 6 secciones de contenido, 5 se rinden con
 * renderers YA construidos del motor —
 *   · la grilla de tarjetas de `pain` (título+detalle) para «Lo que ya sabemos», «A quién
 *     involucrar» y «Qué hay que entender a fondo», cada una con SU rótulo (`crearPainSection`):
 *     antes heredaban «Agregar dolor» del Diagnóstico,
 *   · `web_diagnosis` (supuestos a la izquierda + panel oscuro de consecuencias) para
 *     «Lo que damos por supuesto»,
 *   · el hero de Desarrollo (`headline/subhead/tags`, sin logo ni stats) y el CTA del
 *     kickoff para el cierre.
 * El único propio es `exploracion_sesiones`: su unidad es una SESIÓN con una lista de
 * preguntas adentro, y eso ningún renderer del motor lo expresa.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { EXPLORACION_SECTION_DEFS } from "./exploracion.defs";
import { toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { ExploracionSesionesSection } from "@/components/canvas/exploracion-sections/ExploracionSections";
import { crearPainSection } from "../sections";
import { WebDiagnosisSection } from "../sections-website";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EXPLORACION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  // El hero de Desarrollo sirve tal cual: mismo shape (headline/subhead/tags) y misma
  // sobriedad (sin logo de cliente ni portada) — los dos son documentos internos.
  exploracion_hero: DesarrolloHeroSection,
  exploracion_cta: KickoffCtaSection,
  // Renderers visuales reusados del motor.
  exploracion_datos: crearPainSection({
    addLabel: "Agregar dato",
    placeholderTitulo: "El dato, afirmado…",
    placeholderDetalle: "De dónde salió (handoff, documento, reunión)…",
  }),
  exploracion_personas: crearPainSection({
    addLabel: "Agregar persona",
    placeholderTitulo: "Rol o nombre y rol…",
    placeholderDetalle: "Qué sabe que nadie más sabe y qué le importa…",
  }),
  exploracion_temas: crearPainSection({
    addLabel: "Agregar tema",
    placeholderTitulo: "El tema…",
    placeholderDetalle: "Qué tienes que poder responder para entenderlo de verdad…",
  }),
  web_diagnosis: WebDiagnosisSection,
  // El único propio.
  exploracion_sesiones: ExploracionSesionesSection,
};

const EXPLORACION_LANDING_CONFIG: LandingConfig = {
  type: "exploracion",
  sections: EXPLORACION_SECTION_DEFS.map((d) => toSectionDef(d, EXPLORACION_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Exploración (todas las secciones en orden canónico). */
export function landingConfigForExploracion(): LandingConfig {
  return EXPLORACION_LANDING_CONFIG;
}
