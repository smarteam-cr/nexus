/**
 * components/landing/configs/business-case.ts
 *
 * Compat: `BUSINESS_CASE_LANDING` es la config del template "hubspot_v1" del
 * registry (configs/templates.ts). Los renderers viven en SECTION_COMPONENTS;
 * la composición en BC_TEMPLATES (configs/templates.defs.ts). El agente (server)
 * NO importa esto: importa templates.defs.ts / business-case.defs.ts.
 */
import type { LandingConfig, SectionDef } from "../types";
import { HUBSPOT_TEMPLATE_ID } from "@/lib/business-cases/case-types";
import { landingConfigFor } from "./templates";

export const BUSINESS_CASE_LANDING: LandingConfig = landingConfigFor(HUBSPOT_TEMPLATE_ID);

/** Lookup rápido por key (lo usa el motor). */
export const BC_SECTION_BY_KEY: Record<string, SectionDef> = Object.fromEntries(
  BUSINESS_CASE_LANDING.sections.map((s) => [s.key, s]),
);
