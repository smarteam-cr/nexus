/**
 * lib/business-cases/case-types.ts
 *
 * Catálogo de TIPOS de business case (server+client safe: sin React ni Prisma).
 * El tipo se elige al crear el BC y determina el template de landing y los tags
 * iniciales (slugs del catálogo existente en lib/tags/catalog.ts — NO taxonomía nueva).
 *
 * `BusinessCase.caseType` guarda el slug como String? nullable (NO enum Prisma:
 * agregar un tipo futuro = 1 línea acá, sin migración; un valor desconocido en DB
 * nunca rompe porque resolveBcType() degrada al default). `null` = implementación
 * de HubSpot (todos los BCs legacy y el default del stepper).
 */

export interface BcTypeDef {
  id: string;
  label: string;
  shortLabel: string;   // badge en listados/header
  description: string;  // card del stepper
  templateId: string;   // → BC_TEMPLATES (components/landing/configs/templates.defs.ts)
  defaultTags: string[]; // seeds editables después por el CSE (TagsStrip)
  subtypes?: { id: string; label: string; extraTags?: string[] }[];
  /** false = visible pero deshabilitado en el stepper ("próximamente"). */
  enabled: boolean;
}

export const HUBSPOT_TEMPLATE_ID = "hubspot_v1";
export const WEBSITE_TEMPLATE_ID = "website_v1";

export const DEFAULT_BC_TYPE_ID = "hubspot_implementation";

export const BC_TYPE_CATALOG: BcTypeDef[] = [
  {
    id: "hubspot_implementation",
    label: "Implementación de HubSpot",
    shortLabel: "HubSpot",
    description: "Caso de negocio para una implementación de HubSpot (hubs, integraciones, onboarding).",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: [], // idéntico a hoy: el flujo default no siembra tags
    enabled: true,
  },
  {
    id: "insider_implementation",
    label: "Implementación de Insider",
    shortLabel: "Insider",
    description: "Caso de negocio para una implementación de Insider (personalización y engagement).",
    templateId: HUBSPOT_TEMPLATE_ID, // gancho: template propio a futuro
    defaultTags: ["insider_one"],
    enabled: false, // próximamente (sin template propio todavía)
  },
  {
    id: "website",
    label: "Sitio web",
    shortLabel: "Sitio web",
    description: "Propuesta de diseño y desarrollo de sitio web (Content Hub).",
    templateId: WEBSITE_TEMPLATE_ID,
    defaultTags: ["content_hub"],
    subtypes: [
      { id: "informativo", label: "Informativo" },
      { id: "ecommerce", label: "E-commerce", extraTags: ["commerce_hub"] },
    ],
    enabled: true,
  },
  {
    id: "integration",
    label: "Integración",
    shortLabel: "Integración",
    description: "Caso de negocio centrado en integrar sistemas (ERP, WhatsApp, plataformas existentes).",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: ["custom_dev"],
    enabled: true,
  },
  {
    id: "custom_dev",
    label: "Desarrollo a la medida",
    shortLabel: "Desarrollo",
    description: "Caso de negocio para un desarrollo a la medida sobre o alrededor del CRM.",
    templateId: HUBSPOT_TEMPLATE_ID,
    defaultTags: ["custom_dev"],
    enabled: true,
  },
];

const BY_ID: Record<string, BcTypeDef> = Object.fromEntries(BC_TYPE_CATALOG.map((t) => [t.id, t]));

/** Resolución TOLERANTE: null/desconocido → tipo default (implementación HubSpot).
 *  Para validar input del usuario usá `bcTypeOrNull` (estricta). */
export function resolveBcType(raw: string | null | undefined): BcTypeDef {
  return (raw && BY_ID[raw]) || BY_ID[DEFAULT_BC_TYPE_ID];
}

/** Resolución ESTRICTA para validar input (create): desconocido → null (→ 400). */
export function bcTypeOrNull(raw: string | null | undefined): BcTypeDef | null {
  return (raw && BY_ID[raw]) || null;
}

/** Tags seed para un tipo (+ extras del sub-tipo si aplica). */
export function seedTagsFor(type: BcTypeDef, subtypeId?: string | null): string[] {
  const sub = subtypeId ? type.subtypes?.find((s) => s.id === subtypeId) : undefined;
  return [...type.defaultTags, ...(sub?.extraTags ?? [])];
}
