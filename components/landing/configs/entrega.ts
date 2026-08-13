/**
 * components/landing/configs/entrega.ts
 *
 * Lado CLIENT del registry del canvas "Entrega". Las defs server-safe viven en
 * `entrega.defs.ts`.
 *
 * UN solo componente propio (`impacto_declarado`) y ocho reusados del catálogo: el hero y el
 * ROI del business case, la sección de Hubs, el mapeo de procesos y la prosa/CTA del kickoff.
 * Que la entrega salga casi entera de piezas que ya existían no es economía: es lo que hace
 * que se vea como el resto del sistema desde el primer día.
 *
 * ⚠ `toSectionDef` devuelve `null` cuando el `sectionType` no está en este mapa, y la sección
 * DESAPARECE del documento sin error. Por eso `lib/landing/registry.test.ts` congela que cada
 * `sectionType` declarado tenga su componente.
 */
import type { FC } from "react";
import type { LandingConfig, SectionDef, SectionProps } from "../types";
import { ENTREGA_SECTION_DEFS } from "./entrega.defs";
import { toSectionDef } from "./templates";
import { HeroSection, RoiSection } from "../sections";
import { ProcessMappingSection } from "../sections-shared";
import { HubsClienteSection } from "../sections-hubs";
import { ImpactoSection } from "../sections-impacto";
import { KickoffProseSection, KickoffCtaSection } from "@/components/canvas/kickoff-sections/KickoffSections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENTREGA_SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  hero: HeroSection,
  process_mapping: ProcessMappingSection,
  hubs_cliente: HubsClienteSection,
  kickoff_prose: KickoffProseSection,
  // Los números del cumplimiento: misma grilla de métricas del business case. Los escribe el
  // runner desde el cronograma, no el agente (ver entrega.defs.ts).
  roi: RoiSection,
  // El único propio: un dicho del cliente no es una métrica — lleva cita y atribución.
  impacto_declarado: ImpactoSection,
  entrega_cta: KickoffCtaSection,
};

const ENTREGA_LANDING_CONFIG: LandingConfig = {
  type: "entrega",
  sections: ENTREGA_SECTION_DEFS.map((d) => toSectionDef(d, ENTREGA_SECTION_COMPONENTS)).filter(
    (s): s is SectionDef => s !== null,
  ),
};

/** Config completa del canvas Entrega (orden canónico). */
export function landingConfigForEntrega(): LandingConfig {
  return ENTREGA_LANDING_CONFIG;
}
