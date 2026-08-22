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
import { esCustomKey, HTML_EMBED_TYPE } from "@/lib/landing/custom-sections";
import { customDef, TABLA_TYPE } from "@/lib/landing/catalogo-de-secciones";
import { TablaSection } from "../sections-tabla";
import {
  KickoffProseSection,
  KickoffComparaSection,
} from "@/components/canvas/kickoff-sections/KickoffSections";
import { HtmlEmbedSection } from "../sections-custom";
import {
  HeroSection,
  PainSection,
  BeforeAfterSection,
  RoiSection,
  PlanSection,
  PartnerSection,
  CtaSection,
} from "../sections";
import { TechArchitectureSection, ProcessMappingSection, UseCasesSection } from "../sections-shared";
import { DiagramSection } from "../sections-diagram";
import { HubsClienteSection } from "../sections-hubs";
import {
  WebDiagnosisSection,
  SiteArchitectureSection,
  WebScopeSection,
  WebMethodologySection,
  InvestmentSection,
  WhyUsSection,
} from "../sections-website";

/** Renderers por sectionType. Las 9 entradas históricas usan la key como type
 *  (BCSectionDef.sectionType ausente = la key). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_COMPONENTS: Record<string, FC<SectionProps<any>>> = {
  hero: HeroSection,
  dolores: PainSection,
  antes_despues: BeforeAfterSection,
  // La sección "Qué se implementa" cambia de renderer SIN declarar un `sectionType`
  // nuevo: la key `solucion` sigue viva, así que `configForSnapshot` la resuelve contra
  // esta config y lo YA PUBLICADO estrena el componente nuevo. Por eso HubsClienteSection
  // lleva adentro la rama legacy de los 4 campos. Cero churn en registry.test.
  solucion: HubsClienteSection,
  roi: RoiSection,
  cronograma: PlanSection,
  // ⚠ `inversion` y `web_investment` son EL MISMO componente desde la unificación
  // (2026-08-12): antes eran dos secciones distintas bajo la misma key `inversion`, y la de
  // HubSpot no tenía total. Apuntar los dos types acá —en vez de renombrar una key— deja el
  // snapshot de `registry.test.ts` intacto y hace que los `sectionType` congelados de
  // cualquier snapshot viejo sigan resolviendo. La rama legacy de HubSpot vive adentro.
  inversion: InvestmentSection,
  partner: PartnerSection,
  cta: CtaSection,
  // Compartidas entre templates
  tech_architecture: TechArchitectureSection,
  process_mapping: ProcessMappingSection,
  use_cases: UseCasesSection,
  // Motor de diagramas interactivo (FlowchartViewer como sección) — cualquier
  // template puede declarar sectionType "diagram"; la conversión lazy cubre
  // la data vieja de tech_architecture.
  diagram: DiagramSection,
  // Template sitio web (la Portada reusa "hero"; la sección 4 reusa "tech_architecture")
  web_diagnosis: WebDiagnosisSection,
  site_architecture: SiteArchitectureSection,
  web_scope: WebScopeSection,
  web_methodology: WebMethodologySection,
  web_investment: InvestmentSection,
  why_us: WhyUsSection,
  // Sección personalizada: NINGÚN template la declara — la crea el vendedor en runtime y
  // el resolver la sintetiza desde la key (`custom:*`). Por eso `registry.test.ts` la
  // excluye del chequeo de huérfanos con un set aparte.
  [HTML_EMBED_TYPE]: HtmlEmbedSection,
  /* ⚠ Los tipos CREABLES entran también acá, y no es redundante: el snapshot publicado del
     business case se resuelve contra ESTE mapa (`configForSnapshot`). Sin ellos, una tabla creada
     en una propuesta se vería en el editor y desaparecería en la que abre el prospecto. */
  [TABLA_TYPE]: TablaSection,
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
    tip: d.tip,
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
    chips: d.chips,
    invest: d.invest,
    compara: d.compara,
    empty: d.empty,
    Component,
  };
}

/**
 * ⭐ LOS RENDERERS DE LAS SECCIONES QUE SE PUEDEN CREAR EN RUNTIME, EN UN SOLO MAPA.
 *
 * Ninguna plantilla los declara —la sección no existe hasta que alguien la crea— así que no
 * pueden salir del mapa de un documento. Y tienen que ser LOS MISMOS en los ocho: si el catálogo
 * de creables dependiera del documento, «crear una tabla» significaría cosas distintas según dónde
 * estés parado, que es justo lo contrario de lo que se pidió.
 *
 * ⚠ `registry.test.ts` los excluye del chequeo de huérfanos con `RUNTIME_SECTION_TYPES` — un
 * renderer acá que ninguna def declare NO es un error, es la definición de "creable".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COMPONENTES_CREABLES: Record<string, FC<SectionProps<any>>> = {
  [HTML_EMBED_TYPE]: HtmlEmbedSection,
  /* La tabla genérica: el único tipo del catálogo que ninguna plantilla declara, porque se
     construyó para esto. Los demás (prosa, métricas, comparación, procesos, diagrama) ya viven en
     los mapas de sus documentos y se resuelven por ahí. */
  [TABLA_TYPE]: TablaSection,
  kickoff_prose: KickoffProseSection,
  kickoff_compara: KickoffComparaSection,
  roi: RoiSection,
  process_mapping: ProcessMappingSection,
  diagram: DiagramSection,
};

/**
 * La def de una sección CREADA EN RUNTIME, lista para el motor. Es lo que `LandingShape.sintetizar`
 * espera, y lo que hace que una `custom:*` se pinte igual en los ocho documentos y en el PDF.
 *
 * `null` si la key no es de una sección creada, o si su tipo no tiene renderer — el mismo criterio
 * de `toSectionDef`: antes omitir la sección que reventar el render del cliente.
 */
export function sintetizarSeccionCreada(key: string, label?: string | null): SectionDef | null {
  if (!esCustomKey(key)) return null;
  return toSectionDef(customDef(key, label), COMPONENTES_CREABLES);
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

/**
 * Config de UN canvas: la plantilla RECORTADA a las secciones que existen, EN SU ORDEN, y
 * con las secciones personalizadas (`custom:*`) sintetizadas.
 *
 * El recorte estaba escrito dos veces —el editor y el render de impresión, con el segundo
 * documentando que era copia del primero— y las dos copias fallaban igual: la sección que
 * no matchea se cae del `filter` sin error, sin log y sin poner roja la suite. Con las
 * personalizadas eso pasaría de una molestia a lo peor posible: el vendedor la ve en el
 * editor y falta en el PDF que le mandó al prospecto.
 *
 * `rows` vacío devuelve la plantilla ENTERA, que es el comportamiento histórico de los dos:
 * en la ventana de carga (y en un documento recién creado) mostrar una config vacía
 * escondería la Plantilla completa.
 */
export function configForCanvas(
  templateId: string | null | undefined,
  rows: Array<{ key: string; label?: string | null }>,
): LandingConfig {
  const base = landingConfigFor(templateId);
  if (!rows.length) return base;
  const porKey = new Map(base.sections.map((d) => [d.key, d]));
  const sections = rows
    .map((r) => porKey.get(r.key) ?? (esCustomKey(r.key) ? toSectionDef(customDef(r.key, r.label)) : null))
    .filter((d): d is SectionDef => d !== null);
  return sections.length ? { ...base, sections } : base;
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
