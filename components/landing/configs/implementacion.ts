/**
 * components/landing/configs/implementacion.ts
 *
 * Lado CLIENT del registry del canvas "Implementación". Las defs server-safe viven en
 * `implementacion.defs.ts`. UN solo componente propio (`prompts_breeze`); el resto
 * reusa el catálogo: props_table (Desarrollo), process_mapping, prosa del kickoff,
 * hero sobrio interno y CTA de cierre.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { IMPLEMENTACION_SECTION_DEFS } from "./implementacion.defs";
import { toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { PropsTableSection } from "@/components/canvas/desarrollo-sections/PropsTableSection";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { ProcessMappingSection } from "../sections-shared";
import { PromptsBreezeSection } from "@/components/canvas/implementacion-sections/PromptsBreezeSection";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const IMPLEMENTACION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  implementacion_hero: DesarrolloHeroSection,
  implementacion_cta: KickoffCtaSection,
  props_table: PropsTableSection,
  process_mapping: ProcessMappingSection,
  kickoff_prose: KickoffProseSection,
  // El único propio.
  prompts_breeze: PromptsBreezeSection,
};

const IMPLEMENTACION_LANDING_CONFIG: LandingConfig = {
  type: "implementacion",
  sections: IMPLEMENTACION_SECTION_DEFS.map((d) => toSectionDef(d, IMPLEMENTACION_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Implementación (orden canónico). */
export function landingConfigForImplementacion(): LandingConfig {
  return IMPLEMENTACION_LANDING_CONFIG;
}
