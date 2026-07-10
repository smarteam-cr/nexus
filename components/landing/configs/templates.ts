/**
 * components/landing/configs/templates.ts
 *
 * Lado CLIENT del registry de templates: registro de renderers por `sectionType`
 * (desacoplado de la key: templates distintos reusan un componente con keys propias)
 * + LandingConfig por template. El agente (server) NUNCA importa esto — usa
 * templates.defs.ts.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import type { BCSectionDef } from "./business-case.defs";
import type { BcTemplateDef } from "./templates.defs";
import { BC_TEMPLATES, templateById } from "./templates.defs";
import {
  HeroSection,
  PainSection,
  BeforeAfterSection,
  SolutionSection,
  RoiSection,
  PlanSection,
  InvestmentSection,
  PartnerSection,
  CtaSection,
} from "../sections";
import { TechArchitectureSection, ProcessMappingSection, UseCasesSection } from "../sections-shared";
import {
  WebDiagnosisSection,
  SiteArchitectureSection,
  WebScopeSection,
  WebMethodologySection,
  WebInvestmentSection,
  WhyUsSection,
} from "../sections-website";

/** Renderers por sectionType. Las 9 entradas históricas usan la key como type
 *  (BCSectionDef.sectionType ausente = la key). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  hero: HeroSection,
  dolores: PainSection,
  antes_despues: BeforeAfterSection,
  solucion: SolutionSection,
  roi: RoiSection,
  cronograma: PlanSection,
  inversion: InvestmentSection,
  partner: PartnerSection,
  cta: CtaSection,
  // Compartidas entre templates
  tech_architecture: TechArchitectureSection,
  process_mapping: ProcessMappingSection,
  use_cases: UseCasesSection,
  // Template sitio web (la Portada reusa "hero"; la sección 4 reusa "tech_architecture")
  web_diagnosis: WebDiagnosisSection,
  site_architecture: SiteArchitectureSection,
  web_scope: WebScopeSection,
  web_methodology: WebMethodologySection,
  web_investment: WebInvestmentSection,
  why_us: WhyUsSection,
};

/** Convierte una def server-safe a SectionDef (con Component) usando un registro de
 *  renderers por sectionType. `components` default = SECTION_COMPONENTS (BC); el kickoff
 *  pasa su propio mapa (KICKOFF_SECTION_COMPONENTS) reusando esta misma función. */
export function toSectionDef(
  d: BCSectionDef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, FC<SectionProps<any>>> = SECTION_COMPONENTS,
): SectionDef | null {
  const Component = components[d.sectionType ?? d.key];
  if (!Component) return null; // def sin renderer registrado → no se renderiza (nunca romper)
  return {
    key: d.key,
    label: d.label,
    eyebrow: d.eyebrow,
    theme: d.theme,
    backdrop: d.backdrop,
    selfTitled: d.selfTitled,
    ctxDriven: d.ctxDriven,
    ctxEmpty: d.ctxEmpty,
    pinned: d.pinned,
    noHide: d.noHide,
    schema: d.schema,
    agentHint: d.agentHint,
    brief: d.brief,
    empty: d.empty,
    Component,
  };
}

function toLandingConfig(tpl: BcTemplateDef): LandingConfig {
  return {
    type: "business-case",
    sections: tpl.sections.map((d) => toSectionDef(d)).filter((s): s is SectionDef => s !== null),
  };
}

const LANDING_CONFIG_BY_TEMPLATE: Record<string, LandingConfig> = Object.fromEntries(
  Object.values(BC_TEMPLATES).map((tpl) => [tpl.id, toLandingConfig(tpl)]),
);

/** Config de landing por templateId, con fallback al template de HubSpot (legacy). */
export function landingConfigFor(templateId?: string | null): LandingConfig {
  return LANDING_CONFIG_BY_TEMPLATE[templateById(templateId).id];
}

/** Sección del snapshot publicado con la presentación congelada (publish, F1+). */
export interface SnapshotSectionMeta {
  key: string;
  label: string;
  sectionType?: string;
  theme?: "dark" | "light" | "soft" | null;
  eyebrow?: string | null;
  selfTitled?: boolean;
  backdrop?: boolean;
}

/**
 * Config para renderizar un SNAPSHOT publicado (render externo): sigue el ORDEN del
 * snapshot y, si una sección ya no existe en la config viva del template, la
 * SINTETIZA desde la presentación congelada + el renderer de `sectionType` — así lo
 * publicado se ve como se publicó aunque el template evolucione (o ante un rollback).
 * Sin renderer registrado → se saltea (comportamiento histórico). Para snapshots
 * cuyo template está intacto, el resultado es idéntico a landingConfigFor().
 */
export function configForSnapshot(
  templateId: string | null | undefined,
  snapSections: SnapshotSectionMeta[],
): LandingConfig {
  const base = landingConfigFor(templateId);
  const byKey = new Map(base.sections.map((s) => [s.key, s]));
  const sections = snapSections
    .map((s) => {
      const known = byKey.get(s.key);
      if (known) return known;
      const Component = SECTION_COMPONENTS[s.sectionType ?? s.key];
      if (!Component) return null;
      const def: SectionDef = {
        key: s.key,
        label: s.label,
        eyebrow: s.eyebrow ?? undefined,
        theme: s.theme ?? "light",
        backdrop: s.backdrop ?? false,
        selfTitled: s.selfTitled ?? false,
        schema: {},
        agentHint: "",
        empty: {},
        Component,
      };
      return def;
    })
    .filter((s): s is SectionDef => s !== null);
  return { type: base.type, sections };
}
