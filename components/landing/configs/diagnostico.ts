/**
 * components/landing/configs/diagnostico.ts
 *
 * Lado CLIENT del registry del canvas "Diagnóstico": mapa `sectionType → componente` +
 * `landingConfigForDiagnostico()`. Espeja `configs/exploracion.ts`. Las defs server-safe
 * viven en `diagnostico.defs.ts`.
 *
 * CERO componentes nuevos: las 8 secciones activas se rinden con renderers YA
 * construidos del motor —
 *   · `hero` del Business Case (de cara al cliente: brand row + portada),
 *   · `process_mapping` para el "cómo operás hoy vs cómo vas a operar",
 *   · `roi` (métricas grandes) para la escala 1-5,
 *   · `pain` para las causas, `web_diagnosis` para la brecha,
 *   · `kickoff_prose` para contexto/recomendaciones (y las legacy solo-lectura),
 *   · `kickoff_cta` para el cierre.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { DIAGNOSTICO_SECTION_DEFS } from "./diagnostico.defs";
import { toSectionDef } from "./templates";
import { HeroSection, PainSection } from "../sections";
import { WebDiagnosisSection } from "../sections-website";
import { ProcessMappingSection } from "../sections-shared";
import { RoiSection } from "../sections";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DIAGNOSTICO_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  hero: HeroSection,
  kickoff_prose: KickoffProseSection,
  process_mapping: ProcessMappingSection,
  roi: RoiSection,
  pain: PainSection,
  web_diagnosis: WebDiagnosisSection,
  kickoff_cta: KickoffCtaSection,
};

const DIAGNOSTICO_LANDING_CONFIG: LandingConfig = {
  type: "diagnostico",
  sections: DIAGNOSTICO_SECTION_DEFS.map((d) => toSectionDef(d, DIAGNOSTICO_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Diagnóstico (todas las secciones en orden canónico). */
export function landingConfigForDiagnostico(): LandingConfig {
  return DIAGNOSTICO_LANDING_CONFIG;
}
