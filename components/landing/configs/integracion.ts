/**
 * components/landing/configs/integracion.ts
 *
 * Lado CLIENT del registry de la INTEGRACIÓN TÉCNICA: mapa `sectionType → componente` + `landingConfigForIntegracion()`.
 * Espeja `configs/desarrollo.ts`: las secciones prestadas del requerimiento técnico se pintan con SUS renderers, y las
 * cuatro nuevas (alcance firmado, identificador único, mapa de integración y lo que deben entregar) con la tabla genérica
 * del motor (`COMPONENTES_CREABLES`). Las defs server-safe viven en `integracion.defs.ts`.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { INTEGRACION_SECTION_DEFS } from "./integracion.defs";
import { COMPONENTES_CREABLES, toSectionDef } from "./templates";
import { DesarrolloHeroSection } from "@/components/canvas/desarrollo-sections/DesarrolloSections";
import { PropsTableSection } from "@/components/canvas/desarrollo-sections/PropsTableSection";
import { KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { RoiSection, PainSection } from "../sections";
import { WebDiagnosisSection } from "../sections-website";
import { DiagramSection } from "../sections-diagram";
import { TABLA_TYPE } from "@/lib/landing/catalogo-de-secciones";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INTEGRACION_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  desarrollo_hero: DesarrolloHeroSection,
  desarrollo_cta: KickoffCtaSection,
  web_diagnosis: WebDiagnosisSection,
  roi: RoiSection,
  diagram: DiagramSection,
  pain: PainSection,
  props_table: PropsTableSection,
  [TABLA_TYPE]: COMPONENTES_CREABLES[TABLA_TYPE],
};

const INTEGRACION_LANDING_CONFIG: LandingConfig = {
  type: "integracion",
  sections: INTEGRACION_SECTION_DEFS.map((d) => toSectionDef(d, INTEGRACION_SECTION_COMPONENTS)).filter((s): s is SectionDef => s !== null),
};

/** Config completa de la integración técnica (todas las secciones en orden canónico). */
export function landingConfigForIntegracion(): LandingConfig {
  return INTEGRACION_LANDING_CONFIG;
}
