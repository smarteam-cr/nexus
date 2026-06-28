/**
 * components/landing/configs/business-case.ts
 *
 * LandingConfig del BUSINESS CASE: ata cada metadato de sección (server-safe, en
 * business-case.defs.ts) con su componente client. La usa el motor (render/edición).
 * El agente (server) NO importa esto: importa business-case.defs.ts directamente.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { BC_SECTION_DEFS } from "./business-case.defs";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENT_BY_KEY: Record<string, FC<SectionProps<any>>> = {
  hero: HeroSection,
  dolores: PainSection,
  antes_despues: BeforeAfterSection,
  solucion: SolutionSection,
  roi: RoiSection,
  cronograma: PlanSection,
  inversion: InvestmentSection,
  partner: PartnerSection,
  cta: CtaSection,
};

export const BUSINESS_CASE_LANDING: LandingConfig = {
  type: "business-case",
  sections: BC_SECTION_DEFS.map<SectionDef>((d) => ({
    key: d.key,
    label: d.label,
    eyebrow: d.eyebrow,
    theme: d.theme,
    backdrop: d.backdrop,
    selfTitled: d.selfTitled,
    schema: d.schema,
    agentHint: d.agentHint,
    brief: d.brief,
    empty: d.empty,
    Component: COMPONENT_BY_KEY[d.key],
  })),
};

/** Lookup rápido por key (lo usa el motor). */
export const BC_SECTION_BY_KEY: Record<string, SectionDef> = Object.fromEntries(
  BUSINESS_CASE_LANDING.sections.map((s) => [s.key, s]),
);
