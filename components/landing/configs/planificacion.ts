/**
 * components/landing/configs/planificacion.ts
 *
 * Lado CLIENT del registry del canvas "Planificación". Espeja `configs/exploracion.ts`.
 * Las defs server-safe viven en `planificacion.defs.ts`.
 *
 * CERO componentes nuevos: hero sobrio interno (Desarrollo), motor de diagramas para la
 * arquitectura, mapeo de procesos para el rediseño, métricas para el éxito, prosa para
 * roadmap/ciclo de vida/rutinas/olas, y el CTA del kickoff para el cierre.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { PLANIFICACION_SECTION_DEFS } from "./planificacion.defs";
import { toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { ProcessMappingSection } from "../sections-shared";
import { RoiSection } from "../sections";
import { DiagramSection } from "../sections-diagram";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANIFICACION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  planificacion_hero: DesarrolloHeroSection,
  planificacion_cta: KickoffCtaSection,
  diagram: DiagramSection,
  kickoff_prose: KickoffProseSection,
  process_mapping: ProcessMappingSection,
  roi: RoiSection,
};

const PLANIFICACION_LANDING_CONFIG: LandingConfig = {
  type: "planificacion",
  sections: PLANIFICACION_SECTION_DEFS.map((d) => toSectionDef(d, PLANIFICACION_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Planificación (orden canónico). */
export function landingConfigForPlanificacion(): LandingConfig {
  return PLANIFICACION_LANDING_CONFIG;
}
