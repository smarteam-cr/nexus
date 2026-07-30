/**
 * components/landing/configs/propuesta.ts — mapa sectionType → Component de la
 * PROPUESTA. Espeja `configs/roles.ts`; las defs server-safe viven en
 * `propuesta.defs.ts`.
 *
 * Reusa los renderers de roles para todo salvo la oferta económica: si mañana
 * cambia el componente de una sección compartida, la propuesta lo hereda sola.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { PROPUESTA_SECTION_DEFS } from "./propuesta.defs";
import { toSectionDef } from "./templates";
import {
  RoleHeroSection,
  RoleProseSection,
  RoleResponsibilitiesSection,
  RoleSuccessSection,
  RoleFailureSection,
  RoleWigSection,
  RoleLeadSection,
} from "../sections-roles";
import {
  PropuestaEconomicaSection,
  PropuestaSesionesSection,
  PropuestaSmarteamSection,
} from "../sections-propuesta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PROPUESTA_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  role_hero: RoleHeroSection,
  role_prose: RoleProseSection,
  role_cards: RoleResponsibilitiesSection,
  role_success: RoleSuccessSection,
  role_failure: RoleFailureSection,
  role_wig: RoleWigSection,
  role_lead: RoleLeadSection,
  // Mismo `sectionType` que en roles, OTRO componente: la propuesta las muestra
  // en rejilla de 2 columnas. El mapa es por plantilla, así que los perfiles de
  // puesto conservan su escalera vertical.
  role_cadence: PropuestaSesionesSection,
  propuesta_smarteam: PropuestaSmarteamSection,
  propuesta_oferta: PropuestaEconomicaSection,
};

const PROPUESTA_LANDING_CONFIG: LandingConfig = {
  type: "propuesta",
  sections: PROPUESTA_SECTION_DEFS.map((d) => toSectionDef(d, PROPUESTA_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

export function landingConfigForPropuesta(): LandingConfig {
  return PROPUESTA_LANDING_CONFIG;
}
