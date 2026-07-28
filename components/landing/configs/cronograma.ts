/**
 * components/landing/configs/cronograma.ts
 *
 * Lado CLIENT del registry del documento Cronograma: mapa `sectionType → componente` +
 * `landingConfigForCronograma()`. Espeja `configs/kickoff.ts` y reusa su `toSectionDef`.
 * Las defs server-safe viven en `cronograma.defs.ts`.
 *
 * A diferencia de los demás, este config NO se reordena: sus dos secciones no cuelgan de
 * `CanvasSection`, así que no hay orden vivo que respetar ni nada que arrastrar.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { CRONOGRAMA_SECTION_DEFS } from "./cronograma.defs";
import { toSectionDef } from "./templates";
import {
  CronogramaHeroSection,
  CronogramaTimelineSection,
} from "@/components/canvas/cronograma-sections/CronogramaSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CRONOGRAMA_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  cronograma_hero: CronogramaHeroSection,
  cronograma_gantt: CronogramaTimelineSection,
};

const CRONOGRAMA_LANDING_CONFIG: LandingConfig = {
  type: "cronograma",
  sections: CRONOGRAMA_SECTION_DEFS.map((d) =>
    toSectionDef(d, CRONOGRAMA_SECTION_COMPONENTS),
  ).filter((s): s is SectionDef => s !== null),
};

/** Config completa del documento: portada + Gantt, en ese orden y sin variantes. */
export function landingConfigForCronograma(): LandingConfig {
  return CRONOGRAMA_LANDING_CONFIG;
}
