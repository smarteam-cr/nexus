/**
 * components/landing/configs/desarrollo.ts
 *
 * Lado CLIENT del registry del canvas "Desarrollo": mapa `sectionType → componente` +
 * `landingConfigForDesarrollo()`. Espeja `configs/kickoff.ts`. Las defs server-safe
 * viven en `desarrollo.defs.ts`.
 *
 * REUSO (solo piezas existentes, sin componentes nuevos): las 5 secciones de contenido
 * se rinden con renderers VISUALES ya construidos del motor de landing —
 *   · `web_diagnosis` (retos + panel oscuro de consecuencias) para el dolor,
 *   · `roi` (métricas grandes) para los criterios de éxito,
 *   · `tech_architecture` (cadena con flechas) para arquitectura y relación de objetos,
 *   · `pain` (grid de tarjetas) para los disparadores de comunicación.
 * El cierre reusa `KickoffCtaSection`; el hero es propio (`DesarrolloHeroSection`, sin
 * logo/stats). Menos texto, más estructura visual → legible para técnicos y no técnicos.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { DESARROLLO_SECTION_DEFS } from "./desarrollo.defs";
import { toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { RoiSection, PainSection } from "../sections";
import { TechArchitectureSection } from "../sections-shared";
import { WebDiagnosisSection } from "../sections-website";
import { DiagramSection } from "../sections-diagram";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DESARROLLO_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  desarrollo_hero: DesarrolloHeroSection,
  desarrollo_cta: KickoffCtaSection,
  // Renderers visuales reusados del motor (business case / website).
  web_diagnosis: WebDiagnosisSection,
  roi: RoiSection,
  // Motor de diagramas interactivo (arquitectura / relación de objetos).
  // tech_architecture queda registrado por si un canvas viejo aún trae ese sectionType.
  diagram: DiagramSection,
  tech_architecture: TechArchitectureSection,
  pain: PainSection,
};

const DESARROLLO_LANDING_CONFIG: LandingConfig = {
  type: "desarrollo",
  sections: DESARROLLO_SECTION_DEFS.map((d) => toSectionDef(d, DESARROLLO_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Desarrollo (todas las secciones en orden canónico). */
export function landingConfigForDesarrollo(): LandingConfig {
  return DESARROLLO_LANDING_CONFIG;
}
