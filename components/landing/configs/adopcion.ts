/**
 * components/landing/configs/adopcion.ts
 *
 * Lado CLIENT del registry del PLAN DE ADOPCIÓN: mapa `sectionType → componente` + `landingConfigForAdopcion()`. Espeja
 * `configs/desarrollo.ts`. Las defs server-safe viven en `adopcion.defs.ts`.
 *
 * Sin componentes nuevos: la portada es la del requerimiento técnico, el cierre el de siempre, la prosa `kickoff_prose`,
 * y las tablas y las tarjetas con ícono son los renderers de las secciones creables (`COMPONENTES_CREABLES`), los mismos
 * que pinta una sección «Tabla» creada a mano.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { ADOPCION_SECTION_DEFS } from "./adopcion.defs";
import { COMPONENTES_CREABLES, toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { KickoffCtaSection, KickoffProseSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { TABLA_TYPE, TARJETAS_TYPE } from "@/lib/landing/catalogo-de-secciones";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ADOPCION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  desarrollo_hero: DesarrolloHeroSection,
  desarrollo_cta: KickoffCtaSection,
  kickoff_prose: KickoffProseSection,
  [TABLA_TYPE]: COMPONENTES_CREABLES[TABLA_TYPE],
  [TARJETAS_TYPE]: COMPONENTES_CREABLES[TARJETAS_TYPE],
};

const ADOPCION_LANDING_CONFIG: LandingConfig = {
  type: "adopcion",
  sections: ADOPCION_SECTION_DEFS.map((d) => toSectionDef(d, ADOPCION_SECTION_COMPONENTS)).filter((s): s is SectionDef => s !== null),
};

/** Config completa del plan de adopción (todas las secciones en orden canónico). */
export function landingConfigForAdopcion(): LandingConfig {
  return ADOPCION_LANDING_CONFIG;
}
