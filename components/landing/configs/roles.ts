/**
 * components/landing/configs/roles.ts
 *
 * Lado CLIENT del registry de Roles: mapa `sectionType → componente` +
 * `landingConfigForRoles()`. Espeja `configs/kickoff.ts` y reusa su `toSectionDef`.
 * Las defs server-safe viven en `roles.defs.ts`.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { ROLE_SECTION_DEFS } from "./roles.defs";
import { toSectionDef } from "./templates";
import {
  RoleHeroSection,
  RoleProseSection,
  RoleResponsibilitiesSection,
  RoleSuccessSection,
  RoleFailureSection,
  RoleMaturitySection,
  RoleWigSection,
  RoleLagSection,
  RoleLeadSection,
  RoleScoreboardSection,
  RoleCadenceSection,
} from "../sections-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ROLES_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  role_hero: RoleHeroSection,
  role_prose: RoleProseSection,
  role_cards: RoleResponsibilitiesSection,
  role_success: RoleSuccessSection,
  role_failure: RoleFailureSection,
  role_maturity: RoleMaturitySection,
  // 4DX: WIG (D1) · predicción/arrastre (D2) · marcador (D3) · cadencia (D4)
  role_wig: RoleWigSection,
  role_lag: RoleLagSection,
  role_lead: RoleLeadSection,
  role_scoreboard: RoleScoreboardSection,
  role_cadence: RoleCadenceSection,
};

const ROLES_LANDING_CONFIG: LandingConfig = {
  type: "roles",
  sections: ROLE_SECTION_DEFS.map((d) => toSectionDef(d, ROLES_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del perfil de puesto (hero + las 12 secciones de `ROLE_SECTIONS`,
 *  orden fijo, con el bloque 4DX en el medio). */
export function landingConfigForRoles(): LandingConfig {
  return ROLES_LANDING_CONFIG;
}
