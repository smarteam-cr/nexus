/**
 * components/landing/configs/kickoff.ts
 *
 * Lado CLIENT del registry del Kickoff: mapa `sectionType → componente` +
 * `landingConfigForKickoff()`. Espeja `configs/templates.ts` (BC) y reusa su
 * `toSectionDef`. Las defs server-safe viven en `kickoff.defs.ts`.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { KICKOFF_SECTION_DEFS } from "./kickoff.defs";
import { toSectionDef } from "./templates";
import EquipoSection from "@/components/canvas/kickoff-sections/EquipoSection";
import HorariosSection from "@/components/canvas/kickoff-sections/HorariosSection";
import CanalesSection from "@/components/canvas/kickoff-sections/CanalesSection";
import {
  KickoffHeroSection,
  KickoffProseSection,
  KickoffComparaSection,
  KickoffTimelineSection,
  KickoffProcesosSection,
  KickoffCtaSection,
} from "@/components/canvas/kickoff-sections/KickoffSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KICKOFF_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  kickoff_hero: KickoffHeroSection,
  kickoff_prose: KickoffProseSection,
  kickoff_compara: KickoffComparaSection,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kickoff_equipo: EquipoSection as FC<SectionProps<any>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kickoff_horarios: HorariosSection as FC<SectionProps<any>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kickoff_canales: CanalesSection as FC<SectionProps<any>>,
  kickoff_timeline: KickoffTimelineSection,
  kickoff_procesos: KickoffProcesosSection,
  kickoff_cta: KickoffCtaSection,
};

const KICKOFF_LANDING_CONFIG: LandingConfig = {
  type: "kickoff",
  sections: KICKOFF_SECTION_DEFS.map((d) => toSectionDef(d, KICKOFF_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del kickoff (todas las secciones en orden canónico). El workspace
 *  reordena las de CONTENIDO por el orden vivo de CanvasSection e inserta las pinneadas
 *  en su posición fija; la vista externa la usa tal cual. */
export function landingConfigForKickoff(): LandingConfig {
  return KICKOFF_LANDING_CONFIG;
}
