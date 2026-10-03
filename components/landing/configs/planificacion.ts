/**
 * components/landing/configs/planificacion.ts
 *
 * Lado CLIENT del registry del canvas "Planificación". Espeja `configs/exploracion.ts`.
 * Las defs server-safe viven en `planificacion.defs.ts`.
 *
 * Hero sobrio interno (Desarrollo), motor de diagramas para la arquitectura, prosa para las rutinas
 * y las olas, el CTA del kickoff para el cierre, y desde el 2026-10-02 las secciones propias de la
 * Planificación práctica (sections-planificacion.tsx): procesos paso a paso, ciclo de vida, propiedades
 * por objeto, pipelines, automatizaciones y conversaciones. `roi` queda por la sección retirada de
 * métricas, que se sigue viendo hasta regenerar.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { PLANIFICACION_SECTION_DEFS } from "./planificacion.defs";
import { toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { RoiSection } from "../sections";
import { DiagramSection } from "../sections-diagram";
import {
  ProcesosFuturoSection,
  CicloDeVidaSection,
  PropiedadesObjetoSection,
  PipelinesSection,
  AutomatizacionesSection,
  ConversacionesSection,
} from "../sections-planificacion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANIFICACION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  planificacion_hero: DesarrolloHeroSection,
  planificacion_cta: KickoffCtaSection,
  diagram: DiagramSection,
  kickoff_prose: KickoffProseSection,
  roi: RoiSection,
  procesos_futuro: ProcesosFuturoSection,
  ciclo_vida_tabla: CicloDeVidaSection,
  propiedades_objeto: PropiedadesObjetoSection,
  pipelines_horizontal: PipelinesSection,
  automatizaciones: AutomatizacionesSection,
  conversaciones: ConversacionesSection,
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
